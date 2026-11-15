"""
Creative Factory e Creative Autopilot (Camada 4 · item 33 do roadmap).

Fábrica autônoma de criação: gera conceitos, briefings, hooks, copies,
CTAs via LLM. Gerencia ciclo de vida criativo: scoring, publicação
como teste, eliminação de perdedores, promoção de vencedores, e geração
de novas variações baseadas nos resultados.
"""
import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user, decode_token
from services.activity import log_activity
from services.credits import charge_resource
from services import ai_service, llm

router = APIRouter(prefix="/api/creative-factory", tags=["creative-factory"])


CREATIVE_TYPES = [
    "video_hook", "carousel", "image_static", "ugc", "reels",
    "testimonial", "before_after", "demo", "motion_graphics",
    "offer", "urgency", "social_proof", "educational",
]

FORMATS = [
    {"key": "9:16", "label": "Stories/Reels (9:16)", "width": 1080, "height": 1920},
    {"key": "4:5", "label": "Feed vertical (4:5)", "width": 1080, "height": 1350},
    {"key": "1:1", "label": "Feed quadrado (1:1)", "width": 1080, "height": 1080},
    {"key": "16:9", "label": "Landscape (16:9)", "width": 1920, "height": 1080},
]


class BriefingRequestIn(BaseModel):
    product_name: str = ""
    target_audience: str = ""
    objective: str = "conversions"
    angle: str = ""
    tone: str = "persuasivo"
    creative_type: str = "image_static"
    funnel_stage: str = "topo"
    language: str = "pt-BR"


class CreativeIn(BaseModel):
    briefing_id: str = ""
    headline: str
    primary_text: str
    description: str = ""
    cta: str = "LEARN_MORE"
    format: str = "1:1"
    creative_type: str = "image_static"
    image_prompt: str = ""
    campaign_id: str = ""
    status: str = "draft"  # draft | testing | winner | paused | archived


class CreativeScoreIn(BaseModel):
    creative_id: str
    ai_score: float = 0
    predicted_ctr_range: list[float] = []
    brand_compliant: bool = True
    policy_compliant: bool = True
    notes: str = ""


