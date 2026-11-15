"""Decision Ledger — unified audit trail across manual, rules, auto, AI decisions."""
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from services.db import get_db
from services.security import get_current_user

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@router.get("/entries")
async def entries(
    limit: int = 200,
    target_type: Optional[str] = None,
    kind: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q = {"user_id": user["id"]}
    if target_type: q["target_type"] = target_type
    if kind: q["kind"] = kind
    cur = db.optimization_events.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(limit)
    events = [d async for d in cur]

    # Also include automation_runs summarised
    runs_cur = db.automation_runs.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(50)
    runs = []
    async for r in runs_cur:
        res = r.get("result") or {}
        runs.append({
            "kind": "cycle_run",
            "created_at": r.get("created_at"),
            "manual": r.get("manual", False),
            "skipped": res.get("skipped", False),
            "reason": res.get("reason"),
            "rules_count": len(res.get("rules") or []),
        })

    return {"events": events, "runs": runs}


@router.get("/stats")
async def stats(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    total = await db.optimization_events.count_documents({"user_id": user["id"]})
    reverted = await db.optimization_events.count_documents({"user_id": user["id"], "rolled_back": True})
    by_kind = {}
    async for d in db.optimization_events.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
    ]):
        by_kind[d["_id"] or "unknown"] = d["count"]
    return {"total": total, "reverted": reverted, "by_kind": by_kind}


# ------------------- Decision Ledger v2 (registro imutável do Control Plane) --

@router.get("/decisions")
async def decisions(
    limit: int = 200,
    kind: Optional[str] = None,
    actor: Optional[str] = None,
    target_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Trilha append-only: quem decidiu, evidências, antes/depois, verificação."""
    q = {"user_id": user["id"]}
    if kind: q["kind"] = kind
    if actor: q["actor"] = actor
    if target_id: q["target_id"] = target_id
    cur = db.decision_ledger.find(q, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


@router.get("/decisions/stats")
async def decisions_stats(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    by_kind, by_actor = {}, {}
    async for d in db.decision_ledger.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
    ]):
        by_kind[d["_id"] or "unknown"] = d["count"]
    async for d in db.decision_ledger.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": "$actor", "count": {"$sum": 1}}},
    ]):
        by_actor[d["_id"] or "unknown"] = d["count"]
    total = await db.decision_ledger.count_documents({"user_id": user["id"]})
    return {"total": total, "by_kind": by_kind, "by_actor": by_actor,
            "executed": by_kind.get("action_executed", 0),
            "rolled_back": by_kind.get("action_rolled_back", 0),
            "verified": by_kind.get("action_verified", 0),
            "blocked": by_kind.get("action_blocked", 0)}
