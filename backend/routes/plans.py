"""Subscription Plans — CRUD (admin) + listing (user) + resource pricing."""
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user, require_admin

router = APIRouter(prefix="/api/plans", tags=["plans"])


# ── Models ──────────────────────────────────────────────────────────
class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = ""
    price: float = Field(ge=0)
    credits: int = Field(ge=0)
    duration_days: int = Field(default=30, ge=1)
    features: List[str] = []
    highlight: bool = False
    order: int = 0


class ResourcePricingIn(BaseModel):
    resource_key: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=80)
    credits_per_use: int = Field(ge=0)
    description: str = ""


# ── Public: list active plans ───────────────────────────────────────
@router.get("/")
async def list_plans(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.subscription_plans.find({"active": True}, {"_id": 0}).sort("order", 1)
    return [p async for p in cursor]


@router.get("/{plan_id}")
async def get_plan(plan_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    p = await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return p


# ── Admin: CRUD plans ──────────────────────────────────────────────
@router.get("/admin/all")
async def admin_list_plans(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.subscription_plans.find({}, {"_id": 0}).sort("order", 1)
    return [p async for p in cursor]


@router.post("/admin/create")
async def create_plan(body: PlanIn, admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscription_plans.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@router.patch("/admin/{plan_id}")
async def update_plan(
    plan_id: str,
    body: PlanIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    res = await db.subscription_plans.update_one(
        {"id": plan_id},
        {"$set": {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return {"ok": True}


@router.delete("/admin/{plan_id}")
async def toggle_plan(plan_id: str, admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    plan = await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0, "active": 1})
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    new_active = not plan.get("active", True)
    await db.subscription_plans.update_one({"id": plan_id}, {"$set": {"active": new_active}})
    return {"ok": True, "active": new_active}


# ── Resource Pricing (admin) ───────────────────────────────────────
@router.get("/admin/resources")
async def list_resource_pricing(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.resource_pricing.find({}, {"_id": 0}).sort("resource_key", 1)
    return [r async for r in cursor]


@router.post("/admin/resources")
async def upsert_resource_pricing(
    body: ResourcePricingIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.resource_pricing.update_one(
        {"resource_key": body.resource_key},
        {"$set": {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/admin/resources/{resource_key}")
async def delete_resource_pricing(
    resource_key: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.resource_pricing.delete_one({"resource_key": resource_key})
    return {"ok": True}


# ── User subscription status ──────────────────────────────────────
@router.get("/my-subscription")
async def my_subscription(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    sub = await db.user_subscriptions.find_one(
        {"user_id": user["id"], "status": "active"}, {"_id": 0}
    )
    if sub:
        plan = await db.subscription_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0})
        sub["plan"] = plan
    return sub
