"""Profit & Lead Quality Autopilot — CRM webhook + offline conversions + profit analytics."""
import hashlib
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user, decrypt_str
from services.meta_client import MetaClient, MetaAPIError

router = APIRouter(prefix="/api/profit", tags=["profit"])


class LeadEvent(BaseModel):
    external_id: str
    event: str  # lead | qualified | sale | refund | lost
    value: float = 0.0
    currency: str = "BRL"
    email: Optional[str] = None
    phone: Optional[str] = None
    campaign_id: Optional[str] = None
    ad_id: Optional[str] = None
    lost_reason: Optional[str] = None
    meta: dict = Field(default_factory=dict)


def _hash(v: Optional[str]) -> Optional[str]:
    if not v: return None
    return hashlib.sha256(v.strip().lower().encode()).hexdigest()


@router.post("/webhook")
async def webhook(
    body: LeadEvent,
    x_webhook_token: str = Header(default=""),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Public webhook — CRM/site posts events here with a token that maps to a user."""
    tok = await db.webhook_tokens.find_one({"token": x_webhook_token})
    if not tok:
        raise HTTPException(status_code=401, detail="Invalid webhook token")
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = tok["user_id"]
    doc["received_at"] = datetime.now(timezone.utc).isoformat()
    await db.crm_events.insert_one({**doc})
    return {"ok": True, "id": doc["id"]}


@router.post("/webhook/token")
async def issue_token(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    tok = str(uuid.uuid4())
    await db.webhook_tokens.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "token": tok, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"token": tok}


@router.get("/webhook/token")
async def get_token(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    d = await db.webhook_tokens.find_one({"user_id": user["id"]})
    return {"token": d.get("token") if d else None}


@router.get("/events")
async def list_events(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.crm_events.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("received_at", -1).limit(200)
    return [d async for d in cur]


@router.post("/events")
async def add_event_manual(
    body: LeadEvent,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["received_at"] = datetime.now(timezone.utc).isoformat()
    doc["source"] = "manual"
    await db.crm_events.insert_one({**doc})
    return doc


@router.get("/summary")
async def summary(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.crm_events.find({"user_id": user["id"]})
    events = [d async for d in cur]
    total_leads = sum(1 for e in events if e.get("event") == "lead")
    qualified = sum(1 for e in events if e.get("event") == "qualified")
    sales = [e for e in events if e.get("event") == "sale"]
    refunds = [e for e in events if e.get("event") == "refund"]
    lost = [e for e in events if e.get("event") == "lost"]
    revenue = sum(float(e.get("value") or 0) for e in sales)
    refunded = sum(float(e.get("value") or 0) for e in refunds)
    net = revenue - refunded
    lost_reasons = {}
    for l in lost:
        r = l.get("lost_reason") or "unknown"
        lost_reasons[r] = lost_reasons.get(r, 0) + 1
    return {
        "total_leads": total_leads,
        "qualified": qualified,
        "qualification_rate_pct": round(qualified / total_leads * 100, 1) if total_leads else 0,
        "sales_count": len(sales),
        "sales_rate_pct": round(len(sales) / qualified * 100, 1) if qualified else 0,
        "revenue": round(revenue, 2),
        "refunded": round(refunded, 2),
        "net_revenue": round(net, 2),
        "avg_ticket": round(revenue / len(sales), 2) if sales else 0,
        "lost_reasons": lost_reasons,
    }


@router.get("/by-campaign")
async def by_campaign(
    days: int = 30,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Lucro REAL por campanha: vendas do CRM × margem do BI Core − investimento
    do Hub de Dados. Também qualidade de lead (custo por lead qualificado) e
    violações de CAC máximo por produto.
    """
    from services import data_hub

    # Margem por campanha a partir dos produtos do BI Core
    margin_by_campaign = {}
    product_by_campaign = {}
    async for p in db.business_products.find({"user_id": user["id"]}, {"_id": 0}):
        price = float(p.get("price") or 0)
        taxes = price * float(p.get("taxes_pct") or 0) / 100.0
        commission = price * float(p.get("commission_pct") or 0) / 100.0
        unit_profit = price - float(p.get("cost") or 0) - taxes - commission
        margin_factor = (unit_profit / price) if price else 1.0
        for cid in p.get("campaign_ids") or []:
            margin_by_campaign[cid] = margin_factor
            product_by_campaign[cid] = p

    # Eventos do CRM agrupados por campanha
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    by_campaign_events: dict = {}
    async for e in db.crm_events.find({"user_id": user["id"], "received_at": {"$gte": since}}, {"_id": 0}):
        cid = e.get("campaign_id") or "_unattributed"
        g = by_campaign_events.setdefault(cid, {"leads": 0, "qualified": 0, "sales": 0,
                                                "revenue": 0.0, "refunded": 0.0, "lost": 0})
        ev = e.get("event")
        if ev == "lead": g["leads"] += 1
        elif ev == "qualified": g["qualified"] += 1
        elif ev == "sale":
            g["sales"] += 1
            g["revenue"] += float(e.get("value") or 0)
        elif ev == "refund": g["refunded"] += float(e.get("value") or 0)
        elif ev == "lost": g["lost"] += 1

    # Investimento por campanha vindo do hub histórico
    spend_rows = await data_hub.window_rows(db, user["id"], level="campaign", days=days)
    spend_by_id = {r["object_id"]: r for r in spend_rows}

    campaigns = []
    all_ids = set(spend_by_id) | {c for c in by_campaign_events if c != "_unattributed"}
    for cid in all_ids:
        row = spend_by_id.get(cid, {})
        ev = by_campaign_events.get(cid, {"leads": 0, "qualified": 0, "sales": 0,
                                          "revenue": 0.0, "refunded": 0.0, "lost": 0})
        spend = float(row.get("spend") or 0)
        margin_factor = margin_by_campaign.get(cid)
        net_revenue = ev["revenue"] - ev["refunded"]
        gross_profit = net_revenue * (margin_factor if margin_factor is not None else 1.0)
        profit = gross_profit - spend
        cac = spend / ev["sales"] if ev["sales"] else 0.0
        product = product_by_campaign.get(cid)
        max_cac = float((product or {}).get("max_cac") or 0)
        campaigns.append({
            "campaign_id": cid,
            "campaign_name": row.get("object_name") or cid,
            "spend": round(spend, 2),
            "leads": ev["leads"],
            "qualified": ev["qualified"],
            "sales": ev["sales"],
            "lost": ev["lost"],
            "revenue": round(ev["revenue"], 2),
            "net_revenue": round(net_revenue, 2),
            "margin_configured": margin_factor is not None,
            "margin_factor": round(margin_factor, 3) if margin_factor is not None else None,
            "profit": round(profit, 2),
            "cac": round(cac, 2),
            "max_cac": max_cac or None,
            "cac_violation": bool(max_cac and cac > max_cac),
            "cost_per_lead": round(spend / ev["leads"], 2) if ev["leads"] else 0.0,
            "cost_per_qualified": round(spend / ev["qualified"], 2) if ev["qualified"] else 0.0,
            "qualification_rate_pct": round(ev["qualified"] / ev["leads"] * 100, 1) if ev["leads"] else 0.0,
            "product_name": (product or {}).get("name"),
        })

    campaigns.sort(key=lambda c: c["profit"], reverse=True)
    unattributed = by_campaign_events.get("_unattributed")
    total_profit = sum(c["profit"] for c in campaigns)
    violations = [c for c in campaigns if c["cac_violation"]]
    return {
        "days": days,
        "campaigns": campaigns,
        "total_profit": round(total_profit, 2),
        "cac_violations": violations,
        "unattributed_events": unattributed,
        "has_business_data": bool(margin_by_campaign),
        "hint_pt": (None if margin_by_campaign else
                    "Cadastre produtos no BI Core e vincule campanhas para calcular lucro com margem real."),
    }


@router.post("/sync-to-meta")
async def sync_to_meta(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Send offline conversions to Meta via the Conversions API (Offline Events endpoint)."""
    settings = await db.meta_settings.find_one({"user_id": user["id"]})
    if not settings or not settings.get("access_token_enc"):
        raise HTTPException(status_code=428, detail="Meta credentials not configured. Add them in Settings.")

    client = MetaClient(decrypt_str(settings["access_token_enc"]), settings["ad_account_id"])
    # Fetch not-yet-synced sale events
    cur = db.crm_events.find({"user_id": user["id"]}, {"_id": 0}).sort("received_at", -1).limit(500)
    events = [d async for d in cur]
    to_send = [e for e in events if e.get("event") == "sale" and not e.get("synced_to_meta")]
    if not to_send:
        return {"sent": 0, "reason": "Nada novo pra enviar"}

    data_payload = []
    for e in to_send:
        user_data = {}
        if e.get("email"): user_data["em"] = _hash(e["email"])
        if e.get("phone"): user_data["ph"] = _hash(e["phone"])
        if not user_data:
            continue
        data_payload.append({
            "event_name": "Purchase",
            "event_time": int(time.time()),
            "action_source": "system_generated",
            "user_data": user_data,
            "custom_data": {"currency": e.get("currency", "BRL"), "value": float(e.get("value") or 0)},
        })

    if not data_payload:
        return {"sent": 0, "reason": "Sem email/telefone hasheado"}

    # Note: requires Offline Event Set ID (dataset_id). We attempt to auto-discover the first.
    try:
        sets = await client._request("GET", f"/{client.ad_account_id}/offline_conversion_data_sets",
                                     params={"fields": "id,name", "limit": 5})
    except MetaAPIError as ex:
        raise HTTPException(status_code=400, detail=ex.detail)
    datasets = sets.get("data", []) if isinstance(sets, dict) else []
    if not datasets:
        raise HTTPException(status_code=400, detail="Nenhum Offline Event Set configurado na sua Business Manager")
    dataset_id = datasets[0]["id"]

    import json as _json
    try:
        res = await client._request("POST", f"/{dataset_id}/events", data={
            "data": _json.dumps(data_payload),
            "upload_tag": f"autopilot_{int(time.time())}",
        })
    except MetaAPIError as ex:
        raise HTTPException(status_code=400, detail=ex.detail)

    ids = [e["id"] for e in to_send]
    await db.crm_events.update_many(
        {"id": {"$in": ids}},
        {"$set": {"synced_to_meta": True, "synced_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"sent": len(data_payload), "dataset_id": dataset_id, "meta_response": res}
