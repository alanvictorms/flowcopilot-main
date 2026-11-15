"""Autonomy Control Center — sets automation mode + guardrails."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user
from services.activity import log_activity

router = APIRouter(prefix="/api/autonomy", tags=["autonomy"])


class AutonomySettings(BaseModel):
    mode: str = "recommend"  # recommend | approve | auto
    kill_switch: bool = False
    max_daily_spend_change_pct: float = 20.0
    max_budget_increase_pct: float = 30.0
    max_budget_decrease_pct: float = 50.0
    allowed_actions: list[str] = Field(default_factory=lambda: ["pause", "activate"])
    require_approval_actions: list[str] = Field(default_factory=lambda: ["change_budget"])
    min_data_points: int = 100
    cooldown_minutes: int = 60
    # Guardrails do Control Plane
    min_conversions: int = 5                    # conversões mínimas p/ evidência estatística
    max_actions_per_day: int = 20               # teto de ações executadas por 24h
    observation_hours: int = 24                 # janela padrão de pós-verificação
    rollback_degradation_pct: float = 30.0      # degradação que dispara rollback automático
    approval_budget_change_pct: float = 25.0    # variação de orçamento acima disso exige humano
    # Proteção financeira (Budget Pacing / stop-loss)
    stop_loss_daily_spend: float = 0.0          # 0 = desativado; gasto/dia acima disso congela
    stop_loss_zero_conversion_spend: float = 100.0  # gasto sem nenhuma conversão que dispara pausa


DEFAULTS = AutonomySettings().model_dump()


@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.autonomy_settings.find_one({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
    return doc or DEFAULTS


@router.put("/settings")
async def update_settings(
    body: AutonomySettings,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = body.model_dump()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.autonomy_settings.update_one(
        {"user_id": user["id"]}, {"$set": {**doc, "user_id": user["id"]}}, upsert=True
    )
    await log_activity(db, user["id"], "autonomy_updated",
                       f"Alterou autonomia: modo {doc.get('mode')}",
                       {"mode": doc.get("mode"), "allowed_actions": doc.get("allowed_actions")})
    return doc


@router.post("/kill-switch")
async def toggle_kill_switch(
    engage: bool = True,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.autonomy_settings.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "kill_switch": engage, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await log_activity(db, user["id"], "kill_switch",
                       "Acionou o kill switch" if engage else "Desligou o kill switch",
                       {"engaged": engage})
    return {"kill_switch": engage}


async def load_autonomy(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    doc = await db.autonomy_settings.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    return doc or DEFAULTS
