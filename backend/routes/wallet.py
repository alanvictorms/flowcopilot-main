"""ponytail: STUB de recuperação (parcial) — original perdido. Saldo real via credits."""
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from services.db import get_db
from services.security import get_current_user
from services.credits import get_balance

router = APIRouter(prefix="/api/wallet", tags=["wallet"])

@router.get("/balance")
async def balance(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    return {"balance": await get_balance(db, user["id"])}

@router.get("/transactions")
async def transactions(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.credit_transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)
    return [d async for d in cur]
