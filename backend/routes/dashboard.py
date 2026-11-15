"""Dashboard aggregation routes (KPIs + timeseries)."""
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _f(x):
    try:
        return float(x or 0)
    except Exception:
        return 0.0


@router.get("/overview")
async def overview(
    date_preset: str = "last_30d",
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        account = await client.get_ad_account()
        campaigns = await client.list_campaigns()
        insights = await client.insights(level="campaign", date_preset=date_preset)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    total_spend = sum(_f(r.get("spend")) for r in insights)
    total_impr = sum(_f(r.get("impressions")) for r in insights)
    total_clicks = sum(_f(r.get("clicks")) for r in insights)
    ctr = (total_clicks / total_impr * 100.0) if total_impr else 0.0
    cpc = (total_spend / total_clicks) if total_clicks else 0.0
    cpm = (total_spend / total_impr * 1000.0) if total_impr else 0.0

    purchases = 0.0
    roas_vals = []
    for r in insights:
        for a in r.get("actions") or []:
            if a.get("action_type") == "purchase":
                purchases += _f(a.get("value"))
        for rr in r.get("purchase_roas") or []:
            v = _f(rr.get("value"))
            if v > 0:
                roas_vals.append(v)
    avg_roas = sum(roas_vals) / len(roas_vals) if roas_vals else 0.0
    cpa = (total_spend / purchases) if purchases else 0.0

    active_campaigns = sum(1 for c in campaigns if c.get("effective_status") == "ACTIVE")

    # daily timeseries
    try:
        daily = await client.insights(level="account", date_preset=date_preset)
    except MetaAPIError:
        daily = []
    ts_map = defaultdict(lambda: {"spend": 0.0, "impressions": 0.0, "clicks": 0.0, "purchases": 0.0})
    # Better: pull daily using time_increment=1 via a separate call
    try:
        daily_series = await client._request(  # type: ignore
            "GET",
            f"/{client.ad_account_id}/insights",
            params={
                "level": "account",
                "date_preset": date_preset,
                "time_increment": 1,
                "fields": "spend,impressions,clicks,actions",
                "limit": 500,
            },
        )
        for row in daily_series.get("data", []):
            key = row.get("date_start", "")
            ts_map[key]["spend"] = _f(row.get("spend"))
            ts_map[key]["impressions"] = _f(row.get("impressions"))
            ts_map[key]["clicks"] = _f(row.get("clicks"))
            p = 0.0
            for a in row.get("actions", []) or []:
                if a.get("action_type") == "purchase":
                    p += _f(a.get("value"))
            ts_map[key]["purchases"] = p
    except Exception:
        pass

    timeseries = [{"date": k, **v} for k, v in sorted(ts_map.items())]

    return {
        "account": {
            "id": account.get("id"),
            "name": account.get("name"),
            "currency": account.get("currency"),
            "status": account.get("account_status"),
        },
        "kpis": {
            "spend": round(total_spend, 2),
            "impressions": int(total_impr),
            "clicks": int(total_clicks),
            "ctr_pct": round(ctr, 2),
            "cpc": round(cpc, 3),
            "cpm": round(cpm, 2),
            "purchases": int(purchases),
            "avg_roas": round(avg_roas, 2),
            "cpa": round(cpa, 2),
            "active_campaigns": active_campaigns,
            "total_campaigns": len(campaigns),
        },
        "timeseries": timeseries,
        "top_campaigns": sorted(
            [
                {
                    "id": r.get("campaign_id"),
                    "name": r.get("campaign_name"),
                    "spend": _f(r.get("spend")),
                    "clicks": _f(r.get("clicks")),
                    "ctr": _f(r.get("ctr")),
                    "cpc": _f(r.get("cpc")),
                    "purchases": sum(_f(a.get("value")) for a in (r.get("actions") or []) if a.get("action_type") == "purchase"),
                    "roas": (r.get("purchase_roas") or [{}])[0].get("value") if r.get("purchase_roas") else None,
                }
                for r in insights
            ],
            key=lambda x: x["spend"],
            reverse=True,
        )[:10],
    }
