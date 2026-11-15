"""Rotas do Monitor de Tracking — varredura, incidentes e resolução."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services import tracking_monitor
from services.activity import log_activity

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


@router.post("/scan")
async def scan(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    result = await tracking_monitor.run_scan(db, user["id"])
    return result


@router.get("/status")
async def status(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    series = await tracking_monitor.daily_account_series(db, user["id"], days=14)
    crm = await tracking_monitor.crm_daily_series(db, user["id"], days=14)
    open_cur = db.tracking_incidents.find(
        {"user_id": user["id"], "status": "open"}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1)
    open_incidents = [d async for d in open_cur]
    return {
        "series": series,
        "crm_daily": crm,
        "open_incidents": open_incidents,
        "healthy": len(open_incidents) == 0,
    }


@router.get("/incidents")
async def incidents(
    include_resolved: bool = True,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q = {"user_id": user["id"]}
    if not include_resolved:
        q["status"] = "open"
    cur = db.tracking_incidents.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(50)
    return [d async for d in cur]


@router.post("/incidents/{incident_id}/resolve")
async def resolve(incident_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await db.tracking_incidents.update_one(
        {"id": incident_id, "user_id": user["id"], "status": "open"},
        {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Incidente não encontrado ou já resolvido")
    await log_activity(db, user["id"], "incident_resolved",
                       "Resolveu um incidente de tracking", {"incident_id": incident_id})
    return {"ok": True, "incident_id": incident_id}
