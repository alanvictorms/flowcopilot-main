"""Strategy Memory — persistent AI memory of decisions, winners, losers per account."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services.activity import log_activity, get_agent_profile, consolidate_user_profile

router = APIRouter(prefix="/api/memory", tags=["memory"])


class MemoryIn(BaseModel):
    kind: str  # winner | loser | learning | audience | creative | offer | test_result
    title: str
    detail: str = ""
    tags: list[str] = []
    metrics: dict = {}


class MemoryOut(MemoryIn):
    id: str
    created_at: str


@router.get("", response_model=list[MemoryOut])
async def list_memories(
    kind: str = "",
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q = {"user_id": user["id"]}
    if kind:
        q["kind"] = kind
    cur = db.strategy_memory.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(200)
    return [d async for d in cur]


@router.post("", response_model=MemoryOut)
async def add(
    body: MemoryIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.strategy_memory.insert_one({**doc})
    doc.pop("user_id", None)
    await log_activity(db, user["id"], "memory_added",
                       f"Registrou aprendizado: {doc.get('title')}", {"kind": doc.get("kind")})
    return doc


@router.delete("/{mem_id}")
async def delete(mem_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.strategy_memory.delete_one({"id": mem_id, "user_id": user["id"]})
    return {"ok": True}


@router.get("/profile")
async def agent_profile(
    refresh: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Perfil consolidado de operação do usuário — como o agente deve se comportar."""
    if refresh:
        await consolidate_user_profile(db, user["id"], force=True)
    profile = await get_agent_profile(db, user["id"])
    return profile or {"consolidated": False,
                       "hint_pt": "Ainda sem perfil consolidado — ele é gerado após 24h de atividade."}


@router.get("/activity")
async def activity_feed(
    limit: int = 100,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Trilha de tudo que foi feito neste workspace."""
    cur = db.user_activity.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


@router.get("/context")
async def context(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Compact JSON summary to inject into AI prompts."""
    cur = db.strategy_memory.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(80)
    memories = [d async for d in cur]
    grouped = {}
    for m in memories:
        grouped.setdefault(m["kind"], []).append({
            "title": m["title"], "detail": m.get("detail", ""), "tags": m.get("tags", []),
        })
    return {"memory": grouped, "total": len(memories)}
