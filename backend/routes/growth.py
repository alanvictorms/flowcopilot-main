"""
Autonomous Growth Loop + Motor de Exploração/Aproveitamento
(Camada 5 · itens 38 e 42 do roadmap).

`/status` mostra o estado do ciclo contínuo: dados → regras → planos →
aprovações → execução → verificação → aprendizado.
`/explore-exploit` sugere a divisão de verba entre vencedores comprovados
(exploit) e testes/exploração (explore), com base no histórico próprio.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services import data_hub, control_plane
from services.stats_engine import sample_sufficiency
from routes.autonomy import load_autonomy

router = APIRouter(prefix="/api/growth", tags=["growth"])


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


@router.get("/status")
async def status(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Visão única do ciclo autônomo de crescimento."""
    uid = user["id"]
    day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    autonomy = await load_autonomy(db, uid)
    freshness = await data_hub.data_freshness(db, uid)
    last_run = await db.automation_runs.find_one({"user_id": uid}, sort=[("created_at", -1)])

    plans_counts = {}
    async for d in db.action_plans.aggregate([
        {"$match": {"user_id": uid}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        plans_counts[d["_id"]] = d["count"]

    executed_24h = await db.action_plans.count_documents({
        "user_id": uid, "executed_at": {"$gte": day_ago},
        "status": {"$in": [control_plane.EXECUTED, control_plane.VERIFIED_KEPT, control_plane.ROLLED_BACK]},
    })
    active_rules = await db.automation_rules.count_documents({"user_id": uid, "enabled": True})
    running_experiments = await db.experiments.count_documents({"user_id": uid, "status": "running"})
    memory_count = await db.strategy_memory.count_documents({"user_id": uid})
    products = await db.business_products.count_documents({"user_id": uid})

    recent_scan = await db.safety_scans.find_one(
        {"user_id": uid, "scanned_at": {"$gte": day_ago}}, sort=[("scanned_at", -1)])

    # Etapas do loop com estado — para o painel visual do ciclo
    steps = [
        {"key": "data", "label_pt": "Hub de dados",
         "ok": bool(freshness.get("synced")),
         "detail_pt": (f"{freshness.get('total_daily_rows', 0)} linhas diárias, "
                       f"sync há {freshness.get('hours_since_sync')}h"
                       if freshness.get("synced") else "Nunca sincronizado — rode a sincronização.")},
        {"key": "business", "label_pt": "Contexto do negócio",
         "ok": products > 0,
         "detail_pt": f"{products} produto(s) cadastrado(s)" if products else "Cadastre produtos/margens no BI Core."},
        {"key": "rules", "label_pt": "Regras ativas",
         "ok": active_rules > 0,
         "detail_pt": f"{active_rules} regra(s) monitorando a conta"},
        {"key": "plans", "label_pt": "Planos de ação",
         "ok": True,
         "detail_pt": (f"{plans_counts.get(control_plane.PENDING, 0)} aguardando aprovação, "
                       f"{executed_24h} executados em 24h")},
        {"key": "verification", "label_pt": "Pós-verificação",
         "ok": True,
         "detail_pt": (f"{plans_counts.get(control_plane.VERIFIED_KEPT, 0)} mantidos, "
                       f"{plans_counts.get(control_plane.ROLLED_BACK, 0)} revertidos")},
        {"key": "experiments", "label_pt": "Experimentos",
         "ok": running_experiments > 0,
         "detail_pt": f"{running_experiments} experimento(s) rodando"},
        {"key": "memory", "label_pt": "Memória estratégica",
         "ok": memory_count > 0,
         "detail_pt": f"{memory_count} aprendizado(s) registrados"},
    ]

    return {
        "mode": autonomy.get("mode"),
        "kill_switch": autonomy.get("kill_switch", False),
        "freeze_by_incident": bool(recent_scan and recent_scan.get("should_freeze_automation")),
        "data": freshness,
        "last_cycle_at": (last_run or {}).get("created_at"),
        "plans": {
            "pending": plans_counts.get(control_plane.PENDING, 0),
            "executed_24h": executed_24h,
            "verified_kept": plans_counts.get(control_plane.VERIFIED_KEPT, 0),
            "rolled_back": plans_counts.get(control_plane.ROLLED_BACK, 0),
            "blocked": plans_counts.get(control_plane.BLOCKED, 0),
        },
        "active_rules": active_rules,
        "running_experiments": running_experiments,
        "memory_count": memory_count,
        "steps": steps,
    }


@router.get("/explore-exploit")
async def explore_exploit(
    days: int = 30,
    explore_pct: float = 20.0,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Divisão sugerida de verba: vencedores comprovados (exploit) × exploração.
    Classifica campanhas com evidência suficiente e aponta realocação.
    """
    uid = user["id"]
    autonomy = await load_autonomy(db, uid)
    min_conv = int(autonomy.get("min_conversions") or 5)
    rows = await data_hub.window_rows(db, uid, level="campaign", days=days)

    winners, losers, undecided = [], [], []
    for r in rows:
        conversions = _f(r.get("purchases")) or _f(r.get("leads"))
        sample = sample_sufficiency(
            impressions=_f(r.get("impressions")), clicks=_f(r.get("clicks")),
            conversions=conversions, min_conversions=min_conv,
        )
        entry = {
            "campaign_id": r["object_id"], "campaign_name": r.get("object_name"),
            "spend": r.get("spend"), "roas": r.get("roas"), "cpa": r.get("cpa"),
            "purchases": int(_f(r.get("purchases"))), "leads": int(_f(r.get("leads"))),
            "sufficient_data": sample["sufficient"],
        }
        if not sample["sufficient"]:
            undecided.append(entry)
        elif _f(r.get("roas")) >= 1.5:
            winners.append(entry)
        elif _f(r.get("roas")) < 1.0 and _f(r.get("spend")) > 0:
            losers.append(entry)
        else:
            undecided.append(entry)

    total_spend = sum(_f(r.get("spend")) for r in rows)
    winner_spend = sum(_f(w.get("spend")) for w in winners)
    loser_spend = sum(_f(l.get("spend")) for l in losers)
    current_exploit_pct = round(winner_spend / total_spend * 100, 1) if total_spend else 0.0
    target_exploit_pct = round(100 - explore_pct, 1)

    recommendations = []
    if losers:
        recommendations.append(
            f"{len(losers)} campanha(s) com ROAS < 1 consumiram R${loser_spend:.2f} — "
            "candidatas a pausa ou redução progressiva via Control Plane.")
    if winners and current_exploit_pct < target_exploit_pct:
        recommendations.append(
            f"Vencedoras recebem só {current_exploit_pct:.0f}% da verba; a meta é "
            f"~{target_exploit_pct:.0f}%. Realoque gradualmente (+20% por vez, com verificação).")
    if not undecided:
        recommendations.append("Considere reservar verba de exploração para novos testes — "
                               "não há campanhas em fase de aprendizado.")
    if undecided and len(undecided) > len(winners) + len(losers):
        recommendations.append(
            f"{len(undecided)} campanha(s) ainda sem dados suficientes — evite mexer nelas "
            "até acumularem evidência (proteção do Motor Estatístico).")

    return {
        "days": days,
        "explore_pct_target": explore_pct,
        "current_split": {
            "total_spend": round(total_spend, 2),
            "winner_spend": round(winner_spend, 2),
            "loser_spend": round(loser_spend, 2),
            "exploit_pct": current_exploit_pct,
        },
        "winners": sorted(winners, key=lambda w: -_f(w.get("roas"))),
        "losers": sorted(losers, key=lambda l: _f(l.get("roas"))),
        "undecided": undecided,
        "recommendations_pt": recommendations,
    }
