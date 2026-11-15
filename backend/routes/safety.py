"""Safety Guardian — health checks for tracking, spend anomalies, account issues."""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/safety", tags=["safety"])


def _f(x):
    try: return float(x or 0)
    except Exception: return 0.0


@router.get("/scan")
async def scan(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    incidents = []
    try:
        account = await client.get_ad_account()
        campaigns = await client.list_campaigns()
        adsets = await client.list_adsets()
        ads = await client.list_ads()
        ins_today = await client.insights(level="account", date_preset="today")
        ins_7d = await client.insights(level="account", date_preset="last_7d")
        ins_camp_7d = await client.insights(level="campaign", date_preset="last_7d")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    # 1) Account status
    if account.get("account_status") not in (1, "1"):
        incidents.append({
            "severity": "critical", "category": "policy",
            "title": "Conta com status irregular",
            "detail": f"Status={account.get('account_status')} · disable_reason={account.get('disable_reason')}",
            "action": "Contate o Suporte da Meta para regularizar.",
        })

    # 2) Zero purchases in 7 days but had spend
    total_spend_7d = sum(_f(r.get("spend")) for r in ins_7d)
    purchases_7d = 0.0
    for r in ins_7d:
        for a in r.get("actions") or []:
            if a.get("action_type") == "purchase":
                purchases_7d += _f(a.get("value"))
    if total_spend_7d > 50 and purchases_7d == 0:
        incidents.append({
            "severity": "critical", "category": "tracking",
            "title": "Nenhuma compra registrada em 7 dias",
            "detail": f"Investimento de {total_spend_7d:.2f} sem eventos de purchase. Provável falha no Pixel/CAPI.",
            "action": "Verifique Pixel + Conversions API + mapeamento do evento purchase.",
        })

    # 3) Spend spike today
    spend_today = sum(_f(r.get("spend")) for r in ins_today)
    avg_daily_7d = total_spend_7d / 7.0 if total_spend_7d else 0
    if avg_daily_7d > 0 and spend_today > avg_daily_7d * 2.5:
        incidents.append({
            "severity": "high", "category": "spend",
            "title": "Gasto anormal hoje",
            "detail": f"Hoje: {spend_today:.2f} · Média 7d: {avg_daily_7d:.2f} (>2.5x)",
            "action": "Investigue campanhas com pico e ajuste orçamento.",
        })

    # 4) Ads with DISAPPROVED status
    disapproved = [a for a in ads if str(a.get("effective_status", "")).startswith("DISAPPROVED")]
    if len(disapproved) >= 3:
        incidents.append({
            "severity": "high", "category": "policy",
            "title": f"{len(disapproved)} anúncios reprovados",
            "detail": f"IDs: {', '.join([a['id'] for a in disapproved[:5]])}",
            "action": "Revise as políticas de anúncios da Meta e recrie os criativos.",
        })

    # 5) Active adsets with zero delivery
    zero_impr_ids = set()
    for r in ins_camp_7d:
        if _f(r.get("impressions")) == 0 and _f(r.get("spend")) == 0:
            zero_impr_ids.add(r.get("campaign_id"))
    inactive_but_active = [c for c in campaigns if c.get("effective_status") == "ACTIVE" and c["id"] in zero_impr_ids]
    if len(inactive_but_active) >= 2:
        incidents.append({
            "severity": "medium", "category": "delivery",
            "title": f"{len(inactive_but_active)} campanhas ativas sem entrega",
            "detail": "Nenhuma impressão em 7 dias mesmo com status ACTIVE.",
            "action": "Verifique targeting, orçamento e criativo aprovado.",
        })

    # 6) Learning limited
    ll = [a for a in adsets if str(a.get("effective_status", "")).startswith("LEARNING_LIMITED")]
    if len(ll) >= 1:
        incidents.append({
            "severity": "medium", "category": "delivery",
            "title": f"{len(ll)} ad set(s) em LEARNING_LIMITED",
            "detail": "Aprendizado limitado — poucos eventos de otimização.",
            "action": "Aumente orçamento, amplie público ou consolide ad sets.",
        })

    # Guardian status
    critical = [i for i in incidents if i["severity"] == "critical"]
    should_freeze = len(critical) > 0

    doc = {
        "user_id": user["id"],
        "incidents": incidents,
        "should_freeze_automation": should_freeze,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.safety_scans.insert_one({**doc})

    return {
        "incidents": incidents,
        "critical_count": len(critical),
        "should_freeze_automation": should_freeze,
        "scanned_at": doc["scanned_at"],
    }


@router.get("/history")
async def history(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.safety_scans.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("scanned_at", -1).limit(30)
    return [d async for d in cur]
