"""Agency Command Center — multi-client / multi-account management."""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user, require_admin, encrypt_str, decrypt_str
from services.meta_client import MetaClient, MetaAPIError

router = APIRouter(prefix="/api/agency", tags=["agency"], dependencies=[Depends(require_admin)])


class ClientIn(BaseModel):
    name: str = Field(min_length=1)
    notes: str = ""
    brand_color: str = "#a3e635"
    app_id: str
    app_secret: str
    access_token: str
    ad_account_id: str
    monthly_target_spend: float = 0.0
    monthly_target_roas: float = 0.0


class ClientOut(BaseModel):
    id: str
    name: str
    notes: str
    brand_color: str
    ad_account_id: str
    ad_account_name: Optional[str] = None
    currency: Optional[str] = None
    monthly_target_spend: float = 0.0
    monthly_target_roas: float = 0.0
    connected: bool = True
    created_at: str
    updated_at: str


def _f(x):
    try: return float(x or 0)
    except Exception: return 0.0


@router.get("/clients", response_model=list[ClientOut])
async def list_clients(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.agency_clients.find({"user_id": user["id"]},
                                 {"_id": 0, "user_id": 0, "app_secret_enc": 0, "access_token_enc": 0}
                                 ).sort("created_at", -1)
    return [d async for d in cur]


@router.post("/clients", response_model=ClientOut)
async def create_client(body: ClientIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = MetaClient(body.access_token, body.ad_account_id)
    try:
        info = await client.get_ad_account()
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail={"message": "Meta rejected credentials", "meta_error": e.detail})

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name,
        "notes": body.notes,
        "brand_color": body.brand_color,
        "app_id": body.app_id,
        "app_secret_enc": encrypt_str(body.app_secret),
        "access_token_enc": encrypt_str(body.access_token),
        "ad_account_id": body.ad_account_id,
        "ad_account_name": info.get("name"),
        "currency": info.get("currency"),
        "monthly_target_spend": body.monthly_target_spend,
        "monthly_target_roas": body.monthly_target_roas,
        "connected": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.agency_clients.insert_one({**doc})
    for k in ("user_id", "app_secret_enc", "access_token_enc"):
        doc.pop(k, None)
    doc.pop("app_id", None)
    return doc


@router.delete("/clients/{cid}")
async def delete_client(cid: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.agency_clients.delete_one({"id": cid, "user_id": user["id"]})
    return {"ok": True}


async def _fetch_snapshot(db, cli: dict) -> dict:
    """Return per-client KPI snapshot; catches any error into 'error' field."""
    try:
        c = MetaClient(decrypt_str(cli["access_token_enc"]), cli["ad_account_id"])
        insights = await c.insights(level="account", date_preset="last_30d")
    except MetaAPIError as e:
        return {"id": cli["id"], "name": cli["name"], "error": str(e.detail)[:200]}
    except Exception as e:
        return {"id": cli["id"], "name": cli["name"], "error": str(e)[:200]}

    spend = sum(_f(r.get("spend")) for r in insights)
    impressions = sum(_f(r.get("impressions")) for r in insights)
    clicks = sum(_f(r.get("clicks")) for r in insights)
    purchases = 0.0
    for r in insights:
        for a in r.get("actions") or []:
            if a.get("action_type") == "purchase":
                purchases += _f(a.get("value"))
    roas_vals = []
    for r in insights:
        for rr in r.get("purchase_roas") or []:
            v = _f(rr.get("value"))
            if v > 0: roas_vals.append(v)
    avg_roas = sum(roas_vals) / len(roas_vals) if roas_vals else 0.0
    ctr = (clicks / impressions * 100) if impressions else 0
    cpa = (spend / purchases) if purchases else 0

    # Risk / opportunity scoring
    target_spend = _f(cli.get("monthly_target_spend"))
    target_roas = _f(cli.get("monthly_target_roas"))
    pace_pct = (spend / target_spend * 100) if target_spend else 0
    roas_gap_pct = ((target_roas - avg_roas) / target_roas * 100) if target_roas else 0
    risk_score = 0
    if pace_pct > 110: risk_score += 30
    if pace_pct < 60 and target_spend > 0: risk_score += 20
    if roas_gap_pct > 20: risk_score += 30
    if purchases == 0 and spend > 50: risk_score += 40
    risk_score = min(risk_score, 100)

    opp_score = 0
    if avg_roas >= 2.0: opp_score += 40
    if pace_pct < 80 and avg_roas >= 1.5: opp_score += 30  # underspending winner
    if ctr >= 2.0: opp_score += 20
    opp_score = min(opp_score, 100)

    return {
        "id": cli["id"],
        "name": cli["name"],
        "brand_color": cli.get("brand_color", "#a3e635"),
        "ad_account_name": cli.get("ad_account_name"),
        "currency": cli.get("currency", "USD"),
        "spend_30d": round(spend, 2),
        "impressions": int(impressions),
        "clicks": int(clicks),
        "purchases": int(purchases),
        "ctr_pct": round(ctr, 2),
        "cpa": round(cpa, 2),
        "avg_roas": round(avg_roas, 2),
        "pace_pct": round(pace_pct, 1),
        "target_spend": target_spend,
        "target_roas": target_roas,
        "risk_score": risk_score,
        "opportunity_score": opp_score,
    }


@router.get("/overview")
async def overview(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    clients = await db.agency_clients.find({"user_id": user["id"]}).to_list(200)
    if not clients:
        return {"clients": [], "totals": None, "risk_ranking": [], "opportunity_ranking": []}
    snapshots = await asyncio.gather(*[_fetch_snapshot(db, c) for c in clients])
    valid = [s for s in snapshots if "error" not in s]
    totals = {
        "count": len(clients),
        "connected": len(valid),
        "total_spend_30d": round(sum(s["spend_30d"] for s in valid), 2),
        "total_purchases": sum(s["purchases"] for s in valid),
        "avg_roas": round(sum(s["avg_roas"] for s in valid) / len(valid), 2) if valid else 0,
    }
    risk_ranking = sorted(valid, key=lambda x: -x["risk_score"])[:10]
    opp_ranking = sorted(valid, key=lambda x: -x["opportunity_score"])[:10]
    return {
        "clients": snapshots,
        "totals": totals,
        "risk_ranking": risk_ranking,
        "opportunity_ranking": opp_ranking,
    }
