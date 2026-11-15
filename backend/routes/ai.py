"""AI routes: streaming chat, creative scoring, optimization suggestions."""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services import ai_service
from services import llm
from services.llm_usage import record_usage
from services.credits import charge_resource
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str
    include_context: bool = True
    lang: str = "pt"


async def _user_knowledge(user, db) -> dict:
    """Memória estratégica + perfil de operação + contexto do negócio do workspace."""
    knowledge = {}
    # Perfil consolidado do agente — como ESTE usuário opera
    profile = await db.agent_profile.find_one({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
    if profile:
        knowledge["operating_profile"] = {
            "traits_pt": profile.get("operating_traits_pt", []),
            "approval_rate_pct": profile.get("approval_rate_pct"),
            "recent_rejection_reasons": profile.get("recent_rejection_reasons", [])[:5],
            "autonomy_mode": profile.get("autonomy_mode"),
        }
    # Memória estratégica (aprendizados)
    memories = []
    async for m in db.strategy_memory.find(
        {"user_id": user["id"]}, {"_id": 0, "kind": 1, "title": 1, "detail": 1}
    ).sort("created_at", -1).limit(30):
        memories.append(m)
    if memories:
        knowledge["strategy_memory"] = memories
    # Contexto do negócio (produtos/margens/metas)
    products = []
    async for p in db.business_products.find(
        {"user_id": user["id"]},
        {"_id": 0, "name": 1, "price": 1, "cost": 1, "max_cac": 1, "max_cpl": 1, "campaign_ids": 1},
    ).limit(20):
        products.append(p)
    if products:
        knowledge["business_products"] = products
    biz = await db.business_profile.find_one(
        {"user_id": user["id"]},
        {"_id": 0, "segment": 1, "revenue_goal_month": 1, "profit_goal_month": 1,
         "differentials": 1, "communication_restrictions": 1},
    )
    if biz:
        knowledge["business_profile"] = biz
    return knowledge


async def _context_summary(user, db) -> str:
    """Return a compact JSON string summarizing account for grounding the AI."""
    knowledge = await _user_knowledge(user, db)
    try:
        client = await get_meta_client(user, db)
        account = await client.get_ad_account()
        campaigns = await client.list_campaigns(limit=50)
        insights = await client.insights(level="campaign", date_preset="last_30d")
    except HTTPException:
        return json.dumps({"connected": False, "note": "Meta credentials not configured.",
                           **knowledge}, ensure_ascii=False)
    except MetaAPIError as e:
        return json.dumps({"connected": False, "error": str(e.detail)[:400],
                           **knowledge}, ensure_ascii=False)
    summary = {
        **knowledge,
        "account": {
            "name": account.get("name"),
            "currency": account.get("currency"),
            "status": account.get("account_status"),
        },
        "campaign_count": len(campaigns),
        "campaigns": [
            {"id": c["id"], "name": c.get("name"), "status": c.get("effective_status"),
             "objective": c.get("objective"), "daily_budget": c.get("daily_budget")}
            for c in campaigns[:25]
        ],
        "insights_last_30d": [
            {
                "campaign_id": r.get("campaign_id"),
                "campaign_name": r.get("campaign_name"),
                "impressions": r.get("impressions"),
                "clicks": r.get("clicks"),
                "spend": r.get("spend"),
                "ctr": r.get("ctr"),
                "cpc": r.get("cpc"),
                "roas": (r.get("purchase_roas") or [{}])[0].get("value") if r.get("purchase_roas") else None,
            }
            for r in insights[:25]
        ],
    }
    return json.dumps(summary, ensure_ascii=False)


@router.post("/chat/stream")
async def chat_stream(
    body: ChatIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    session_id = body.session_id or str(uuid.uuid4())
    await charge_resource(db, user["id"], "ai_chat", "Mensagem no chat com a IA")
    context = await _context_summary(user, db) if body.include_context else "{}"

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "user_id": user["id"],
        "role": "user",
        "content": body.message,
        "created_at": now,
    })

    async def event_gen():
        collected = ""
        yield f"event: session\ndata: {json.dumps({'session_id': session_id})}\n\n"
        try:
            async for chunk in ai_service.stream_chat(session_id, context, body.message, body.lang):
                collected += chunk
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        # Telemetria de tokens (média por recurso no painel admin)
        await record_usage(db, "ai_chat", user_id=user["id"],
                           input_text=context + body.message, output_text=collected,
                           model=ai_service.MODEL_NAME)
        # Persist assistant reply
        await db.chat_messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "user_id": user["id"],
            "role": "assistant",
            "content": collected,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/chat/history")
async def chat_history(
    session_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q = {"user_id": user["id"]}
    if session_id:
        q["session_id"] = session_id
    cursor = db.chat_messages.find(q, {"_id": 0}).sort("created_at", 1).limit(200)
    return [d async for d in cursor]


@router.get("/chat/sessions")
async def chat_sessions(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$session_id", "last": {"$first": "$content"}, "at": {"$first": "$created_at"}}},
        {"$sort": {"at": -1}},
        {"$limit": 30},
    ]
    out = []
    async for d in db.chat_messages.aggregate(pipeline):
        out.append({"session_id": d["_id"], "preview": (d.get("last") or "")[:80], "created_at": d["at"]})
    return out


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    r = await db.chat_messages.delete_many({"user_id": user["id"], "session_id": session_id})
    return {"deleted": r.deleted_count}


@router.post("/creatives/score/{ad_id}")
async def score_creative(
    ad_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    client = await get_meta_client(user, db)
    await charge_resource(db, user["id"], "creative_score", "Avaliação de criativo")
    try:
        ads = await client.list_ads()
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    ad = next((a for a in ads if a.get("id") == ad_id), None)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    creative = ad.get("creative") or {}
    story = creative.get("object_story_spec", {}) or {}
    link_data = story.get("link_data", {}) or {}
    payload = {
        "ad_name": ad.get("name"),
        "headline": creative.get("title") or link_data.get("name"),
        "body": creative.get("body") or link_data.get("message"),
        "cta": (link_data.get("call_to_action") or {}).get("type"),
        "image_url": creative.get("image_url") or creative.get("thumbnail_url"),
    }
    try:
        insights = await client.insights(level="ad", date_preset="last_30d", ids=[ad_id])
        if insights:
            r = insights[0]
            payload["insights"] = {
                "ctr": r.get("ctr"), "cpc": r.get("cpc"), "spend": r.get("spend"),
                "impressions": r.get("impressions"),
            }
    except Exception:
        payload["insights"] = {}

    result = await ai_service.score_creative(payload)
    await record_usage(db, "creative_score", user_id=user["id"],
                       input_text=json.dumps(payload, ensure_ascii=False),
                       output_text=json.dumps(result, ensure_ascii=False),
                       model=ai_service.MODEL_NAME)
    result["ad_id"] = ad_id
    result["ad_name"] = ad.get("name")
    result["payload"] = payload
    return result


@router.post("/optimizations/suggest")
async def suggest_optimizations(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Gate on Meta credentials — spec requires 428 when not connected.
    await get_meta_client(user, db)
    await charge_resource(db, user["id"], "optimization_suggest", "Sugestões de otimização")
    context_json = await _context_summary(user, db)
    try:
        context = json.loads(context_json)
    except Exception:
        context = {}
    suggestions = await ai_service.suggest_optimizations(context)
    await record_usage(db, "optimization_suggest", user_id=user["id"],
                       input_text=context_json,
                       output_text=json.dumps(suggestions, ensure_ascii=False),
                       model=ai_service.MODEL_NAME)
    # Persist
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "suggestions": suggestions,
    }
    await db.optimization_events.insert_one({**doc, "kind": "ai_suggest"})
    return {"suggestions": suggestions, "generated_at": doc["created_at"]}
