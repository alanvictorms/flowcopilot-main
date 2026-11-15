"""Meta Ads integration routes: settings, connection test, campaign management."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user, encrypt_str, decrypt_str
from services.meta_client import MetaClient, MetaAPIError

router = APIRouter(prefix="/api/meta", tags=["meta"])


class MetaSettingsIn(BaseModel):
    app_id: str = Field(min_length=1)
    app_secret: str = Field(min_length=1)
    access_token: str = Field(min_length=10)
    ad_account_id: str = Field(min_length=1)


class MetaSettingsOut(BaseModel):
    connected: bool
    app_id: Optional[str] = None
    ad_account_id: Optional[str] = None
    ad_account_name: Optional[str] = None
    currency: Optional[str] = None
    account_status: Optional[int | str] = None
    updated_at: Optional[str] = None


async def _load_credentials(db, user_id: str) -> Optional[dict]:
    doc = await db.meta_settings.find_one({"user_id": user_id})
    if not doc or not doc.get("access_token_enc"):
        return None
    return {
        "app_id": doc.get("app_id"),
        "app_secret": decrypt_str(doc.get("app_secret_enc", "")),
        "access_token": decrypt_str(doc.get("access_token_enc", "")),
        "ad_account_id": doc.get("ad_account_id"),
    }


async def get_meta_client(user: dict, db: AsyncIOMotorDatabase) -> MetaClient:
    creds = await _load_credentials(db, user["id"])
    if not creds:
        raise HTTPException(status_code=428, detail="Meta credentials not configured. Add them in Settings.")
    return MetaClient(access_token=creds["access_token"], ad_account_id=creds["ad_account_id"])


@router.get("/settings", response_model=MetaSettingsOut)
async def get_settings(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.meta_settings.find_one({"user_id": user["id"]})
    if not doc:
        return MetaSettingsOut(connected=False)
    return MetaSettingsOut(
        connected=bool(doc.get("access_token_enc")),
        app_id=doc.get("app_id"),
        ad_account_id=doc.get("ad_account_id"),
        ad_account_name=doc.get("ad_account_name"),
        currency=doc.get("currency"),
        account_status=doc.get("account_status"),
        updated_at=doc.get("updated_at"),
    )


@router.post("/settings", response_model=MetaSettingsOut)
async def save_settings(
    body: MetaSettingsIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Validate against Meta first
    client = MetaClient(access_token=body.access_token, ad_account_id=body.ad_account_id)
    try:
        info = await client.get_ad_account()
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail={"message": "Meta rejected credentials", "meta_error": e.detail})

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user["id"],
        "app_id": body.app_id,
        "app_secret_enc": encrypt_str(body.app_secret),
        "access_token_enc": encrypt_str(body.access_token),
        "ad_account_id": body.ad_account_id,
        "ad_account_name": info.get("name"),
        "currency": info.get("currency"),
        "account_status": info.get("account_status"),
        "timezone_name": info.get("timezone_name"),
        "updated_at": now,
    }
    await db.meta_settings.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return MetaSettingsOut(
        connected=True,
        app_id=body.app_id,
        ad_account_id=body.ad_account_id,
        ad_account_name=info.get("name"),
        currency=info.get("currency"),
        account_status=info.get("account_status"),
        updated_at=now,
    )


@router.delete("/settings")
async def disconnect(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.meta_settings.delete_one({"user_id": user["id"]})
    return {"ok": True}


@router.get("/account")
async def account(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        return await client.get_ad_account()
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)


@router.get("/campaigns")
async def campaigns(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        return await client.list_campaigns()
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)


@router.get("/adsets")
async def adsets(
    campaign_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        return await client.list_adsets(campaign_id=campaign_id)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)


@router.get("/ads")
async def ads(
    campaign_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        return await client.list_ads(campaign_id=campaign_id)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)


@router.get("/insights")
async def insights(
    level: str = "campaign",
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        return await client.insights(level=level, date_preset=date_preset, since=since, until=until)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)


class StatusPatch(BaseModel):
    status: str  # ACTIVE | PAUSED | ARCHIVED


@router.get("/campaigns/{campaign_id}/detail")
async def campaign_detail(
    campaign_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    try:
        campaign = await client._request(
            "GET", f"/{campaign_id}",
            params={"fields": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,buying_type,special_ad_categories,created_time,updated_time,start_time,stop_time,budget_remaining"},
        )
        adsets = await client.list_adsets(campaign_id=campaign_id)
        ads = await client.list_ads(campaign_id=campaign_id)
        ins_30d = await client.insights(level="campaign", date_preset="last_30d", ids=[campaign_id])
        ins_7d = await client.insights(level="campaign", date_preset="last_7d", ids=[campaign_id])
        ins_ads = await client.insights(level="ad", date_preset="last_30d")
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    ad_insights_by_id = {r.get("ad_id"): r for r in ins_ads}
    return {
        "campaign": campaign,
        "adsets": adsets,
        "ads": ads,
        "insights_30d": ins_30d,
        "insights_7d": ins_7d,
        "ad_insights_by_id": ad_insights_by_id,
    }


@router.get("/campaigns/{campaign_id}/timeseries")
async def campaign_timeseries(
    campaign_id: str,
    date_preset: str = "last_30d",
    since: Optional[str] = None,
    until: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    params = {
        "time_increment": 1,
        "fields": "spend,impressions,clicks,ctr,cpc,actions",
        "limit": 500,
    }
    # Range personalizado tem prioridade sobre o preset.
    if since and until:
        import json as _json
        params["time_range"] = _json.dumps({"since": since, "until": until})
    else:
        params["date_preset"] = date_preset
    try:
        data = await client._request("GET", f"/{campaign_id}/insights", params=params)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    return data.get("data", [])


@router.post("/campaigns/{campaign_id}/status")
async def update_campaign_status(
    campaign_id: str,
    body: StatusPatch,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    try:
        before = await client._request("GET", f"/{campaign_id}", params={"fields": "status"})
        res = await client.update_campaign(campaign_id, {"status": body.status})
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    await db.optimization_events.insert_one({
        "id": str(_uuid.uuid4()),
        "user_id": user["id"], "kind": "manual",
        "target_type": "campaign", "target_id": campaign_id,
        "before_state": {"status": before.get("status")},
        "change": {"status": body.status},
        "created_at": _dt.now(_tz.utc).isoformat(),
    })
    return {"ok": True, "meta_response": res}


@router.post("/adsets/{adset_id}/status")
async def update_adset_status(
    adset_id: str,
    body: StatusPatch,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    try:
        before = await client._request("GET", f"/{adset_id}", params={"fields": "status"})
        res = await client.update_adset(adset_id, {"status": body.status})
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    await db.optimization_events.insert_one({
        "id": str(_uuid.uuid4()),
        "user_id": user["id"], "kind": "manual",
        "target_type": "adset", "target_id": adset_id,
        "before_state": {"status": before.get("status")},
        "change": {"status": body.status},
        "created_at": _dt.now(_tz.utc).isoformat(),
    })
    return {"ok": True, "meta_response": res}


@router.post("/ads/{ad_id}/status")
async def update_ad_status(
    ad_id: str,
    body: StatusPatch,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    try:
        before = await client._request("GET", f"/{ad_id}", params={"fields": "status"})
        res = await client.update_ad(ad_id, {"status": body.status})
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    await db.optimization_events.insert_one({
        "id": str(_uuid.uuid4()),
        "user_id": user["id"], "kind": "manual",
        "target_type": "ad", "target_id": ad_id,
        "before_state": {"status": before.get("status")},
        "change": {"status": body.status},
        "created_at": _dt.now(_tz.utc).isoformat(),
    })
    return {"ok": True, "meta_response": res}


class BudgetPatch(BaseModel):
    daily_budget: Optional[int] = None
    lifetime_budget: Optional[int] = None


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        res = await client._request("DELETE", f"/{campaign_id}")
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_response": res}


@router.delete("/adsets/{adset_id}")
async def delete_adset(adset_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        res = await client._request("DELETE", f"/{adset_id}")
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_response": res}


@router.delete("/ads/{ad_id}")
async def delete_ad(ad_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    try:
        res = await client._request("DELETE", f"/{ad_id}")
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_response": res}


@router.patch("/adsets/{adset_id}")
async def patch_adset(adset_id: str, patch: dict, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Atualiza campos genéricos do adset (name, daily_budget, targeting, etc.)."""
    client = await get_meta_client(user, db)
    payload = {}
    for k, v in (patch or {}).items():
        if k in ("targeting", "promoted_object") and isinstance(v, (dict, list)):
            payload[k] = __import__("json").dumps(v)
        else:
            payload[k] = v
    try:
        res = await client.update_adset(adset_id, payload)
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_response": res}


