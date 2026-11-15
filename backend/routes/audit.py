"""Audit routes: run the 250+ weighted audit and return the report."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services.audit_engine import run_audit
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.post("/run")
async def run_full_audit(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        account = await client.get_ad_account()
        campaigns = await client.list_campaigns()
        adsets = await client.list_adsets()
        ads = await client.list_ads()
        insights_c = await client.insights(level="campaign", date_preset="last_30d")
        insights_a = await client.insights(level="ad", date_preset="last_30d")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    report = run_audit(account, campaigns, adsets, ads, insights_c, insights_a)
    audit_id = str(uuid.uuid4())
    audit_doc = {
        "id": audit_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "report": report,
    }
    await db.audits.insert_one({**audit_doc})
    return {"id": audit_id, **report}


@router.get("/latest")
async def latest_audit(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.audits.find_one({"user_id": user["id"]}, sort=[("created_at", -1)])
    if not doc:
        raise HTTPException(status_code=404, detail="No audit yet. Run one first.")
    return {"id": doc["id"], **doc["report"]}


@router.get("/history")
async def audit_history(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.audits.find(
        {"user_id": user["id"]},
        {"_id": 0, "id": 1, "created_at": 1, "report.overall_score": 1, "report.grade": 1, "report.coverage_pct": 1}
    ).sort("created_at", -1).limit(30)
    items = []
    async for d in cursor:
        r = d.get("report", {})
        items.append({
            "id": d["id"],
            "created_at": d["created_at"],
            "overall_score": r.get("overall_score"),
            "coverage_pct": r.get("coverage_pct"),
            "grade": r.get("grade"),
        })
    return items
