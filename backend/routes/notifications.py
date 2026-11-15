"""ponytail: STUB de recuperação — original perdido. Lista vazia / no-ops."""
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from services.db import get_db
from services.security import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@router.get("")
@router.get("/")
async def list_notifications(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)
    return [d async for d in cur]

@router.post("/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    return {"ok": True}