@router.patch("/campaigns/{campaign_id}")
async def patch_campaign(campaign_id: str, patch: dict, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Atualiza campos genéricos da campanha (name, daily_budget, objective, etc.)."""
    client = await get_meta_client(user, db)
    try:
        res = await client.update_campaign(campaign_id, patch or {})
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_response": res}


@router.post("/adsets/{adset_id}/budget")
async def update_adset_budget(
    adset_id: str,
    body: BudgetPatch,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No budget field provided")
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    try:
        before = await client._request("GET", f"/{adset_id}", params={"fields": "daily_budget,lifetime_budget"})
        res = await client.update_adset(adset_id, patch)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    await db.optimization_events.insert_one({
        "id": str(_uuid.uuid4()),
        "user_id": user["id"], "kind": "manual",
        "target_type": "adset", "target_id": adset_id,
        "before_state": {k: before.get(k) for k in ("daily_budget", "lifetime_budget") if before.get(k) is not None},
        "change": patch,
        "created_at": _dt.now(_tz.utc).isoformat(),
    })
    return {"ok": True, "meta_response": res}


@router.post("/campaigns/{campaign_id}/optimize")
async def optimize_campaign_with_ai(
    campaign_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Roda a IA (Claude) sobre a campanha específica e retorna sugestões priorizadas em PT-BR."""
    from services import ai_service
    import json as _json
    client = await get_meta_client(user, db)
    try:
        campaign = await client._request(
            "GET", f"/{campaign_id}",
            params={"fields": "id,name,status,effective_status,objective,daily_budget,buying_type"},
        )
        adsets = await client.list_adsets(campaign_id=campaign_id)
        ads = await client.list_ads(campaign_id=campaign_id)
        ins_30d = await client.insights(level="campaign", date_preset="last_30d", ids=[campaign_id])
        ad_ins = await client.insights(level="ad", date_preset="last_30d")
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    context = {
        "campaign": campaign,
        "adsets_count": len(adsets),
        "ads_count": len(ads),
        "insights_30d": ins_30d,
        "ad_insights_sample": ad_ins[:30],
        "adsets": [{"id": a.get("id"), "name": a.get("name"), "status": a.get("effective_status"),
                    "daily_budget": a.get("daily_budget"), "optimization_goal": a.get("optimization_goal")}
                   for a in adsets],
    }
    suggestions = await ai_service.suggest_optimizations(context)
    return {"suggestions": suggestions, "campaign_id": campaign_id}
