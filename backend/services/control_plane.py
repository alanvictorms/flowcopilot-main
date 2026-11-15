"""
Autonomy Control Plane (Camada 2 · item 10 do roadmap).

Camada central OBRIGATÓRIA: toda alteração (IA, regra ou usuário) vira um
ActionPlan estruturado, passa por um comitê de validadores determinísticos
(kill switch, política, financeiro, risco/cooldown/conflito, estatística) e
só então é autorizada, enfileirada para aprovação humana ou bloqueada.

A execução grava snapshot antes/depois, escreve no Decision Ledger
(append-only) e agenda pós-verificação com condição de rollback.
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from services.meta_client import MetaClient, MetaAPIError
from services import data_hub, stats_engine

logger = logging.getLogger(__name__)

# Status possíveis de um ActionPlan
PENDING = "pending_approval"
AUTHORIZED = "authorized"
EXECUTED = "executed"
REJECTED = "rejected"
BLOCKED = "blocked"
FAILED = "failed"
VERIFIED_KEPT = "verified_kept"
ROLLED_BACK = "verified_rolled_back"

ACTION_TYPES = ("pause", "activate", "change_budget")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


def assess_risk(action_type: str, change_pct: float = 0.0) -> str:
    """Risco base da ação — pausar perde entrega (médio), ativar/gastar mais é maior."""
    if action_type == "pause":
        return "low" if change_pct == 0 else "medium"
    if action_type == "activate":
        return "medium"
    if action_type == "change_budget":
        mag = abs(change_pct)
        if mag <= 20:
            return "low"
        if mag <= 40:
            return "medium"
        return "high"
    return "high"


async def _ledger_write(db: AsyncIOMotorDatabase, user_id: str, entry: dict) -> str:
    """Escrita append-only no Decision Ledger. Nunca é alterada nem excluída."""
    entry = dict(entry)
    entry["id"] = str(uuid.uuid4())
    entry["user_id"] = user_id
    entry["created_at"] = _now()
    await db.decision_ledger.insert_one({**entry})
    return entry["id"]


# ------------------------------------------------------------- validação ---

async def _validate(db: AsyncIOMotorDatabase, user_id: str, plan: dict, autonomy: dict) -> dict:
    """
    Comitê de validadores. Cada "agente" dá um parecer independente;
    o consolidado decide autorizar, pedir aprovação ou bloquear.
    """
    opinions = {}
    hard_blocks = []
    needs_approval = []

    action_type = plan["action_type"]
    change_pct = _f(plan.get("change_pct"))

    # --- Agente guardião: kill switch -----------------------------------
    ks = bool(autonomy.get("kill_switch"))
    opinions["guardian"] = {
        "ok": not ks,
        "detail_pt": "Kill switch acionado — toda automação congelada." if ks else "Kill switch desligado.",
    }
    if ks:
        hard_blocks.append("kill_switch")

    # --- Agente de política: tipo de ação permitido ---------------------
    allowed = autonomy.get("allowed_actions") or []
    require_approval = autonomy.get("require_approval_actions") or []
    type_ok = action_type in ACTION_TYPES
    opinions["policy"] = {
        "ok": type_ok,
        "allowed_for_auto": action_type in allowed,
        "requires_approval_by_config": action_type in require_approval,
        "detail_pt": (
            f"Ação '{action_type}' reconhecida." if type_ok else f"Ação '{action_type}' desconhecida — rejeitada."
        ),
    }
    if not type_ok:
        hard_blocks.append("unknown_action_type")
    if action_type in require_approval:
        needs_approval.append("config_requires_approval")

    # --- Agente financeiro: limites de variação e teto de ações ----------
    max_inc = _f(autonomy.get("max_budget_increase_pct") or 30)
    max_dec = _f(autonomy.get("max_budget_decrease_pct") or 50)
    approval_threshold = _f(autonomy.get("approval_budget_change_pct") or 25)
    fin_ok, fin_detail = True, "Sem impacto financeiro direto."
    if action_type == "change_budget":
        if change_pct > max_inc:
            fin_ok = False
            fin_detail = f"Aumento de {change_pct:.0f}% excede o limite de {max_inc:.0f}%."
        elif change_pct < -max_dec:
            fin_ok = False
            fin_detail = f"Redução de {abs(change_pct):.0f}% excede o limite de {max_dec:.0f}%."
        else:
            fin_detail = f"Variação de {change_pct:+.0f}% dentro dos limites (+{max_inc:.0f}%/-{max_dec:.0f}%)."
            if abs(change_pct) > approval_threshold:
                needs_approval.append("budget_change_above_approval_threshold")
                fin_detail += f" Acima de {approval_threshold:.0f}% exige aprovação humana."
    # Teto de ações executadas nas últimas 24h
    day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    max_actions = int(autonomy.get("max_actions_per_day") or 20)
    executed_24h = await db.action_plans.count_documents({
        "user_id": user_id, "status": {"$in": [EXECUTED, VERIFIED_KEPT, ROLLED_BACK]},
        "executed_at": {"$gte": day_ago},
    })
    if executed_24h >= max_actions:
        fin_ok = False
        fin_detail += f" Teto de {max_actions} ações/24h atingido ({executed_24h})."
        hard_blocks.append("daily_action_cap")
    opinions["finance"] = {"ok": fin_ok, "executed_24h": executed_24h,
                           "max_actions_per_day": max_actions, "detail_pt": fin_detail}
    if not fin_ok and "daily_action_cap" not in hard_blocks:
        hard_blocks.append("budget_limit_exceeded")

    # --- Agente de risco: cooldown e conflitos ---------------------------
    cooldown_min = int(autonomy.get("cooldown_minutes") or 60)
    cooldown_since = (datetime.now(timezone.utc) - timedelta(minutes=cooldown_min)).isoformat()
    recent_on_target = await db.action_plans.find_one({
        "user_id": user_id, "target_id": plan["target_id"],
        "status": {"$in": [EXECUTED, VERIFIED_KEPT, ROLLED_BACK]},
        "executed_at": {"$gte": cooldown_since},
    })
    opposite = {"pause": "activate", "activate": "pause"}.get(action_type)
    conflicting = None
    if opposite:
        conflicting = await db.action_plans.find_one({
            "user_id": user_id, "target_id": plan["target_id"],
            "action_type": opposite, "status": {"$in": [PENDING, AUTHORIZED]},
        })
    risk_ok = recent_on_target is None and conflicting is None
    details = []
    if recent_on_target:
        details.append(f"Alvo alterado há menos de {cooldown_min}min (cooldown ativo).")
        hard_blocks.append("cooldown_active")
    if conflicting:
        details.append(f"Existe ação conflitante ({opposite}) pendente para o mesmo alvo.")
        hard_blocks.append("conflicting_action")
    opinions["risk"] = {
        "ok": risk_ok,
        "cooldown_minutes": cooldown_min,
        "detail_pt": " ".join(details) or "Sem cooldown ativo nem conflitos.",
    }

    # --- Agente estatístico: evidência suficiente? ------------------------
    risk_level = plan.get("risk") or assess_risk(action_type, change_pct)
    min_points = int(autonomy.get("min_data_points") or 100)
    ev = plan.get("evidence_metrics") or {}
    metric = (plan.get("rollback_condition") or {}).get("metric") or "cpa"
    baseline = await data_hub.get_baseline(
        db, user_id, plan["target_id"], metric=metric, level=plan["target_type"]
    )
    series = await data_hub.get_series(
        db, user_id, plan["target_id"], metric=metric, days=14, level=plan["target_type"]
    )
    gate = stats_engine.decision_gate(
        impressions=_f(ev.get("impressions")),
        clicks=_f(ev.get("clicks")),
        conversions=_f(ev.get("purchases") or ev.get("conversions") or ev.get("leads")),
        min_impressions=max(min_points, 100),
        min_clicks=max(int(min_points / 30), 10),
        min_conversions=int(autonomy.get("min_conversions") or 5),
        metric_current=_f(ev.get(metric)) if ev.get(metric) is not None else None,
        metric_baseline=baseline or None,
        daily_series=[p["value"] for p in series],
        action_risk=risk_level,
    )
    opinions["statistics"] = {
        "ok": gate["allowed"],
        "confidence": gate["confidence"],
        "detail_pt": gate["explanation_pt"],
    }
    if not gate["allowed"]:
        # Estatística insuficiente não bloqueia definitivamente: exige humano
        needs_approval.append("insufficient_statistical_evidence")

    # --- Consolidação -----------------------------------------------------
    mode = autonomy.get("mode", "recommend")
    if hard_blocks:
        verdict = BLOCKED
    elif mode == "recommend":
        verdict = PENDING
    elif mode == "approve":
        verdict = PENDING
    elif mode == "auto":
        if needs_approval or action_type not in allowed:
            verdict = PENDING
        else:
            verdict = AUTHORIZED
    else:
        verdict = PENDING

    return {
        "verdict": verdict,
        "opinions": opinions,
        "hard_blocks": hard_blocks,
        "needs_approval_reasons": needs_approval,
        "confidence": gate["confidence"],
        "mode": mode,
        "validated_at": _now(),
    }


# --------------------------------------------------------------- propose ---

async def propose(
    db: AsyncIOMotorDatabase,
    user_id: str,
    autonomy: dict,
    *,
    source: str,                    # rule | ai | user | system
    source_ref: str = "",
    action_type: str,
    target_type: str,               # campaign | adset | ad
    target_id: str,
    target_name: str = "",
    proposed_state: Optional[dict] = None,
    change_pct: float = 0.0,
    reason: str = "",
    evidence_metrics: Optional[dict] = None,
    expected_impact: str = "",
    observation_hours: Optional[int] = None,
    rollback_condition: Optional[dict] = None,
) -> dict:
    """Registra um ActionPlan, valida no comitê e devolve o plano com veredito."""
    risk = assess_risk(action_type, change_pct)
    plan = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "source": source,
        "source_ref": source_ref,
        "action_type": action_type,
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name,
        "proposed_state": proposed_state or {},
        "change_pct": change_pct,
        "reason": reason,
        "evidence_metrics": evidence_metrics or {},
        "expected_impact": expected_impact,
        "risk": risk,
        "observation_hours": int(observation_hours or autonomy.get("observation_hours") or 24),
        "rollback_condition": rollback_condition or {
            "metric": "cpa", "direction": "increase",
            "threshold_pct": _f(autonomy.get("rollback_degradation_pct") or 30),
        },
        "created_at": _now(),
    }

    # Deduplicação: plano idêntico pendente para o mesmo alvo
    dup = await db.action_plans.find_one({
        "user_id": user_id, "target_id": target_id, "action_type": action_type,
        "status": {"$in": [PENDING, AUTHORIZED]},
    })
    if dup:
        return {**{k: v for k, v in dup.items() if k not in ("_id", "user_id")},
                "duplicate_of": dup["id"], "deduplicated": True}

    validation = await _validate(db, user_id, plan, autonomy)
    plan["validation"] = validation
    plan["confidence"] = validation["confidence"]
    plan["status"] = validation["verdict"]
    await db.action_plans.insert_one({**plan})

    if plan["status"] == BLOCKED:
        await _ledger_write(db, user_id, {
            "kind": "action_blocked", "actor": source, "plan_id": plan["id"],
            "action_type": action_type, "target_type": target_type,
            "target_id": target_id, "target_name": target_name,
            "reason": reason, "validation": validation,
        })
    plan.pop("user_id", None)
    return plan


# --------------------------------------------------------------- execute ---

def _build_patch(plan: dict, before: dict) -> dict:
    """Constrói o patch da Meta a partir do estado proposto."""
    action_type = plan["action_type"]
    if action_type == "pause":
        return {"status": "PAUSED"}
    if action_type == "activate":
        return {"status": "ACTIVE"}
    if action_type == "change_budget":
        proposed = plan.get("proposed_state") or {}
        if proposed.get("daily_budget"):
            return {"daily_budget": int(proposed["daily_budget"])}
        current = int(_f(before.get("daily_budget")))
        if current and plan.get("change_pct"):
            new_budget = max(int(current * (1 + _f(plan["change_pct"]) / 100.0)), 100)
            return {"daily_budget": new_budget}
    return {}


async def execute(db: AsyncIOMotorDatabase, user_id: str, plan: dict, client: MetaClient,
                  actor: str = "system") -> dict:
    """Executa um plano AUTORIZADO: snapshot antes → patch → snapshot depois → ledger."""
    if plan.get("status") not in (AUTHORIZED, PENDING):
        raise ValueError(f"Plano em status '{plan.get('status')}' não pode ser executado")

    target_id = plan["target_id"]
    target_type = plan["target_type"]
    try:
        before = await client.get_object(target_id)
    except MetaAPIError as e:
        before = {"error": str(e.detail)[:200]}

    patch = _build_patch(plan, before)
    if not patch:
        await db.action_plans.update_one(
            {"id": plan["id"]},
            {"$set": {"status": FAILED, "error": "Patch vazio — estado proposto incompleto", "executed_at": _now()}},
        )
        return {"ok": False, "error": "empty_patch"}

    try:
        if target_type == "campaign":
            await client.update_campaign(target_id, patch)
        elif target_type == "adset":
            await client.update_adset(target_id, patch)
        elif target_type == "ad":
            await client.update_ad(target_id, patch)
        else:
            raise ValueError(f"target_type desconhecido: {target_type}")
    except (MetaAPIError, ValueError) as e:
        detail = getattr(e, "detail", str(e))
        await db.action_plans.update_one(
            {"id": plan["id"]},
            {"$set": {"status": FAILED, "error": str(detail)[:300], "executed_at": _now()}},
        )
        await _ledger_write(db, user_id, {
            "kind": "action_failed", "actor": actor, "plan_id": plan["id"],
            "action_type": plan["action_type"], "target_type": target_type,
            "target_id": target_id, "target_name": plan.get("target_name"),
            "error": str(detail)[:300],
        })
        return {"ok": False, "error": str(detail)[:300]}

    try:
        after = await client.get_object(target_id)
    except MetaAPIError:
        after = {}

    executed_at = _now()
    verify_after = (datetime.now(timezone.utc) +
                    timedelta(hours=plan.get("observation_hours") or 24)).isoformat()
    # Baseline da métrica de rollback no momento da execução
    rb = plan.get("rollback_condition") or {}
    metric = rb.get("metric") or "cpa"
    baseline_value = await data_hub.get_baseline(db, user_id, target_id, metric=metric,
                                                 level=target_type, exclude_recent_days=0)
    await db.action_plans.update_one(
        {"id": plan["id"]},
        {"$set": {
            "status": EXECUTED, "executed_at": executed_at, "executed_by": actor,
            "before_state": {k: before.get(k) for k in ("status", "effective_status", "daily_budget", "lifetime_budget", "name") if k in before},
            "after_state": {k: after.get(k) for k in ("status", "effective_status", "daily_budget", "lifetime_budget", "name") if k in after},
            "applied_patch": patch,
            "verify_after": verify_after,
            "verification_baseline": {"metric": metric, "value": baseline_value},
        }},
    )
    ledger_id = await _ledger_write(db, user_id, {
        "kind": "action_executed", "actor": actor, "source": plan.get("source"),
        "plan_id": plan["id"], "action_type": plan["action_type"],
        "target_type": target_type, "target_id": target_id,
        "target_name": plan.get("target_name"),
        "before_state": before, "after_state": after, "applied_patch": patch,
        "reason": plan.get("reason"), "evidence": plan.get("evidence_metrics"),
        "risk": plan.get("risk"), "confidence": plan.get("confidence"),
        "expected_impact": plan.get("expected_impact"),
        "validation": plan.get("validation"),
        "verify_after": verify_after,
    })
    # Compatibilidade com a tela de Rollback existente
    await db.optimization_events.insert_one({
        "id": plan["id"], "user_id": user_id, "kind": "control_plane",
        "target_type": target_type, "target_id": target_id,
        "target_name": plan.get("target_name"),
        "before_state": {k: v for k, v in before.items() if k in ("status", "daily_budget", "lifetime_budget")},
        "after_state": {k: v for k, v in after.items() if k in ("status", "daily_budget", "lifetime_budget")},
        "created_at": executed_at,
    })
    return {"ok": True, "plan_id": plan["id"], "ledger_id": ledger_id,
            "applied_patch": patch, "verify_after": verify_after}


# ---------------------------------------------------- aprovação / rejeição ---

async def approve_and_execute(db: AsyncIOMotorDatabase, user_id: str, plan_id: str,
                              client: MetaClient) -> dict:
    plan = await db.action_plans.find_one({"id": plan_id, "user_id": user_id})
    if not plan:
        raise ValueError("Plano não encontrado")
    if plan.get("status") != PENDING:
        raise ValueError(f"Plano em status '{plan.get('status')}' — só pendentes podem ser aprovados")
    await db.action_plans.update_one(
        {"id": plan_id}, {"$set": {"approved_at": _now(), "approved_by": "user"}}
    )
    return await execute(db, user_id, plan, client, actor="user")


async def reject(db: AsyncIOMotorDatabase, user_id: str, plan_id: str, justification: str) -> dict:
    plan = await db.action_plans.find_one({"id": plan_id, "user_id": user_id})
    if not plan:
        raise ValueError("Plano não encontrado")
    if plan.get("status") not in (PENDING, AUTHORIZED):
        raise ValueError("Só planos pendentes/autorizados podem ser rejeitados")
    await db.action_plans.update_one(
        {"id": plan_id},
        {"$set": {"status": REJECTED, "rejected_at": _now(), "rejection_reason": justification}},
    )
    await _ledger_write(db, user_id, {
        "kind": "action_rejected", "actor": "user", "plan_id": plan_id,
        "action_type": plan.get("action_type"), "target_type": plan.get("target_type"),
        "target_id": plan.get("target_id"), "target_name": plan.get("target_name"),
        "justification": justification,
    })
    return {"ok": True, "plan_id": plan_id}


# --------------------------------------------------------- pós-verificação ---

async def run_due_verifications(db: AsyncIOMotorDatabase, user_id: str,
                                client: MetaClient) -> list[dict]:
    """
    Verifica planos executados cuja janela de observação venceu:
    compara a métrica de rollback com o baseline e decide manter ou reverter.
    """
    now = _now()
    cur = db.action_plans.find({
        "user_id": user_id, "status": EXECUTED, "verify_after": {"$lte": now},
    })
    results = []
    async for plan in cur:
        rb = plan.get("rollback_condition") or {}
        metric = rb.get("metric") or "cpa"
        threshold = _f(rb.get("threshold_pct") or 30)
        baseline = _f((plan.get("verification_baseline") or {}).get("value"))
        current = await data_hub.get_baseline(
            db, user_id, plan["target_id"], metric=metric,
            days=max(int((plan.get("observation_hours") or 24) / 24), 1),
            exclude_recent_days=0, level=plan["target_type"],
        )
        degraded = False
        change_pct = 0.0
        if baseline > 0 and current > 0:
            change_pct = (current - baseline) / baseline * 100.0
            direction = rb.get("direction") or "increase"
            if direction == "increase":     # métrica de custo subiu = ruim
                degraded = change_pct > threshold
            else:                            # métrica de valor caiu = ruim
                degraded = change_pct < -threshold

        verification = {
            "metric": metric, "baseline": baseline, "observed": current,
            "change_pct": round(change_pct, 2), "threshold_pct": threshold,
            "degraded": degraded, "verified_at": now,
        }

        if degraded and plan.get("before_state"):
            # Rollback automático para o estado anterior
            before = plan["before_state"]
            patch = {}
            if before.get("status"):
                patch["status"] = before["status"]
            if before.get("daily_budget"):
                patch["daily_budget"] = int(_f(before["daily_budget"]))
            rolled = False
            if patch:
                try:
                    if plan["target_type"] == "campaign":
                        await client.update_campaign(plan["target_id"], patch)
                    elif plan["target_type"] == "adset":
                        await client.update_adset(plan["target_id"], patch)
                    elif plan["target_type"] == "ad":
                        await client.update_ad(plan["target_id"], patch)
                    rolled = True
                except MetaAPIError as e:
                    verification["rollback_error"] = str(e.detail)[:300]
            new_status = ROLLED_BACK if rolled else EXECUTED
            await db.action_plans.update_one(
                {"id": plan["id"]},
                {"$set": {"status": new_status, "verification": verification}},
            )
            await _ledger_write(db, user_id, {
                "kind": "action_rolled_back" if rolled else "rollback_failed",
                "actor": "system", "plan_id": plan["id"],
                "action_type": plan.get("action_type"),
                "target_type": plan.get("target_type"), "target_id": plan.get("target_id"),
                "target_name": plan.get("target_name"), "verification": verification,
            })
            if rolled:
                await db.strategy_memory.insert_one({
                    "id": str(uuid.uuid4()), "user_id": user_id, "kind": "loser",
                    "title": f"Rollback: {plan.get('action_type')} em {plan.get('target_name') or plan.get('target_id')}",
                    "detail": (f"{metric.upper()} degradou {change_pct:+.1f}% (limite {threshold:.0f}%) "
                               f"após a ação. Revertido automaticamente."),
                    "tags": ["rollback", "auto"], "metrics": verification,
                    "created_at": now,
                })
        else:
            await db.action_plans.update_one(
                {"id": plan["id"]},
                {"$set": {"status": VERIFIED_KEPT, "verification": verification}},
            )
            await _ledger_write(db, user_id, {
                "kind": "action_verified", "actor": "system", "plan_id": plan["id"],
                "action_type": plan.get("action_type"),
                "target_type": plan.get("target_type"), "target_id": plan.get("target_id"),
                "target_name": plan.get("target_name"), "verification": verification,
            })
            if baseline > 0 and abs(change_pct) > 10:
                await db.strategy_memory.insert_one({
                    "id": str(uuid.uuid4()), "user_id": user_id, "kind": "winner",
                    "title": f"Mantido: {plan.get('action_type')} em {plan.get('target_name') or plan.get('target_id')}",
                    "detail": f"{metric.upper()} variou {change_pct:+.1f}% dentro do aceitável após a ação.",
                    "tags": ["verificacao", "auto"], "metrics": verification,
                    "created_at": now,
                })
        results.append({"plan_id": plan["id"], **verification})
    return results
