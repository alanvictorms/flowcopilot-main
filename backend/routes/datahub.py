"""Rotas do Hub Unificado de Dados — sync, status, séries e comparações."""
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services import data_hub
from services.stats_engine import compare_to_baseline, trend
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/datahub", tags=["datahub"])


@router.post("/sync")
async def sync(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        result = await data_hub.sync_user(db, user["id"], client)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    return result


@router.get("/status")
async def status(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    return await data_hub.data_freshness(db, user["id"])


@router.get("/series")
async def series(
    object_id: str,
    metric: str = "spend",
    days: int = 30,
    level: str = "campaign",
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    points = await data_hub.get_series(db, user["id"], object_id, metric, days, level)
    return {
        "object_id": object_id,
        "metric": metric,
        "points": points,
        "trend": trend([p["value"] for p in points]),
    }


@router.get("/compare")
async def compare(
    object_id: str,
    days: int = 7,
    level: str = "campaign",
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Período atual vs período anterior de mesmo tamanho."""
    current = await data_hub.aggregate_period(db, user["id"], object_id, days, 0, level)
    previous = await data_hub.aggregate_period(db, user["id"], object_id, days, days, level)
    deltas = {}
    for m in ["spend", "purchases", "leads", "cpa", "cpl", "roas", "ctr"]:
        deltas[m] = compare_to_baseline(float(current.get(m) or 0), float(previous.get(m) or 0))
    return {"object_id": object_id, "days": days, "current": current, "previous": previous, "deltas": deltas}
