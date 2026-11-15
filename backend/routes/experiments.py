"""Experiment Engine — A/B test framework with winner picking."""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


class Variant(BaseModel):
    name: str
    target_type: str  # ad | adset | campaign
    target_id: str


class ExperimentIn(BaseModel):
    name: str
    hypothesis: str = ""
    kind: str = "creative"  # creative | audience | offer | budget | landing_page
    variants: list[Variant]
    winning_metric: str = "roas"  # roas | ctr | cpa | purchases
    min_data_points: int = 100
    duration_days: int = 7
    budget_daily: float = 20.0


class ExperimentOut(ExperimentIn):
    id: str
    status: str
    created_at: str
    ends_at: str
    winner: dict | None = None
    results: list = []


def _f(x):
    try: return float(x or 0)
    except Exception: return 0.0


@router.get("", response_model=list[ExperimentOut])
async def list_experiments(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.experiments.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(50)
    return [d async for d in cur]


@router.post("", response_model=ExperimentOut)
async def create(body: ExperimentIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    now = datetime.now(timezone.utc)
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["status"] = "running"
    doc["created_at"] = now.isoformat()
    doc["ends_at"] = (now + timedelta(days=body.duration_days)).isoformat()
    doc["winner"] = None
    doc["results"] = []
    await db.experiments.insert_one({**doc})
    doc.pop("user_id", None)
    return doc


@router.post("/{exp_id}/evaluate")
async def evaluate(exp_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    exp = await db.experiments.find_one({"id": exp_id, "user_id": user["id"]})
    if not exp:
        raise HTTPException(status_code=404, detail="Experimento não encontrado")

    client = await get_meta_client(user, db)
    variants = exp.get("variants", [])
    metric = exp.get("winning_metric", "roas")
    results = []
    try:
        level = variants[0]["target_type"] if variants else "ad"
        insights = await client.insights(level=level, date_preset="last_7d")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    id_key = {"ad": "ad_id", "adset": "adset_id", "campaign": "campaign_id"}.get(level, "ad_id")
    by_id = {r.get(id_key): r for r in insights}

    for v in variants:
        r = by_id.get(v["target_id"], {})
        spend = _f(r.get("spend"))
        impr = _f(r.get("impressions"))
        clicks = _f(r.get("clicks"))
        purchases = 0.0
        for a in r.get("actions") or []:
            if a.get("action_type") == "purchase":
                purchases += _f(a.get("value"))
        roas = 0.0
        for rr in r.get("purchase_roas") or []:
            v2 = _f(rr.get("value"))
            if v2 > roas: roas = v2
        ctr = _f(r.get("ctr"))
        cpa = spend / purchases if purchases else 0
        value = {"roas": roas, "ctr": ctr, "cpa": cpa, "purchases": purchases}.get(metric, roas)
        results.append({
            "variant_name": v["name"],
            "name": v["name"],
            "target_id": v["target_id"],
            "spend": round(spend, 2),
            "impressions": int(impr),
            "clicks": int(clicks),
            "purchases": int(purchases),
            "conversions": int(purchases),
            "ctr": round(ctr, 2),
            "cpa": round(cpa, 2),
            "roas": round(roas, 2),
            "metric_value": round(value, 3),
            "sufficient_data": impr >= exp.get("min_data_points", 100),
        })

    # Decisão estatística: z-test entre as duas melhores variantes elegíveis.
    # Sem significância = experimento continua, sem "vencedor" precipitado.
    from services.stats_engine import pick_winner
    verdict = pick_winner(results, metric=metric, min_conversions=5 if metric != "ctr" else 0)
    winner = verdict.get("winner")

    status = "completed" if winner else "running"
    ends_at = exp.get("ends_at")
    expired = False
    try:
        if ends_at and datetime.fromisoformat(ends_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
            expired = True
            status = "completed"
    except Exception:
        pass
    # Prazo venceu sem significância → encerra com o líder, sinalizando incerteza
    if expired and not winner and verdict.get("leader"):
        winner = verdict["leader"]
        verdict["explanation_pt"] += " Prazo do experimento expirou — líder promovido sem significância plena."

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.experiments.update_one(
        {"id": exp_id, "user_id": user["id"]},
        {"$set": {"results": results, "winner": winner, "status": status,
                  "statistical_verdict": verdict, "evaluated_at": now_iso}},
    )

    # Registro automático do aprendizado na Strategy Memory ao concluir
    if status == "completed" and winner and not exp.get("memory_recorded"):
        await db.strategy_memory.insert_one({
            "id": str(uuid.uuid4()), "user_id": user["id"], "kind": "test_result",
            "title": f"Experimento '{exp.get('name')}': vencedor {winner.get('variant_name')}",
            "detail": (f"Hipótese: {exp.get('hypothesis') or '—'}. Métrica: {metric}. "
                       f"{verdict.get('explanation_pt', '')}"),
            "tags": ["experimento", exp.get("kind", "creative")],
            "metrics": {"metric": metric, "winner_value": winner.get("metric_value"),
                        "p_value": verdict.get("p_value")},
            "created_at": now_iso,
        })
        await db.experiments.update_one({"id": exp_id}, {"$set": {"memory_recorded": True}})

    return {"id": exp_id, "results": results, "winner": winner,
            "statistical_verdict": verdict, "status": status}


@router.post("/{exp_id}/apply-winner")
async def apply_winner(exp_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    exp = await db.experiments.find_one({"id": exp_id, "user_id": user["id"]})
    if not exp or not exp.get("winner"):
        raise HTTPException(status_code=400, detail="Sem vencedor definido. Rode /evaluate primeiro.")

    client = await get_meta_client(user, db)
    winner_id = exp["winner"]["target_id"]
    variants = exp.get("variants", [])
    paused = []
    for v in variants:
        if v["target_id"] == winner_id:
            continue
        try:
            if v["target_type"] == "ad": await client.update_ad(v["target_id"], {"status": "PAUSED"})
            elif v["target_type"] == "adset": await client.update_adset(v["target_id"], {"status": "PAUSED"})
            elif v["target_type"] == "campaign": await client.update_campaign(v["target_id"], {"status": "PAUSED"})
            paused.append(v["target_id"])
        except MetaAPIError:
            pass

    await db.experiments.update_one({"id": exp_id, "user_id": user["id"]},
                                    {"$set": {"applied": True, "applied_at": datetime.now(timezone.utc).isoformat()}})
    return {"winner_id": winner_id, "paused_variants": paused}


@router.delete("/{exp_id}")
async def delete(exp_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.experiments.delete_one({"id": exp_id, "user_id": user["id"]})
    return {"ok": True}
