"""
Campaign Lifecycle Autopilot (Camada 3 · item 26 do roadmap).

Classifica cada campanha no seu estágio de vida usando o histórico próprio:
  aprendizado → saudável → escalável → fadiga → perdedora → zumbi
e recomenda a próxima ação. Aplicar uma recomendação cria um ActionPlan
no Control Plane (nunca vai direto pra Meta).
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services import data_hub, control_plane
from services.stats_engine import sample_sufficiency, trend
from services.activity import log_activity
from routes.autonomy import load_autonomy
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/lifecycle", tags=["lifecycle"])

STAGES = {
    "learning": {"label_pt": "Aprendizado", "action_pt": "Não mexer — proteção da fase de aprendizado."},
    "healthy": {"label_pt": "Saudável", "action_pt": "Manter e acompanhar."},
    "winner_scalable": {"label_pt": "Vencedora — escalável", "action_pt": "Escalar orçamento em +20% com verificação."},
    "fatigued": {"label_pt": "Fadiga criativa", "action_pt": "Renovar criativos; considerar reduzir orçamento -20%."},
    "loser": {"label_pt": "Perdedora", "action_pt": "Pausar (perda confirmada com dados suficientes)."},
    "zombie": {"label_pt": "Zumbi (sem entrega)", "action_pt": "Verificar configuração ou pausar."},
}


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


async def _latest_entities(db, user_id: str) -> dict:
    snap = await db.entity_snapshots.find_one(
        {"user_id": user_id}, {"_id": 0, "campaigns": 1, "fetched_at": 1},
        sort=[("fetched_at", -1)],
    )
    return {c["id"]: c for c in (snap or {}).get("campaigns", [])}


def _classify(row7: dict, row30: dict, entity: dict, ctr_trend: dict, min_conversions: int) -> str:
    status = (entity or {}).get("effective_status") or (entity or {}).get("status") or ""
    conversions_30 = _f(row30.get("purchases")) or _f(row30.get("leads"))
    sample = sample_sufficiency(
        impressions=_f(row30.get("impressions")), clicks=_f(row30.get("clicks")),
        conversions=conversions_30, min_conversions=min_conversions,
    )

    # Zumbi: ativa mas sem entrega na última semana
    if status == "ACTIVE" and _f(row7.get("impressions")) == 0:
        return "zombie"

    # Aprendizado: campanha nova ou sem dados suficientes
    created = (entity or {}).get("created_time") or ""
    age_days = None
    try:
        created_dt = datetime.fromisoformat(created.replace("Z", "+00:00").split("+")[0]).replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - created_dt).days
    except Exception:
        pass
    if (age_days is not None and age_days < 7) or not sample["sufficient"]:
        return "learning"

    roas30 = _f(row30.get("roas"))
    # Perdedora: dados suficientes e retorno abaixo do custo
    if roas30 > 0 and roas30 < 1.0 and _f(row30.get("spend")) > 0:
        return "loser"
    if roas30 == 0 and conversions_30 == 0 and _f(row30.get("spend")) > 0:
        return "loser"

    # Fadiga: frequência alta ou CTR em queda consistente
    if _f(row7.get("frequency")) > 3.5:
        return "fatigued"
    if ctr_trend.get("direction") == "down" and ctr_trend.get("r2", 0) >= 0.3:
        return "fatigued"

    # Vencedora escalável
    if roas30 >= 2.0:
        return "winner_scalable"

    return "healthy"


@router.get("/overview")
async def overview(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    uid = user["id"]
    autonomy = await load_autonomy(db, uid)
    min_conv = int(autonomy.get("min_conversions") or 5)

    rows7 = {r["object_id"]: r for r in await data_hub.window_rows(db, uid, "campaign", days=7)}
    rows30 = {r["object_id"]: r for r in await data_hub.window_rows(db, uid, "campaign", days=30)}
    entities = await _latest_entities(db, uid)

    if not rows30 and not entities:
        return {"campaigns": [], "by_stage": {},
                "hint_pt": "Sem dados ainda — sincronize o Hub de Dados primeiro."}

    all_ids = set(rows30) | {cid for cid, e in entities.items()
                             if (e.get("effective_status") or e.get("status")) == "ACTIVE"}
    campaigns = []
    for cid in all_ids:
        r7 = rows7.get(cid, {})
        r30 = rows30.get(cid, {})
        entity = entities.get(cid, {})
        ctr_series = await data_hub.get_series(db, uid, cid, metric="ctr", days=14)
        ctr_trend = trend([p["value"] for p in ctr_series])
        stage = _classify(r7, r30, entity, ctr_trend, min_conv)
        campaigns.append({
            "campaign_id": cid,
            "campaign_name": r30.get("object_name") or r7.get("object_name") or entity.get("name") or cid,
            "status": entity.get("effective_status") or entity.get("status"),
            "stage": stage,
            "stage_label_pt": STAGES[stage]["label_pt"],
            "recommended_action_pt": STAGES[stage]["action_pt"],
            "spend_30d": r30.get("spend", 0),
            "roas_30d": r30.get("roas", 0),
            "cpa_30d": r30.get("cpa", 0),
            "purchases_30d": int(_f(r30.get("purchases"))),
            "leads_30d": int(_f(r30.get("leads"))),
            "frequency_7d": r7.get("frequency", 0),
            "ctr_trend": ctr_trend,
            "actionable": stage in ("loser", "zombie", "winner_scalable", "fatigued"),
        })

    campaigns.sort(key=lambda c: -_f(c.get("spend_30d")))
    by_stage = {}
    for c in campaigns:
        by_stage[c["stage"]] = by_stage.get(c["stage"], 0) + 1
    return {"campaigns": campaigns, "by_stage": by_stage, "stages": STAGES}


class ApplyIn(BaseModel):
    stage: str


@router.post("/apply/{campaign_id}")
async def apply(
    campaign_id: str,
    body: ApplyIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Cria o ActionPlan recomendado para o estágio — via Control Plane."""
    uid = user["id"]
    autonomy = await load_autonomy(db, uid)
    rows30 = {r["object_id"]: r for r in await data_hub.window_rows(db, uid, "campaign", days=30)}
    row = rows30.get(campaign_id, {})
    name = row.get("object_name") or campaign_id
    evidence = {k: row.get(k) for k in ("spend", "impressions", "clicks", "purchases", "leads", "roas", "cpa", "frequency")}

    if body.stage in ("loser", "zombie"):
        action_type, change_pct = "pause", 0.0
        reason = (f"Lifecycle: campanha classificada como '{STAGES[body.stage]['label_pt']}' — "
                  f"ROAS 30d {row.get('roas', 0)}, gasto R${row.get('spend', 0)}.")
        expected = "Cortar perda / liberar verba para vencedoras."
    elif body.stage == "winner_scalable":
        action_type, change_pct = "change_budget", 20.0
        reason = f"Lifecycle: vencedora escalável — ROAS 30d {row.get('roas', 0)} com dados suficientes."
        expected = "Escalar gradualmente (+20%) mantendo eficiência, com pós-verificação."
    elif body.stage == "fatigued":
        action_type, change_pct = "change_budget", -20.0
        reason = (f"Lifecycle: fadiga criativa — frequência {row.get('frequency', 0)} / CTR em queda. "
                  "Reduzir enquanto novos criativos são preparados.")
        expected = "Conter queda de eficiência até renovar criativos."
    else:
        raise HTTPException(status_code=400, detail="Estágio sem ação executável (aprendizado/saudável).")

    plan = await control_plane.propose(
        db, uid, autonomy,
        source="ai", source_ref=f"lifecycle_{body.stage}",
        action_type=action_type, target_type="campaign",
        target_id=campaign_id, target_name=name,
        change_pct=change_pct, reason=reason,
        evidence_metrics=evidence, expected_impact=expected,
    )
    if plan.get("status") == control_plane.AUTHORIZED:
        client = await get_meta_client(user, db)
        plan["execution"] = await control_plane.execute(db, uid, plan, client, actor="ai")
        plan["status"] = control_plane.EXECUTED if plan["execution"].get("ok") else control_plane.FAILED

    await log_activity(db, uid, "lifecycle_apply",
                       f"Aplicou recomendação de lifecycle ({body.stage}) em {name}",
                       {"campaign_id": campaign_id, "plan_id": plan.get("id"), "status": plan.get("status")})
    return plan
