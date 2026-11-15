"""Credit system — balance checks, debits, credits, transaction logging."""
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_balance(db: AsyncIOMotorDatabase, user_id: str) -> int:
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if not wallet:
        await db.wallets.insert_one({
            "user_id": user_id,
            "balance": 0,
            "total_earned": 0,
            "total_spent": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return 0
    return wallet.get("balance", 0)


async def add_credits(
    db: AsyncIOMotorDatabase,
    user_id: str,
    amount: int,
    tx_type: str,
    description: str,
    ref_id: str = None,
) -> int:
    wallet = await db.wallets.find_one({"user_id": user_id})
    if not wallet:
        await db.wallets.insert_one({
            "user_id": user_id,
            "balance": 0,
            "total_earned": 0,
            "total_spent": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    result = await db.wallets.find_one_and_update(
        {"user_id": user_id},
        {"$inc": {"balance": amount, "total_earned": amount}},
        return_document=True,
    )
    new_balance = result["balance"]
    await db.credit_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": tx_type,
        "amount": amount,
        "balance_after": new_balance,
        "description": description,
        "ref_id": ref_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return new_balance


async def debit_credits(
    db: AsyncIOMotorDatabase,
    user_id: str,
    amount: int,
    resource_key: str,
    description: str,
) -> int:
    balance = await get_balance(db, user_id)
    if balance < amount:
        return -1
    result = await db.wallets.find_one_and_update(
        {"user_id": user_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount, "total_spent": amount}},
        return_document=True,
    )
    if not result:
        return -1
    new_balance = result["balance"]
    await db.credit_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "usage",
        "amount": -amount,
        "balance_after": new_balance,
        "resource_key": resource_key,
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return new_balance


async def resource_cost(db: AsyncIOMotorDatabase, resource_key: str) -> int:
    """Custo em créditos de um recurso (0 = grátis / não cadastrado / desativado)."""
    r = await db.resource_pricing.find_one(
        {"resource_key": resource_key}, {"_id": 0, "credits_per_use": 1, "active": 1})
    if not r or r.get("active") is False:
        return 0
    return int(r.get("credits_per_use") or 0)


async def charge_resource(
    db: AsyncIOMotorDatabase,
    user_id: str,
    resource_key: str,
    description: str = None,
) -> dict:
    """
    Cobra o custo do recurso do saldo do usuário. Chame ANTES de rodar a IA.
    Levanta HTTP 402 se não houver saldo. Recursos com custo 0 passam livres.
    """
    cost = await resource_cost(db, resource_key)
    if cost <= 0:
        return {"charged": 0, "balance": await get_balance(db, user_id)}
    new_balance = await debit_credits(db, user_id, cost, resource_key,
                                      description or f"Uso do recurso: {resource_key}")
    if new_balance < 0:
        raise HTTPException(
            status_code=402,
            detail=f"Créditos insuficientes. Este recurso custa {cost} crédito(s). "
                   f"Recarregue na Carteira para continuar.",
        )
    return {"charged": cost, "balance": new_balance}
