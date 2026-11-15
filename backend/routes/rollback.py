"""Rollback: list optimization events and reverse them."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/rollback", tags=["rollback"])


@router.get("/events")
async def events(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.optimization_events.find(
        {"user_id": user["id"], "before_state": {"$exists": True}, "rolled_back": {"$ne": True}},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", -1).limit(50)
    return [d async for d in cur]


@router.get("/all")
async def all_events(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.optimization_events.find(
        {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).limit(100)
    return [d async for d in cur]


@router.post("/{event_id}")
async def rollback(
    event_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    ev = await db.optimization_events.find_one({"_id_hint": event_id, "user_id": user["id"]}) or \
         await db.optimization_events.find_one({"id": event_id, "user_id": user["id"]})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    if ev.get("rolled_back"):
        raise HTTPException(status_code=400, detail="Evento já revertido")
    before = ev.get("before_state") or {}
    if not before:
        raise HTTPException(status_code=400, detail="Sem estado anterior salvo — não pode reverter")

    client = await get_meta_client(user, db)
    target_type = ev.get("target_type")
    target_id = ev.get("target_id")
    try:
        if target_type == "campaign":
            await client.update_campaign(target_id, before)
        elif target_type == "adset":
            await client.update_adset(target_id, before)
        elif target_type == "ad":
            await client.update_ad(target_id, before)
        else:
            raise HTTPException(status_code=400, detail="Tipo de alvo desconhecido")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    await db.optimization_events.update_one(
        {"id": ev.get("id")},
        {"$set": {"rolled_back": True, "rolled_back_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "reverted_to": before}
