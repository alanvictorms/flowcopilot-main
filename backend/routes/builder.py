"""Campaign Builder por Chat — AI-guided draft + publish as PAUSED."""
import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user
from services.meta_client import MetaAPIError
from services import ai_service
from services import llm
from routes.meta import get_meta_client

router = APIRouter(prefix="/api/builder", tags=["builder"])

BUILDER_SYS = (
    "Você é um construtor de campanhas Meta Ads. Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Dado produto/oferta/público/orçamento/objetivo e opcionalmente o texto da landing page do usuário, "
    "retorne JSON ESTRITO com as chaves em inglês (para compatibilidade com a API do Meta) mas "
    "com todo o CONTEÚDO em português do Brasil: "
    "name (nome da campanha em pt-BR), objective (objetivo Meta), buying_type (AUCTION), "
    "daily_budget_cents (int), adset (nome em pt-BR, targeting {age_min, age_max, geo_locations {countries: [\"BR\"]}, interests em pt-BR}, "
    "optimization_goal, billing_event), "
    "ads [{ name em pt-BR, headline em pt-BR (máx 40 chars), primary_text em pt-BR (100-125 chars), "
    "description em pt-BR (30 chars), cta_type, image_prompt (descrição rica em inglês para gerador de imagem) }] (gere 3 ads), "
    "notes (lista em pt-BR). Retorne APENAS o JSON."
)


class DraftIn(BaseModel):
    product: str = Field(min_length=3)
    offer: str = ""
    audience: str = ""
    objective: str = "OUTCOME_SALES"
    budget_daily: float = 20.0
    country: str = "BR"
    landing_page_url: str = ""
    extra: str = ""


async def _fetch_landing_page(url: str) -> str:
    if not url or not url.startswith(("http://", "https://")):
        return ""
    try:
        import httpx, re
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 MetaAdsAutonomy/1.0"})
        html = r.text
        html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
        title = title_match.group(1).strip() if title_match else ""
        desc_match = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', html, flags=re.I)
        desc = desc_match.group(1) if desc_match else ""
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()
        parts = [p for p in [f"TITLE: {title}", f"DESCRIPTION: {desc}", f"BODY: {text[:3500]}"] if p.split(": ", 1)[1].strip()]
        return " | ".join(parts)
    except Exception:
        return ""


