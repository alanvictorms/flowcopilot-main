"""Creative Fatigue Predictor — monitors frequency, CTR/CPM decay per ad."""
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/fatigue", tags=["fatigue"])


def _f(x):
    try: return float(x or 0)
    except Exception: return 0.0


@router.get("/scan")
async def scan(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        ads = await client.list_ads()
        ins_recent = await client.insights(level="ad", date_preset="last_3d")
        ins_prior = await client.insights(level="ad", date_preset="last_14d")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    recent_by_id = {r.get("ad_id"): r for r in ins_recent}
    prior_by_id = {r.get("ad_id"): r for r in ins_prior}

    fatigue = []
    for ad in ads:
        aid = ad["id"]
        r = recent_by_id.get(aid, {})
        p = prior_by_id.get(aid, {})
        recent_ctr = _f(r.get("ctr"))
        prior_ctr = _f(p.get("ctr"))
        recent_cpm = _f(r.get("cpm"))
        prior_cpm = _f(p.get("cpm"))
        frequency = _f(r.get("frequency"))
        impressions_recent = _f(r.get("impressions"))
        if impressions_recent < 100:
            continue  # not enough data

        # CTR decay
        ctr_drop = ((prior_ctr - recent_ctr) / prior_ctr * 100.0) if prior_ctr > 0 else 0
        cpm_rise = ((recent_cpm - prior_cpm) / prior_cpm * 100.0) if prior_cpm > 0 else 0

        # Weighted fatigue score 0-100
        freq_score = min(frequency / 5.0, 1.0) * 40         # 0-40
        ctr_score = min(max(ctr_drop, 0) / 40.0, 1.0) * 35  # 0-35
        cpm_score = min(max(cpm_rise, 0) / 40.0, 1.0) * 25  # 0-25
        score = round(freq_score + ctr_score + cpm_score, 1)

        risk = "low" if score < 30 else ("medium" if score < 60 else "high")
        creative = ad.get("creative") or {}
        story = creative.get("object_story_spec", {}) or {}
        link = story.get("link_data", {}) or {}

        fatigue.append({
            "ad_id": aid,
            "ad_name": ad.get("name"),
            "status": ad.get("effective_status"),
            "image_url": creative.get("image_url") or creative.get("thumbnail_url"),
            "headline": creative.get("title") or link.get("name"),
            "frequency": round(frequency, 2),
            "recent_ctr": round(recent_ctr, 2),
            "prior_ctr": round(prior_ctr, 2),
            "ctr_drop_pct": round(ctr_drop, 1),
            "cpm_rise_pct": round(cpm_rise, 1),
            "impressions_3d": int(impressions_recent),
            "score": score,
            "risk": risk,
            "recommendation": (
                "Substituir imediatamente" if risk == "high" else
                "Preparar substituto e alternar em 3-5 dias" if risk == "medium" else
                "Manter, monitorar"
            ),
        })

    fatigue.sort(key=lambda x: -x["score"])
    return {
        "ads_analyzed": len(fatigue),
        "high_risk": sum(1 for f in fatigue if f["risk"] == "high"),
        "medium_risk": sum(1 for f in fatigue if f["risk"] == "medium"),
        "items": fatigue,
    }