@router.post("/briefing")
async def generate_briefing(
    body: BriefingRequestIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    uid = user["id"]
    await charge_resource(db, uid, "creative_generation", "Geração de briefing criativo")
    profile = await db.business_profile.find_one({"user_id": uid}) or {}
    products = await db.business_products.find({"user_id": uid}).to_list(10)

    product = next((p for p in products if p.get("name") == body.product_name), None)

    hooks = _generate_hooks(body, profile, product)
    angles = _generate_angles(body, profile)
    ctas = _generate_ctas(body.objective)

    briefing = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "product_name": body.product_name,
        "target_audience": body.target_audience or profile.get("personas") or "",
        "objective": body.objective,
        "creative_type": body.creative_type,
        "funnel_stage": body.funnel_stage,
        "tone": body.tone,
        "hooks": hooks,
        "angles": angles,
        "suggested_ctas": ctas,
        "copy_guidelines_pt": _copy_guidelines(body.funnel_stage),
        "format_recommendations": _format_for_type(body.creative_type),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.creative_briefings.insert_one({**briefing})
    await log_activity(db, uid, "briefing_generated",
                       f"Briefing criativo gerado para '{body.product_name}'",
                       {"briefing_id": briefing["id"]})
    briefing.pop("user_id", None)
    return briefing


def _generate_hooks(body, profile, product) -> list[dict]:
    hooks = [
        {"type": "problem", "text_pt": f"Cansado de [problema]? Descubra como [solução].",
         "angle": "dor"},
        {"type": "curiosity", "text_pt": f"O segredo que [audiência] usa para [resultado].",
         "angle": "curiosidade"},
        {"type": "social_proof", "text_pt": f"Mais de [número] pessoas já [resultado] com [produto].",
         "angle": "prova social"},
        {"type": "urgency", "text_pt": f"Últimas vagas/unidades — [oferta] acaba em [prazo].",
         "angle": "urgência"},
        {"type": "contrarian", "text_pt": f"Por que [crença comum] está errado — e o que fazer.",
         "angle": "contrário"},
    ]
    return hooks


def _generate_angles(body, profile) -> list[str]:
    return [
        "Transformação / antes e depois",
        "Depoimento / prova social",
        "Educativo / como funciona",
        "Oferta direta / promoção",
        "Bastidores / autoridade",
        "Comparação / diferencial",
    ]


def _generate_ctas(objective: str) -> list[str]:
    if objective == "leads":
        return ["SIGN_UP", "LEARN_MORE", "GET_QUOTE", "SUBSCRIBE"]
    if objective == "sales":
        return ["SHOP_NOW", "BUY_NOW", "GET_OFFER", "ORDER_NOW"]
    return ["LEARN_MORE", "WATCH_MORE", "SEE_MORE"]


def _copy_guidelines(stage: str) -> dict:
    guidelines = {
        "topo": {
            "headline": "Curto, impactante, foco na dor ou desejo (máx 40 chars)",
            "primary_text": "Abrir com hook forte, problema → agitação → solução (máx 125 chars visíveis)",
            "tone": "Emocional, empático, provocativo",
        },
        "meio": {
            "headline": "Benefício específico + diferencial (máx 40 chars)",
            "primary_text": "Prova social, depoimento, dados concretos (máx 200 chars)",
            "tone": "Confiante, específico, orientado a resultado",
        },
        "fundo": {
            "headline": "Oferta clara + urgência (máx 40 chars)",
            "primary_text": "CTA direto, garantia, condições especiais (máx 150 chars)",
            "tone": "Direto, urgente, oferecendo segurança",
        },
    }
    return guidelines.get(stage, guidelines["topo"])


def _format_for_type(creative_type: str) -> list[dict]:
    if creative_type in ("reels", "ugc", "video_hook"):
        return [f for f in FORMATS if f["key"] == "9:16"]
    if creative_type == "carousel":
        return [f for f in FORMATS if f["key"] in ("1:1", "4:5")]
    return FORMATS[:3]


@router.post("/creatives")
async def save_creative(
    body: CreativeIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["metrics"] = {}
    doc["generation"] = 1
    await db.creative_assets.insert_one({**doc})
    doc.pop("user_id", None)
    return doc


@router.get("/creatives")
async def list_creatives(
    status: str = "",
    campaign_id: str = "",
    limit: int = 50,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {"user_id": user["id"]}
    if status:
        query["status"] = status
    if campaign_id:
        query["campaign_id"] = campaign_id
    # Não devolve o binário da imagem na listagem (pesado). has_image indica se existe.
    cur = db.creative_assets.find(query, {"_id": 0, "user_id": 0, "image_data": 0}).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


@router.post("/creatives/{creative_id}/image")
async def generate_creative_image(
    creative_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Gera a imagem do criativo a partir do image_prompt (usa o modelo de imagem da config)."""
    cr = await db.creative_assets.find_one({"id": creative_id, "user_id": user["id"]})
    if not cr:
        raise HTTPException(status_code=404, detail="Criativo não encontrado")
    prompt = cr.get("image_prompt") or (
        f"Meta ad creative for: {cr.get('headline', '')}. Photo-real, high contrast, professional marketing style, no text overlay."
    )
    try:
        img = await llm.generate_image(prompt)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Falha ao gerar imagem: {str(e)[:200]}")
    if not img:
        raise HTTPException(status_code=400, detail="O modelo não retornou imagem. Ajuste o modelo de imagem em Admin > Modelos IA.")
    # Cobra só após sucesso (geração de imagem pode ser instável).
    await charge_resource(db, user["id"], "creative_generation", "Geração de imagem do criativo")
    await db.creative_assets.update_one(
        {"id": creative_id, "user_id": user["id"]},
        {"$set": {
            "image_data": img["data"],
            "image_mime": img.get("mime", "image/png"),
            "has_image": True,
            "image_generated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}


@router.get("/creatives/{creative_id}/image")
async def get_creative_image(
    creative_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Serve a imagem (aceita token via Bearer ou ?t= para uso em <img src>)."""
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
    cr = await db.creative_assets.find_one({"id": creative_id, "user_id": payload.get("sub")})
    if not cr or not cr.get("image_data"):
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    return Response(content=base64.b64decode(cr["image_data"]), media_type=cr.get("image_mime", "image/png"))


class GenerateForCampaignIn(BaseModel):
    campaign_id: str = ""
    product_name: str = ""
    instruction: str = ""
    count: int = 3


@router.post("/generate")
async def generate_for_campaign(
    body: GenerateForCampaignIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Copiloto de criativo: gera variações usando negócio + público + base de conhecimento da campanha."""
    uid = user["id"]
    await charge_resource(db, uid, "creative_generation", "Geração de criativos (copiloto)")

    profile = await db.business_profile.find_one(
        {"user_id": uid}, {"_id": 0, "segment": 1, "differentials": 1, "communication_restrictions": 1, "personas": 1}) or {}
    products = [p async for p in db.business_products.find(
        {"user_id": uid}, {"_id": 0, "name": 1, "price": 1, "max_cpl": 1, "max_cac": 1}).limit(10)]
    # Base de conhecimento da campanha (só texto/link)
    knowledge = []
    async for k in db.campaign_knowledge.find(
        {"user_id": uid, "campaign_id": body.campaign_id, "kind": {"$in": ["text", "link"]}},
        {"_id": 0, "title": 1, "content": 1}).limit(50):
        knowledge.append(k)

    context = {
        "campaign_id": body.campaign_id,
        "product_name": body.product_name,
        "instruction": body.instruction,
        "business_profile": profile,
        "products": products,
        "campaign_knowledge": knowledge,
    }
    count = max(1, min(int(body.count or 3), 6))
    creatives = await ai_service.generate_creatives(context, count)

    now = datetime.now(timezone.utc).isoformat()
    saved = []
    for cr in creatives:
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "campaign_id": body.campaign_id,
            "headline": (cr.get("headline") or "")[:120],
            "primary_text": cr.get("primary_text") or "",
            "description": (cr.get("description") or "")[:60],
            "cta": cr.get("cta") or "LEARN_MORE",
            "angle": cr.get("angle") or "",
            "image_prompt": cr.get("image_prompt") or "",
            "creative_type": "generated",
            "status": "draft",
            "generation": 1,
            "metrics": {},
            "created_at": now,
        }
        await db.creative_assets.insert_one({**doc})
        doc.pop("user_id", None)
        saved.append(doc)

    await log_activity(db, uid, "creatives_generated",
                       f"{len(saved)} criativo(s) gerado(s) para a campanha",
                       {"campaign_id": body.campaign_id, "count": len(saved)})
    return {"creatives": saved, "count": len(saved)}


@router.post("/creatives/{creative_id}/score")
async def score_creative(
    creative_id: str,
    body: CreativeScoreIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.creative_assets.update_one(
        {"id": creative_id, "user_id": user["id"]},
        {"$set": {
            "ai_score": body.ai_score,
            "predicted_ctr_range": body.predicted_ctr_range,
            "brand_compliant": body.brand_compliant,
            "policy_compliant": body.policy_compliant,
            "score_notes": body.notes,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}


@router.post("/creatives/{creative_id}/promote")
async def promote_creative(
    creative_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.creative_assets.update_one(
        {"id": creative_id, "user_id": user["id"]},
        {"$set": {"status": "winner", "promoted_at": datetime.now(timezone.utc).isoformat()}},
    )
    await log_activity(db, user["id"], "creative_promoted",
                       f"Criativo {creative_id} promovido a vencedor", {})
    return {"ok": True}


@router.post("/creatives/{creative_id}/archive")
async def archive_creative(
    creative_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.creative_assets.update_one(
        {"id": creative_id, "user_id": user["id"]},
        {"$set": {"status": "archived", "archived_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@router.get("/types")
async def creative_types():
    return {"types": CREATIVE_TYPES, "formats": FORMATS}


@router.get("/briefings")
async def list_briefings(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cur = db.creative_briefings.find(
        {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).limit(20)
    return [d async for d in cur]
