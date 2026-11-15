"""Automation rules routes."""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services.rules_engine import evaluate_rule
from services.activity import log_activity
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/rules", tags=["rules"])


class Condition(BaseModel):
    metric: str  # spend, impressions, clicks, ctr, cpc, cpm, frequency, purchases, roas
    operator: str  # >, >=, <, <=, ==, !=
    value: float


class Action(BaseModel):
    type: str  # pause | activate | change_budget | notify
    params: dict = Field(default_factory=dict)


class RuleIn(BaseModel):
    name: str
    enabled: bool = True
    scope: str = "campaign"  # campaign | adset | ad
    logic: str = "all"       # all | any
    conditions: list[Condition]
    action: Action
    window: str = "last_7d"  # date preset


class RuleOut(RuleIn):
    id: str
    created_at: str


@router.get("", response_model=list[RuleOut])
async def list_rules(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.automation_rules.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return [d async for d in cursor]


@router.post("", response_model=RuleOut)
async def create_rule(body: RuleIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.automation_rules.insert_one({**doc})
    doc.pop("_id", None)
    doc.pop("user_id", None)
    await log_activity(db, user["id"], "rule_created",
                       f"Criou a regra '{doc.get('name')}'",
                       {"rule_id": doc["id"], "action": (doc.get("action") or {}).get("type")})
    return doc


@router.patch("/{rule_id}", response_model=RuleOut)
async def update_rule(rule_id: str, body: RuleIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    patch = body.model_dump()
    res = await db.automation_rules.update_one({"id": rule_id, "user_id": user["id"]}, {"$set": patch})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Rule not found")
    d = await db.automation_rules.find_one({"id": rule_id}, {"_id": 0, "user_id": 0})
    await log_activity(db, user["id"], "rule_updated",
                       f"Atualizou a regra '{patch.get('name')}'", {"rule_id": rule_id})
    return d


@router.delete("/{rule_id}")
async def delete_rule(rule_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.automation_rules.delete_one({"id": rule_id, "user_id": user["id"]})
    await log_activity(db, user["id"], "rule_deleted", "Excluiu uma regra", {"rule_id": rule_id})
    return {"ok": True}


@router.post("/{rule_id}/run")
async def run_rule(
    rule_id: str,
    dry_run: bool = True,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    rule = await db.automation_rules.find_one({"id": rule_id, "user_id": user["id"]}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    client = await get_meta_client(user, db)
    try:
        insights = await client.insights(level=rule.get("scope", "campaign"), date_preset=rule.get("window", "last_7d"))
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    matches = evaluate_rule(rule, insights)
    applied = []
    action = rule.get("action") or {}
    if not dry_run and matches:
        scope = rule.get("scope", "campaign")
        for m in matches:
            tid = m["target_id"]
            try:
                if action.get("type") == "pause":
                    if scope == "campaign":
                        await client.update_campaign(tid, {"status": "PAUSED"})
                    elif scope == "adset":
                        await client.update_adset(tid, {"status": "PAUSED"})
                    elif scope == "ad":
                        await client.update_ad(tid, {"status": "PAUSED"})
                    applied.append({"target_id": tid, "action": "paused"})
                elif action.get("type") == "activate":
                    if scope == "campaign":
                        await client.update_campaign(tid, {"status": "ACTIVE"})
                    elif scope == "adset":
                        await client.update_adset(tid, {"status": "ACTIVE"})
                    elif scope == "ad":
                        await client.update_ad(tid, {"status": "ACTIVE"})
                    applied.append({"target_id": tid, "action": "activated"})
                elif action.get("type") == "change_budget" and scope == "adset":
                    params = action.get("params") or {}
                    patch = {}
                    if "daily_budget" in params:
                        patch["daily_budget"] = int(params["daily_budget"])
                    if "lifetime_budget" in params:
                        patch["lifetime_budget"] = int(params["lifetime_budget"])
                    if patch:
                        await client.update_adset(tid, patch)
                        applied.append({"target_id": tid, "action": "budget_updated", "patch": patch})
                # notify handled by returning matches
            except MetaAPIError as e:
                applied.append({"target_id": tid, "action": "error", "error": str(e.detail)[:200]})
        await db.optimization_events.insert_one({
            "user_id": user["id"], "kind": "rule",
            "rule_id": rule_id, "matches": matches, "applied": applied,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return {"rule_id": rule_id, "matches": matches, "applied": applied, "dry_run": dry_run}


@router.get("/events/recent")
async def recent_events(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.optimization_events.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(30)
    return [d async for d in cursor]