@router.post("/draft")
async def create_draft(body: DraftIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    lp_text = await _fetch_landing_page(body.landing_page_url) if body.landing_page_url else ""
    prompt_data = {**body.model_dump(), "landing_page_content": lp_text[:5000]}
    prompt = ("Gere um draft de campanha. Se landing_page_content estiver preenchido, "
              "extraia dele os benefícios reais e prova social. Dados:\n" + json.dumps(prompt_data, ensure_ascii=False))
    text = await llm.complete_text(f"builder-{user['id']}-{uuid.uuid4()}", BUILDER_SYS, prompt)
    start, end = text.find("{"), text.rfind("}")
    draft = {}
    if start != -1 and end != -1:
        try: draft = json.loads(text[start:end + 1])
        except Exception: pass
    draft_id = str(uuid.uuid4())
    await db.campaign_drafts.insert_one({
        "id": draft_id, "user_id": user["id"], "input": body.model_dump(),
        "landing_page_snippet": lp_text[:800], "draft": draft, "raw": text[:5000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": draft_id, "draft": draft, "landing_page_used": bool(lp_text)}


@router.get("/drafts")
async def list_drafts(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.campaign_drafts.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0, "raw": 0}).sort("created_at", -1).limit(30)
    out = []
    async for d in cur:
        imgs = d.get("images") or []
        d["images_count"] = sum(1 for i in imgs if i.get("data"))
        d.pop("images", None)
        out.append(d)
    return out


@router.get("/drafts/{draft_id}")
async def get_draft(draft_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    d = await db.campaign_drafts.find_one({"id": draft_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0, "images.data": 0})
    if not d: raise HTTPException(status_code=404, detail="Draft não encontrado")
    return d


@router.post("/drafts/{draft_id}/generate-images")
async def generate_images(draft_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    d = await db.campaign_drafts.find_one({"id": draft_id, "user_id": user["id"]})
    if not d: raise HTTPException(status_code=404, detail="Draft não encontrado")
    prompts = []
    for i, ad in enumerate((d.get("draft", {}) or {}).get("ads", []) or []):
        p = ad.get("image_prompt") or f"Meta ad creative for: {d.get('input', {}).get('product', '')}, photo-real, high contrast, marketing style"
        prompts.append(p)
    if not prompts:
        raise HTTPException(status_code=400, detail="Draft sem anúncios / image_prompts.")
    images = []
    for i, p in enumerate(prompts[:4]):
        try:
            img = await llm.generate_image(p)
            if img:
                images.append({"idx": i, "prompt": p, "mime": img.get("mime", "image/png"), "data": img["data"]})
            else:
                images.append({"idx": i, "prompt": p, "error": "modelo não retornou imagem"})
        except Exception as e:
            images.append({"idx": i, "prompt": p, "error": str(e)[:200]})
    await db.campaign_drafts.update_one({"id": draft_id, "user_id": user["id"]}, {"$set": {"images": images}})
    error_sample = next((i.get("error") for i in images if i.get("error")), None)
    return {
        "count": sum(1 for i in images if i.get("data")),
        "errors": sum(1 for i in images if i.get("error")),
        "error_sample": error_sample,
        "prompts": [i["prompt"] for i in images],
    }


@router.get("/drafts/{draft_id}/image/{idx}")
async def get_image(
    draft_id: str,
    idx: int,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    import base64
    from services.security import decode_token
    # Aceita token via Authorization: Bearer OU via query param `t` (para uso em <img src>)
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.query_params.get("t") or request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    user_id = payload.get("sub")
    d = await db.campaign_drafts.find_one({"id": draft_id, "user_id": user_id})
    if not d: raise HTTPException(status_code=404, detail="Draft não encontrado")
    for img in d.get("images", []) or []:
        if img.get("idx") == idx and img.get("data"):
            return Response(content=base64.b64decode(img["data"]), media_type=img.get("mime", "image/png"))
    raise HTTPException(status_code=404, detail="Imagem não encontrada")


@router.post("/drafts/{draft_id}/publish")
async def publish_draft(draft_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    d = await db.campaign_drafts.find_one({"id": draft_id, "user_id": user["id"]})
    if not d: raise HTTPException(status_code=404, detail="Draft não encontrado")
    draft = d.get("draft") or {}
    if not draft.get("name") or not draft.get("objective"):
        raise HTTPException(status_code=400, detail="Draft incompleto (name/objective ausentes)")
    client = await get_meta_client(user, db)
    payload = {
        "name": draft.get("name"),
        "objective": draft.get("objective"),
        "buying_type": draft.get("buying_type", "AUCTION"),
        "status": "PAUSED",
        "special_ad_categories": "[]",
        "is_adset_budget_sharing_enabled": "false",
    }
    try:
        result = await client.create_campaign(payload)
    except MetaAPIError as e:
        raise HTTPException(status_code=400, detail=e.detail)
    await db.campaign_drafts.update_one({"id": draft_id},
        {"$set": {"published": True, "published_at": datetime.now(timezone.utc).isoformat(), "meta_campaign_id": result.get("id")}})
    return {"ok": True, "meta_campaign_id": result.get("id"), "status": "PAUSED"}


@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.campaign_drafts.delete_one({"id": draft_id, "user_id": user["id"]})
    return {"ok": True}


class DraftPatch(BaseModel):
    name: str | None = None
    daily_budget_cents: int | None = None
    ads: list[dict] | None = None  # [{name, headline, primary_text, description, cta_type, image_prompt}]


@router.patch("/drafts/{draft_id}")
async def patch_draft(
    draft_id: str,
    body: DraftPatch,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    d = await db.campaign_drafts.find_one({"id": draft_id, "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Draft não encontrado")
    draft = d.get("draft") or {}
    updates = body.model_dump(exclude_none=True)
    if "name" in updates:
        draft["name"] = updates["name"]
    if "daily_budget_cents" in updates:
        draft["daily_budget_cents"] = int(updates["daily_budget_cents"])
    if "ads" in updates:
        draft["ads"] = updates["ads"]
    await db.campaign_drafts.update_one({"id": draft_id}, {"$set": {"draft": draft, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "draft": draft}


class ManualCampaignIn(BaseModel):
    name: str = Field(min_length=2)
    objective: str = "OUTCOME_SALES"
    buying_type: str = "AUCTION"
    daily_budget: float = 20.0
    special_ad_categories: list[str] = []


@router.post("/manual/campaign")
async def create_manual_campaign(body: ManualCampaignIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Cria uma campanha PAUSADA diretamente no Meta (sem IA). Usuário completa AdSets/Ads em seguida ou no Gerenciador."""
    client = await get_meta_client(user, db)
    payload = {
        "name": body.name,
        "objective": body.objective,
        "buying_type": body.buying_type,
        "status": "PAUSED",
        "daily_budget": str(int(body.daily_budget * 100)),
        "special_ad_categories": json.dumps(body.special_ad_categories or []),
        "is_adset_budget_sharing_enabled": "false",
    }
    try:
        result = await client.create_campaign(payload)
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_campaign_id": result.get("id"), "status": "PAUSED"}


class ManualAdSetIn(BaseModel):
    campaign_id: str
    name: str = Field(min_length=2)
    daily_budget: float = 20.0
    billing_event: str = "IMPRESSIONS"
    optimization_goal: str = "OFFSITE_CONVERSIONS"
    bid_strategy: str = "LOWEST_COST_WITHOUT_CAP"
    bid_amount: str | None = None  # required for BID_CAP / COST_CAP strategies
    countries: list[str] = ["BR"]
    age_min: int = 18
    age_max: int = 65
    genders: list[int] = []
    interests: list[dict] = []
    behaviors: list[dict] = []
    positions_facebook: list[str] = []
    positions_instagram: list[str] = []
    positions_audience_network: list[str] = []
    positions_messenger: list[str] = []
    publisher_platforms: list[str] = ["facebook", "instagram"]
    start_time: str | None = None
    end_time: str | None = None
    promoted_object: dict | None = None


@router.post("/manual/adset")
async def create_manual_adset(body: ManualAdSetIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    targeting = {
        "geo_locations": {"countries": body.countries or ["BR"]},
        "age_min": body.age_min,
        "age_max": body.age_max,
        "publisher_platforms": body.publisher_platforms,
    }
    if body.genders:
        targeting["genders"] = body.genders
    if body.interests:
        targeting["flexible_spec"] = [{"interests": body.interests}]
    if body.behaviors:
        fs = targeting.get("flexible_spec") or []
        fs.append({"behaviors": body.behaviors})
        targeting["flexible_spec"] = fs
    if body.positions_facebook:
        targeting["facebook_positions"] = body.positions_facebook
    if body.positions_instagram:
        targeting["instagram_positions"] = body.positions_instagram
    if body.positions_audience_network:
        targeting["audience_network_positions"] = body.positions_audience_network
    if body.positions_messenger:
        targeting["messenger_positions"] = body.positions_messenger

    payload = {
        "name": body.name,
        "campaign_id": body.campaign_id,
        "daily_budget": str(int(body.daily_budget * 100)),
        "billing_event": body.billing_event,
        "optimization_goal": body.optimization_goal,
        "bid_strategy": body.bid_strategy,
        "targeting": json.dumps(targeting),
        "status": "PAUSED",
    }
    if body.bid_amount:
        payload["bid_amount"] = body.bid_amount
    if body.start_time:
        payload["start_time"] = body.start_time
    if body.end_time:
        payload["end_time"] = body.end_time
    if body.promoted_object:
        payload["promoted_object"] = json.dumps(body.promoted_object)
    try:
        result = await client._request("POST", f"/{client.ad_account_id}/adsets", data=payload)
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_adset_id": result.get("id"), "status": "PAUSED"}


class ManualAdIn(BaseModel):
    adset_id: str
    name: str = Field(min_length=2)
    page_id: str  # required for link_data
    instagram_actor_id: str | None = None
    message: str  # primary text
    headline: str  # link name/title
    description: str | None = None
    link: str  # destination URL
    cta_type: str = "LEARN_MORE"  # SHOP_NOW | LEARN_MORE | SIGN_UP | DOWNLOAD | GET_OFFER ...
    image_hash: str | None = None  # upload endpoint returns this
    video_id: str | None = None


@router.post("/manual/ad")
async def create_manual_ad(body: ManualAdIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    client = await get_meta_client(user, db)
    link_data = {
        "link": body.link,
        "message": body.message,
        "name": body.headline,
        "call_to_action": {"type": body.cta_type, "value": {"link": body.link}},
    }
    if body.description:
        link_data["description"] = body.description
    if body.image_hash:
        link_data["image_hash"] = body.image_hash

    object_story_spec = {
        "page_id": body.page_id,
        "link_data": link_data,
    }
    if body.instagram_actor_id:
        object_story_spec["instagram_actor_id"] = body.instagram_actor_id
    if body.video_id:
        object_story_spec.pop("link_data", None)
        object_story_spec["video_data"] = {
            "video_id": body.video_id,
            "message": body.message,
            "title": body.headline,
            "call_to_action": {"type": body.cta_type, "value": {"link": body.link}},
        }

    # 1) Create ad creative
    try:
        creative = await client._request("POST", f"/{client.ad_account_id}/adcreatives", data={
            "name": body.name + " – Criativo",
            "object_story_spec": json.dumps(object_story_spec),
        })
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    creative_id = creative.get("id")

    # 2) Create ad
    try:
        ad = await client._request("POST", f"/{client.ad_account_id}/ads", data={
            "name": body.name,
            "adset_id": body.adset_id,
            "creative": json.dumps({"creative_id": creative_id}),
            "status": "PAUSED",
        })
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return {"ok": True, "meta_ad_id": ad.get("id"), "creative_id": creative_id, "status": "PAUSED"}


class ImageUploadIn(BaseModel):
    filename: str = "upload.jpg"
    data_base64: str  # data URL or raw base64


@router.post("/manual/upload-image")
async def upload_image(body: ImageUploadIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Upload de imagem para a biblioteca de mídia da conta. Retorna image_hash."""
    import base64
    client = await get_meta_client(user, db)
    raw = body.data_base64
    if "," in raw and raw.strip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        raw_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Base64 inválido")
    # Meta espera bytes em field 'bytes' + 'filename'
    import httpx
    url = f"https://graph.facebook.com/{os.environ.get('META_GRAPH_VERSION','v25.0')}/{client.ad_account_id}/adimages"
    files = {"filename": (body.filename, raw_bytes, "image/jpeg")}
    params = {"access_token": client.access_token}
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(url, params=params, files=files)
    if r.status_code >= 400:
        try:
            raise HTTPException(status_code=400, detail=r.json())
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail=r.text)
    data = r.json()
    imgs = data.get("images") or {}
    if imgs:
        first = next(iter(imgs.values()))
        return {"ok": True, "image_hash": first.get("hash"), "url": first.get("url")}
    return {"ok": True, "raw": data}


@router.get("/pages")
async def list_pages(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Lista Pages do FB autorizadas pelo access_token do usuário."""
    client = await get_meta_client(user, db)
    try:
        data = await client._request("GET", "/me/accounts", params={"fields": "id,name,category,tasks,instagram_business_account{id,username}", "limit": 100})
    except MetaAPIError as e:
        raise HTTPException(status_code=e.status if e.status else 400, detail=e.detail)
    return data.get("data", [])
