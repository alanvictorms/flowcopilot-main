"""
Orquestrador Contínuo e Durável (Camada 2 · item 13 do roadmap).

Ciclo automático por usuário, sem depender de clique:
  1. Sincroniza o Hub de Dados (com throttle);
  2. Roda pós-verificações vencidas (mantém/reverte ações);
  3. Checa congelamento por incidente (Safety Guardian);
  4. Avalia regras contra o histórico próprio (com cooldown e comparação
     de períodos) e converte matches em ActionPlans no Control Plane;
  5. Proteção financeira: stop-loss diário e runaway de gasto sem conversão.

Nenhuma ação vai direto pra Meta — tudo passa pelo Control Plane.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user, decrypt_str
from services.meta_client import MetaClient, MetaAPIError
from services.rules_engine import evaluate_rule, rule_in_cooldown, window_to_days
from services import data_hub, control_plane
from services.activity import consolidate_user_profile
from routes.autonomy import load_autonomy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/automation", tags=["automation"])

INTERVAL_SECONDS = 1800     # ciclo a cada 30 min
SYNC_EVERY_HOURS = 6        # sincronização do hub no máximo a cada 6h


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


async def _phase_sync(db, user_id, client) -> dict:
    fresh = await data_hub.data_freshness(db, user_id)
    hours = fresh.get("hours_since_sync")
    if fresh.get("synced") and hours is not None and hours < SYNC_EVERY_HOURS:
        return {"skipped": True, "hours_since_sync": hours}
    try:
        result = await data_hub.sync_user(db, user_id, client)
        return {"skipped": False, "upserted": result.get("upserted"), "errors": result.get("errors")}
    except MetaAPIError as e:
        return {"skipped": False, "error": str(e.detail)[:300]}


async def _phase_freeze_check(db, user_id) -> dict:
    """Incidente crítico nas últimas 24h congela ações não essenciais (só permite pausar)."""
    day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    scan = await db.safety_scans.find_one(
        {"user_id": user_id, "scanned_at": {"$gte": day_ago}},
        sort=[("scanned_at", -1)],
    )
    freeze = bool(scan and scan.get("should_freeze_automation"))
    return {"freeze_non_essential": freeze,
            "last_scan_at": (scan or {}).get("scanned_at")}


async def _phase_rules(db, user_id, autonomy, client, freeze: bool) -> list[dict]:
    rules = await db.automation_rules.find({"user_id": user_id, "enabled": True}).to_list(200)
    executed = []
    for rule in rules:
        try:
            if rule_in_cooldown(rule):
                executed.append({"rule_id": rule.get("id"), "rule_name": rule.get("name"),
                                 "skipped": "cooldown"})
                continue
            scope = rule.get("scope", "campaign")
            days = window_to_days(rule.get("window", "last_7d"))
            rows = await data_hub.window_rows(db, user_id, level=scope, days=days)
            needs_prev = any(c.get("compare_to") == "previous_period"
                             for c in rule.get("conditions", []))
            prev_rows = await data_hub.window_rows(db, user_id, level=scope, days=days,
                                                   offset_days=days) if needs_prev else None
            if not rows:
                # Hub ainda vazio → fallback para a API da Meta
                rows = await client.insights(level=scope, date_preset=rule.get("window", "last_7d"))

            matches = evaluate_rule(rule, rows, prev_rows)
            action = rule.get("action") or {}
            action_type = action.get("type")
            plans = []

            if action_type == "notify":
                if matches:
                    await db.optimization_events.insert_one({
                        "user_id": user_id, "kind": "rule_notify", "rule_id": rule.get("id"),
                        "rule_name": rule.get("name"), "matches": matches, "created_at": _now(),
                    })
            else:
                for m in matches:
                    if freeze and action_type != "pause":
                        plans.append({"target_id": m["target_id"], "skipped": "frozen_by_incident"})
                        continue
                    change_pct = _f((action.get("params") or {}).get("change_pct"))
                    plan = await control_plane.propose(
                        db, user_id, autonomy,
                        source="rule", source_ref=rule.get("id") or "",
                        action_type=action_type,
                        target_type=scope,
                        target_id=m["target_id"],
                        target_name=m.get("target_name") or "",
                        change_pct=change_pct if action_type == "change_budget" else 0.0,
                        reason=(f"Regra '{rule.get('name')}' disparou: "
                                + ", ".join(f"{k}={v}" for k, v in (m.get("metrics_snapshot") or {}).items())),
                        evidence_metrics=m.get("evidence_metrics") or {},
                        expected_impact=f"Ação automática da regra '{rule.get('name')}'",
                    )
                    if plan.get("status") == control_plane.AUTHORIZED:
                        result = await control_plane.execute(db, user_id, plan, client, actor="rule")
                        plan["execution"] = result
                    plans.append({"target_id": m["target_id"], "plan_id": plan.get("id"),
                                  "status": plan.get("status"),
                                  "deduplicated": plan.get("deduplicated", False)})

            if matches:
                await db.automation_rules.update_one(
                    {"id": rule.get("id"), "user_id": user_id},
                    {"$set": {"last_fired_at": _now()}},
                )
            executed.append({"rule_id": rule.get("id"), "rule_name": rule.get("name"),
                             "matched": len(matches), "plans": plans})
        except MetaAPIError as e:
            executed.append({"rule_id": rule.get("id"), "error": str(e.detail)[:200]})
        except Exception as e:
            logger.exception("rule cycle failed")
            executed.append({"rule_id": rule.get("id"), "error": str(e)[:200]})
    return executed


async def _phase_budget_guard(db, user_id, autonomy, client) -> dict:
    """Stop-loss diário + detecção de runaway (gasto sem nenhuma conversão)."""
    rows_today = await data_hub.window_rows(db, user_id, level="campaign", days=1)
    spend_today = sum(_f(r.get("spend")) for r in rows_today)
    proposals = []

    stop_loss = _f(autonomy.get("stop_loss_daily_spend"))
    if stop_loss > 0 and spend_today > stop_loss:
        top = sorted(rows_today, key=lambda r: -_f(r.get("spend")))[:3]
        for r in top:
            plan = await control_plane.propose(
                db, user_id, autonomy,
                source="system", source_ref="stop_loss_daily",
                action_type="pause", target_type="campaign",
                target_id=r["object_id"], target_name=r.get("object_name") or "",
                reason=(f"Stop-loss diário: conta gastou R${spend_today:.2f} hoje "
                        f"(limite R${stop_loss:.2f}). Pausando maiores gastadoras."),
                evidence_metrics={k: r.get(k) for k in ("spend", "impressions", "clicks", "purchases", "leads")},
                expected_impact="Conter gasto acima do stop-loss diário.",
            )
            if plan.get("status") == control_plane.AUTHORIZED:
                plan["execution"] = await control_plane.execute(db, user_id, plan, client, actor="system")
            proposals.append({"target_id": r["object_id"], "plan_id": plan.get("id"),
                              "status": plan.get("status"), "trigger": "stop_loss_daily"})

    runaway_limit = _f(autonomy.get("stop_loss_zero_conversion_spend"))
    if runaway_limit > 0:
        for r in rows_today:
            if (_f(r.get("spend")) > runaway_limit
                    and _f(r.get("purchases")) == 0 and _f(r.get("leads")) == 0):
                plan = await control_plane.propose(
                    db, user_id, autonomy,
                    source="system", source_ref="runaway_zero_conversion",
                    action_type="pause", target_type="campaign",
                    target_id=r["object_id"], target_name=r.get("object_name") or "",
                    reason=(f"Runaway: R${_f(r.get('spend')):.2f} gastos hoje sem nenhuma "
                            f"conversão (limite R${runaway_limit:.2f})."),
                    evidence_metrics={k: r.get(k) for k in ("spend", "impressions", "clicks", "purchases", "leads")},
                    expected_impact="Cortar desperdício de campanha sem conversões.",
                )
                if plan.get("status") == control_plane.AUTHORIZED:
                    plan["execution"] = await control_plane.execute(db, user_id, plan, client, actor="system")
                proposals.append({"target_id": r["object_id"], "plan_id": plan.get("id"),
                                  "status": plan.get("status"), "trigger": "runaway_zero_conversion"})

    return {"spend_today": round(spend_today, 2), "proposals": proposals}


async def _run_user_cycle(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    autonomy = await load_autonomy(db, user_id)
    if autonomy.get("kill_switch"):
        return {"skipped": True, "reason": "kill_switch"}

    settings = await db.meta_settings.find_one({"user_id": user_id})
    if not settings or not settings.get("access_token_enc"):
        return {"skipped": True, "reason": "no_meta"}

    client = MetaClient(decrypt_str(settings["access_token_enc"]), settings["ad_account_id"])
    phases = {}

    phases["sync"] = await _phase_sync(db, user_id, client)

    try:
        verifications = await control_plane.run_due_verifications(db, user_id, client)
        phases["verifications"] = {"count": len(verifications), "results": verifications}
    except Exception as e:
        logger.exception("verifications failed")
        phases["verifications"] = {"error": str(e)[:200]}

    # Varredura de integridade do tracking (incidente crítico congela otimizações)
    try:
        from services import tracking_monitor
        scan = await tracking_monitor.run_scan(db, user_id)
        phases["tracking"] = {"new_incidents": len(scan["new_incidents"]),
                              "open_incidents": scan["open_incidents"]}
    except Exception as e:
        logger.exception("tracking scan failed")
        phases["tracking"] = {"error": str(e)[:200]}

    freeze_info = await _phase_freeze_check(db, user_id)
    phases["freeze"] = freeze_info

    phases["rules"] = await _phase_rules(db, user_id, autonomy, client,
                                         freeze_info["freeze_non_essential"])

    try:
        phases["budget_guard"] = await _phase_budget_guard(db, user_id, autonomy, client)
    except Exception as e:
        logger.exception("budget guard failed")
        phases["budget_guard"] = {"error": str(e)[:200]}

    # Consolidação da memória de atividade → perfil do agente (a cada 24h)
    try:
        profile = await consolidate_user_profile(db, user_id)
        phases["consolidation"] = {"updated": profile is not None}
    except Exception as e:
        logger.exception("consolidation failed")
        phases["consolidation"] = {"error": str(e)[:200]}

    return {"skipped": False, "phases": phases, "mode": autonomy.get("mode"), "at": _now()}


async def automation_loop(db: AsyncIOMotorDatabase):
    logger.info(f"Orquestrador iniciado · intervalo={INTERVAL_SECONDS}s")
    while True:
        try:
            users = await db.users.find({}, {"id": 1}).to_list(500)
            for u in users:
                try:
                    res = await _run_user_cycle(db, u["id"])
                except Exception:
                    logger.exception(f"cycle failed for user {u['id']}")
                    res = {"skipped": True, "reason": "cycle_error"}
                await db.automation_runs.insert_one({
                    "user_id": u["id"], "result": res, "created_at": _now(),
                })
        except Exception:
            logger.exception("automation loop error")
        await asyncio.sleep(INTERVAL_SECONDS)


@router.get("/status")
async def status(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    autonomy = await load_autonomy(db, user["id"])
    last = await db.automation_runs.find_one({"user_id": user["id"]}, sort=[("created_at", -1)])
    count = await db.automation_runs.count_documents({"user_id": user["id"]})
    pending = await db.action_plans.count_documents(
        {"user_id": user["id"], "status": control_plane.PENDING})
    return {
        "kill_switch": autonomy.get("kill_switch", False),
        "mode": autonomy.get("mode", "recommend"),
        "last_run_at": (last or {}).get("created_at"),
        "last_result": (last or {}).get("result"),
        "total_runs": count,
        "pending_approvals": pending,
        "interval_seconds": INTERVAL_SECONDS,
    }


@router.post("/run-now")
async def run_now(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await _run_user_cycle(db, user["id"])
    await db.automation_runs.insert_one({
        "user_id": user["id"], "result": res, "manual": True, "created_at": _now(),
    })
    return res


@router.get("/history")
async def history(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.automation_runs.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(30)
    return [d async for d in cur]
