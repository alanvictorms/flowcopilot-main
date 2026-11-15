"""Digital Twin — simulate outcomes of hypothetical changes before applying."""
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/twin", tags=["twin"])


def _f(x):
    try: return float(x or 0)
    except Exception: return 0.0


class SimulateIn(BaseModel):
    scenario: str  # increase_budget | decrease_budget | pause_campaign | transfer_budget
    campaign_id: str
    change_pct: float = 0.0        # for increase/decrease
    transfer_from_id: str = ""
    transfer_to_id: str = ""


@router.post("/simulate")
async def simulate(
    body: SimulateIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        insights = await client.insights(level="campaign", date_preset="last_14d")
        adsets = await client.list_adsets()
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    row = next((r for r in insights if r.get("campaign_id") == body.campaign_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Campanha sem dados no período")

    daily_spend = _f(row.get("spend")) / 14.0
    daily_clicks = _f(row.get("clicks")) / 14.0
    daily_impressions = _f(row.get("impressions")) / 14.0
    purchases = 0.0
    for a in row.get("actions") or []:
        if a.get("action_type") == "purchase":
            purchases += _f(a.get("value"))
    daily_purchases = purchases / 14.0
    cpa = (daily_spend / daily_purchases) if daily_purchases else 0
    roas_val = 0.0
    for rr in row.get("purchase_roas") or []:
        v = _f(rr.get("value"))
        if v > roas_val: roas_val = v

    baseline = {
        "spend_30d": round(daily_spend * 30, 2),
        "clicks_30d": int(daily_clicks * 30),
        "impressions_30d": int(daily_impressions * 30),
        "purchases_30d": int(daily_purchases * 30),
        "cpa": round(cpa, 2),
        "roas": round(roas_val, 2),
    }

    # Simple diminishing-returns model
    def project(mult, pause=False):
        if pause:
            return {"spend_30d": 0, "clicks_30d": 0, "impressions_30d": 0, "purchases_30d": 0, "cpa": 0, "roas": 0}
        # Log-like curve so 2x budget != 2x conversions
        conv_mult = mult ** 0.75 if mult >= 1 else mult ** 1.2
        new_spend = daily_spend * mult * 30
        new_purch = daily_purchases * conv_mult * 30
        new_cpa = (new_spend / new_purch) if new_purch else 0
        new_roas = roas_val * (conv_mult / mult) if mult else 0
        return {
            "spend_30d": round(new_spend, 2),
            "clicks_30d": int(daily_clicks * mult * 30),
            "impressions_30d": int(daily_impressions * mult * 30),
            "purchases_30d": int(new_purch),
            "cpa": round(new_cpa, 2),
            "roas": round(new_roas, 2),
        }

    if body.scenario == "increase_budget":
        projected = project(1 + body.change_pct / 100.0)
    elif body.scenario == "decrease_budget":
        projected = project(max(0.05, 1 - body.change_pct / 100.0))
    elif body.scenario == "pause_campaign":
        projected = project(1, pause=True)
    elif body.scenario == "transfer_budget":
        # transfer means -X% from source, +X% for target — return current projection only
        projected = project(1 + body.change_pct / 100.0)
    else:
        raise HTTPException(status_code=400, detail="Cenário desconhecido")

    delta = {
        "spend_delta": round(projected["spend_30d"] - baseline["spend_30d"], 2),
        "purchases_delta": projected["purchases_30d"] - baseline["purchases_30d"],
        "roas_delta": round(projected["roas"] - baseline["roas"], 2),
        "cpa_delta": round(projected["cpa"] - baseline["cpa"], 2),
    }
    # Rough risk score: bigger changes = more risk
    risk_pct = min(abs(body.change_pct) / 100.0, 1.0)
    risk = "low" if risk_pct < 0.25 else ("medium" if risk_pct < 0.6 else "high")

    return {
        "scenario": body.scenario,
        "campaign": {"id": body.campaign_id, "name": row.get("campaign_name")},
        "baseline_30d": baseline,
        "projected_30d": projected,
        "delta": delta,
        "risk": risk,
        "recommendation": "Aplicar em incrementos de 20-30% e reavaliar após 72h." if body.scenario == "increase_budget" else
                          "Reduzir em etapas e monitorar CPA por 48h." if body.scenario == "decrease_budget" else
                          "Pausar imediatamente se draining budget sem ROAS." if body.scenario == "pause_campaign" else
                          "Transferir orçamento em duas etapas de 50%.",
    }
