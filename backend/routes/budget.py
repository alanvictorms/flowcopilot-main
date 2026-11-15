"""Smart Budget Manager — projections + reallocation suggestions."""
import calendar
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services import ai_service
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/budget", tags=["budget"])


def _f(x):
    try: return float(x or 0)
    except Exception: return 0.0


@router.get("/analyze")
async def analyze(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        account = await client.get_ad_account()
        campaigns = await client.list_campaigns()
        adsets = await client.list_adsets()
        insights_today = await client.insights(level="campaign", date_preset="today")
        insights_7d = await client.insights(level="campaign", date_preset="last_7d")
        insights_30d = await client.insights(level="campaign", date_preset="last_30d")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    now = datetime.now(timezone.utc)
    hours_elapsed = now.hour + now.minute / 60.0
    hours_remaining = max(24 - hours_elapsed, 0.1)

    spend_today = sum(_f(r.get("spend")) for r in insights_today)
    spend_7d = sum(_f(r.get("spend")) for r in insights_7d)
    daily_avg_7d = spend_7d / 7.0 if spend_7d else 0.0
    projected_today = spend_today * (24.0 / max(hours_elapsed, 0.5)) if hours_elapsed > 0.5 else daily_avg_7d
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    projected_month = projected_today * days_in_month

    total_daily_budget = 0
    campaigns_by_id = {c["id"]: c for c in campaigns}
    adset_budget_by_campaign = {}
    for a in adsets:
        cid = a.get("campaign_id")
        db_cents = int(a.get("daily_budget") or 0)
        if db_cents:
            total_daily_budget += db_cents / 100.0
            adset_budget_by_campaign[cid] = adset_budget_by_campaign.get(cid, 0) + db_cents / 100.0

    # Per-campaign performance
    perf = []
    ins_by_id = {r.get("campaign_id"): r for r in insights_7d}
    for c in campaigns:
        cid = c["id"]
        r = ins_by_id.get(cid, {})
        spend_c = _f(r.get("spend"))
        clicks_c = _f(r.get("clicks"))
        ctr_c = _f(r.get("ctr"))
        purchases_c = 0.0
        for a in r.get("actions", []) or []:
            if a.get("action_type") == "purchase":
                purchases_c += _f(a.get("value"))
        roas_c = 0.0
        for rr in r.get("purchase_roas", []) or []:
            v = _f(rr.get("value"))
            if v > roas_c: roas_c = v
        cpa = spend_c / purchases_c if purchases_c else 0
        daily_b = adset_budget_by_campaign.get(cid, 0)
        planned_7d = daily_b * 7
        pace = (spend_c / planned_7d * 100) if planned_7d else 0
        perf.append({
            "id": cid,
            "name": c.get("name"),
            "status": c.get("effective_status"),
            "daily_budget": round(daily_b, 2),
            "spend_7d": round(spend_c, 2),
            "pace_pct": round(pace, 1),
            "ctr": round(ctr_c, 2),
            "roas": round(roas_c, 2),
            "cpa": round(cpa, 2),
            "purchases": int(purchases_c),
        })

    overspenders = sorted([p for p in perf if p["pace_pct"] > 110], key=lambda x: -x["pace_pct"])[:5]
    underspenders = sorted([p for p in perf if 0 < p["pace_pct"] < 60 and p["daily_budget"] > 0], key=lambda x: x["pace_pct"])[:5]
    winners = sorted([p for p in perf if p["roas"] >= 1.5], key=lambda x: -x["roas"])[:5]
    losers = sorted([p for p in perf if p["roas"] > 0 and p["roas"] < 1.0], key=lambda x: x["roas"])[:5]

    return {
        "account": {"name": account.get("name"), "currency": account.get("currency")},
        "projections": {
            "spend_today": round(spend_today, 2),
            "projected_today": round(projected_today, 2),
            "daily_avg_7d": round(daily_avg_7d, 2),
            "projected_month": round(projected_month, 2),
            "planned_daily_budget": round(total_daily_budget, 2),
            "hours_elapsed": round(hours_elapsed, 1),
            "hours_remaining": round(hours_remaining, 1),
        },
        "overspenders": overspenders,
        "underspenders": underspenders,
        "winners": winners,
        "losers": losers,
        "campaigns": perf,
    }


@router.post("/redistribute-suggest")
async def redistribute_suggest(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """AI-driven budget reallocation suggestions grounded on /analyze payload."""
    analysis = await analyze(user=user, db=db)
    prompt_ctx = {
        "projections": analysis["projections"],
        "winners": analysis["winners"],
        "losers": analysis["losers"],
        "overspenders": analysis["overspenders"],
        "underspenders": analysis["underspenders"],
    }
    suggestions = await ai_service.suggest_optimizations(prompt_ctx)
    return {"analysis": prompt_ctx, "suggestions": suggestions}
