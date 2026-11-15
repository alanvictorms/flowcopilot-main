"""
Memória de atividade do usuário + consolidação em perfil do agente.

Cada workspace (usuário) registra TUDO que acontece na conta — aprovações,
rejeições, regras, configurações, cadastros — em `user_activity`. A cada
24h o orquestrador consolida isso num `agent_profile`: um retrato de como
ESTE usuário opera (apetite a risco, o que costuma rejeitar, cadência),
que é injetado no contexto da IA para que o agente trabalhe cada vez mais
do jeito do dono da conta.
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

CONSOLIDATE_EVERY_HOURS = 24


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log_activity(
    db: AsyncIOMotorDatabase,
    user_id: str,
    kind: str,
    summary: str,
    data: dict | None = None,
) -> None:
    """Registra um evento de atividade. Nunca deve quebrar a rota que chama."""
    try:
        await db.user_activity.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "kind": kind,
            "summary": summary,
            "data": data or {},
            "created_at": _now(),
        })
    except Exception:
        logger.exception("log_activity failed")


async def consolidate_user_profile(db: AsyncIOMotorDatabase, user_id: str, force: bool = False) -> dict | None:
    """Consolida atividade + decisões dos últimos 30 dias no agent_profile."""
    existing = await db.agent_profile.find_one({"user_id": user_id})
    if existing and not force:
        try:
            last = datetime.fromisoformat(existing["updated_at"].replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - last).total_seconds() < CONSOLIDATE_EVERY_HOURS * 3600:
                return None  # ainda fresco
        except Exception:
            pass

    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # Atividade por tipo
    activity_by_kind: dict = {}
    async for d in db.user_activity.aggregate([
        {"$match": {"user_id": user_id, "created_at": {"$gte": since}}},
        {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
    ]):
        activity_by_kind[d["_id"]] = d["count"]

    # Decisões sobre planos de ação
    plans_by_status: dict = {}
    async for d in db.action_plans.aggregate([
        {"$match": {"user_id": user_id, "created_at": {"$gte": since}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        plans_by_status[d["_id"]] = d["count"]

    approved = 0
    async for d in db.action_plans.aggregate([
        {"$match": {"user_id": user_id, "approved_at": {"$exists": True}, "created_at": {"$gte": since}}},
        {"$count": "n"},
    ]):
        approved = d["n"]
    rejected = plans_by_status.get("rejected", 0)
    decided = approved + rejected
    approval_rate = round(approved / decided * 100, 1) if decided else None

    # O que o usuário costuma rejeitar (e por quê)
    rejection_reasons = []
    rejected_types: dict = {}
    async for p in db.action_plans.find(
        {"user_id": user_id, "status": "rejected", "created_at": {"$gte": since}},
        {"_id": 0, "action_type": 1, "rejection_reason": 1, "target_name": 1},
    ).sort("rejected_at", -1).limit(15):
        rejected_types[p.get("action_type")] = rejected_types.get(p.get("action_type"), 0) + 1
        if p.get("rejection_reason"):
            rejection_reasons.append({
                "action_type": p.get("action_type"),
                "target": p.get("target_name"),
                "reason": p.get("rejection_reason"),
            })

    # Origem das execuções (quanto o usuário delega vs faz manualmente)
    executed_by_source: dict = {}
    async for d in db.action_plans.aggregate([
        {"$match": {"user_id": user_id, "executed_at": {"$exists": True}, "created_at": {"$gte": since}}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
    ]):
        executed_by_source[d["_id"]] = d["count"]

    autonomy = await db.autonomy_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    memory_count = await db.strategy_memory.count_documents({"user_id": user_id})
    rules_active = await db.automation_rules.count_documents({"user_id": user_id, "enabled": True})

    # Traços de operação em linguagem simples — é isso que a IA lê
    traits = []
    mode = autonomy.get("mode", "recommend")
    mode_pt = {"recommend": "somente recomendações", "approve": "aprovação humana obrigatória",
               "auto": "execução automática dentro de limites"}.get(mode, mode)
    traits.append(f"Modo de autonomia: {mode_pt}.")
    if approval_rate is not None:
        if approval_rate >= 80:
            traits.append(f"Usuário confia nas propostas do sistema (aprova {approval_rate:.0f}%).")
        elif approval_rate <= 40:
            traits.append(f"Usuário é seletivo: aprova só {approval_rate:.0f}% das propostas — seja conservador e detalhe evidências.")
        else:
            traits.append(f"Taxa de aprovação de propostas: {approval_rate:.0f}%.")
    for atype, cnt in sorted(rejected_types.items(), key=lambda x: -x[1])[:2]:
        if cnt >= 2:
            traits.append(f"Costuma rejeitar ações do tipo '{atype}' ({cnt}x em 30d) — evite propor sem evidência forte.")
    if rules_active:
        traits.append(f"{rules_active} regra(s) automática(s) ativa(s).")
    if activity_by_kind.get("memory_added"):
        traits.append("Usuário alimenta a memória estratégica manualmente — valorize esses registros.")
    stop_loss = autonomy.get("stop_loss_daily_spend") or 0
    if stop_loss:
        traits.append(f"Stop-loss diário configurado em R${stop_loss:.0f} — respeite esse teto em qualquer plano.")

    profile = {
        "user_id": user_id,
        "window_days": 30,
        "activity_by_kind": activity_by_kind,
        "plans_by_status": plans_by_status,
        "approval_rate_pct": approval_rate,
        "rejected_action_types": rejected_types,
        "recent_rejection_reasons": rejection_reasons[:10],
        "executed_by_source": executed_by_source,
        "autonomy_mode": mode,
        "memory_count": memory_count,
        "active_rules": rules_active,
        "operating_traits_pt": traits,
        "updated_at": _now(),
    }
    await db.agent_profile.update_one({"user_id": user_id}, {"$set": profile}, upsert=True)
    return profile


async def get_agent_profile(db: AsyncIOMotorDatabase, user_id: str) -> dict | None:
    doc = await db.agent_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    return doc
