"""
Jornada guiada pelo copiloto (Escola de Leads).

Briefing por conversa → funil → copy → landing → criativos → campanha →
aprovação → monitoramento. Inclui a landing pública (/api/public/lp/{slug})
e o CRM de leads (/api/leads).
"""
import json
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from services import llm
from services.credits import charge_resource
from services.db import get_db
from services.llm_usage import record_usage
from services.security import get_current_user
from services.meta_client import MetaAPIError
from routes.meta import get_meta_client
from routes.builder import upload_image, ImageUploadIn

router = APIRouter(prefix="/api", tags=["journey"])

FUNNELS = {
    "aplicacao": "Funil de aplicação",
    "oferta_direta": "Funil de oferta direta",
    "live": "Funil de live semanal",
}
ENABLED_FUNNELS = {"aplicacao"}

PHASES = [
    ("briefing", "Briefing"),
    ("funil", "Funil"),
    ("copy", "Copy"),
    ("landing", "Landing page"),
    ("criativos", "Criativos"),
    ("campanha", "Campanha"),
    ("aprovacao", "Aprovação"),
    ("monitoramento", "Monitoramento"),
]
PHASE_KEYS = [k for k, _ in PHASES]
LEAD_STATUSES = ["novo", "contato", "qualificado", "ganho", "perdido"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_from(text: str):
    """Extrai o primeiro objeto JSON de uma resposta do LLM."""
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


async def _get_journey(db, jid: str, user_id: str) -> dict:
    j = await db.journeys.find_one({"id": jid, "user_id": user_id}, {"_id": 0})
    if not j:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    return j


async def _advance(db, j: dict, done_key: str) -> dict:
    """Marca a fase como concluída e avança se ela for a fase atual."""
    done = set(j.get("done", [])) | {done_key}
    phase = j.get("phase", 0)
    while phase < len(PHASE_KEYS) - 1 and PHASE_KEYS[phase] in done:
        phase += 1
    upd = {"done": sorted(done, key=PHASE_KEYS.index), "phase": phase, "updated_at": _now()}
    await db.journeys.update_one({"id": j["id"]}, {"$set": upd})
    j.update(upd)
    return j


def _brief_text(j: dict) -> str:
    return json.dumps(j.get("briefing") or {}, ensure_ascii=False)


# ── Jornada ──────────────────────────────────────────────────────
class JourneyIn(BaseModel):
    name: str = ""


@router.get("/journey/meta")
async def journey_meta():
    return {
        "phases": [{"key": k, "label": l} for k, l in PHASES],
        "funnels": [{"key": k, "label": l, "enabled": k in ENABLED_FUNNELS} for k, l in FUNNELS.items()],
        "lead_statuses": LEAD_STATUSES,
    }


@router.get("/journey")
async def list_journeys(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.journeys.find({"user_id": user["id"]}, {"_id": 0, "messages": 0}).sort("created_at", -1).limit(50)
    return [d async for d in cur]


@router.post("/journey")
async def create_journey(body: JourneyIn, user: dict = Depends(get_current_user),
                         db: AsyncIOMotorDatabase = Depends(get_db)):
    first = user.get("name", "").split(" ")[0] or "tudo bem"
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name.strip() or "Nova campanha",
        "phase": 0,
        "done": [],
        "funnel": None,
        "briefing": None,
        "messages": [{
            "role": "assistant",
            "content": f"Olá, {first}! Vou montar seu funil completo com você. "
                       "Pra começar: qual é a sua empresa e o que você vende?",
        }],
        "deliverables": {},
        "landing_slug": None,
        "landing_views": 0,
        "status": "draft",
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.journeys.insert_one(dict(doc))
    return doc


@router.get("/journey/{jid}")
async def get_journey(jid: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    return await _get_journey(db, jid, user["id"])


@router.delete("/journey/{jid}")
async def delete_journey(jid: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.journeys.delete_one({"id": jid, "user_id": user["id"]})
    return {"ok": True}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


BRIEFING_SYSTEM = """Você é o copiloto de tráfego da Escola de Leads. Está fazendo o briefing
de um cliente por conversa, em português, de forma curta e amigável (1 pergunta por vez).
Colete: empresa, produto/serviço, público-alvo, principal dor do público, oferta/promessa,
diferenciais, ticket médio, cidade/região de atuação e orçamento diário de anúncios.
Quando tiver informação suficiente (ou o cliente pedir pra seguir), responda com um resumo
curto e, NA ÚLTIMA LINHA, um JSON puro no formato:
{"briefing_done": true, "empresa": "", "produto": "", "publico": "", "dor": "", "oferta": "",
"diferenciais": "", "ticket": "", "regiao": "", "orcamento_diario": ""}
Antes disso, NUNCA escreva JSON."""


@router.post("/journey/{jid}/chat")
async def journey_chat(jid: str, body: ChatIn, user: dict = Depends(get_current_user),
                       db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await _get_journey(db, jid, user["id"])
    await charge_resource(db, user["id"], "ai_chat", "Copiloto: briefing")
    msgs = j.get("messages", []) + [{"role": "user", "content": body.message}]
    convo = "\n".join(f"{'Cliente' if m['role'] == 'user' else 'Copiloto'}: {m['content']}" for m in msgs[-30:])
    reply = await llm.complete_text(f"journey-{jid}", BRIEFING_SYSTEM, convo)
    reply = re.sub(r"^\s*\**copiloto\**\s*:\s*", "", reply, flags=re.I)  # IA às vezes repete o rótulo
    await record_usage(db, "ai_chat", user_id=user["id"], input_text=BRIEFING_SYSTEM + convo, output_text=reply)

    data = _json_from(reply) if '"briefing_done"' in reply else None
    visible = reply[: reply.find("{")].strip() if data else reply.strip()
    if data:
        data.pop("briefing_done", None)
        visible = (visible + "\n\nBriefing concluído! Agora escolha o modelo de funil.").strip()
    msgs.append({"role": "assistant", "content": visible})
    upd = {"messages": msgs, "updated_at": _now()}
    if data:
        upd["briefing"] = data
        if j.get("name") in ("", "Nova campanha") and data.get("empresa"):
            upd["name"] = data["empresa"]
    await db.journeys.update_one({"id": jid}, {"$set": upd})
    j.update(upd)
    if data:
        j = await _advance(db, j, "briefing")
    return j


class FunnelIn(BaseModel):
    funnel: str


@router.post("/journey/{jid}/funnel")
async def choose_funnel(jid: str, body: FunnelIn, user: dict = Depends(get_current_user),
                        db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await _get_journey(db, jid, user["id"])
    if body.funnel not in ENABLED_FUNNELS:
        raise HTTPException(status_code=400, detail="Funil ainda não disponível")
    if not j.get("briefing"):
        raise HTTPException(status_code=400, detail="Conclua o briefing primeiro")
    await db.journeys.update_one({"id": jid}, {"$set": {"funnel": body.funnel}})
    j["funnel"] = body.funnel
    return await _advance(db, j, "funil")


GEN_PROMPTS = {
    "copy": """Crie a copy de um funil de aplicação (anúncio → landing com formulário de aplicação →
contato comercial). Responda SOMENTE com JSON:
{"big_idea": "", "headlines": ["", "", ""], "primary_texts": ["", "", ""],
"ctas": ["", ""], "objecoes": [{"objecao": "", "resposta": ""}]}""",
    "landing": """Crie a landing page de um funil de aplicação. Use a copy aprovada. Responda SOMENTE com JSON:
{"headline": "", "subheadline": "", "cta": "", "beneficios": ["", "", ""],
"para_quem": ["", "", ""], "prova": "", "faq": [{"q": "", "a": ""}],
"perguntas_aplicacao": ["", "", ""], "cor": "#2563eb"}""",
    "criativos": """Crie 3 criativos para Meta Ads deste funil de aplicação (1 vídeo curto e 2 estáticos).
Responda SOMENTE com JSON:
{"criativos": [{"tipo": "video", "titulo": "", "gancho": "", "roteiro": "", "texto_tela": "", "legenda": ""},
{"tipo": "estatico", "titulo": "", "texto_imagem": "", "legenda": "", "prompt_imagem": ""}]}""",
    "campanha": """Monte a estrutura da campanha Meta Ads para este funil de aplicação.
Responda SOMENTE com JSON:
{"objetivo": "OUTCOME_LEADS", "nome": "", "orcamento_diario": 0,
"conjuntos": [{"nome": "", "publico": "", "idade": "", "interesses": [""], "posicionamentos": ""}],
"anuncios": [{"criativo": "", "headline": "", "texto": "", "cta": "APPLY_NOW"}],
"kpis": {"cpl_alvo": "", "taxa_conversao_alvo": ""}}""",
}
GEN_ORDER = {"copy": "funil", "landing": "copy", "criativos": "landing", "campanha": "criativos"}


@router.post("/journey/{jid}/generate/{step}")
async def generate_step(jid: str, step: str, user: dict = Depends(get_current_user),
                        db: AsyncIOMotorDatabase = Depends(get_db)):
    if step not in GEN_PROMPTS:
        raise HTTPException(status_code=400, detail="Etapa inválida")
    j = await _get_journey(db, jid, user["id"])
    if GEN_ORDER[step] not in j.get("done", []):
        raise HTTPException(status_code=400, detail="Conclua a etapa anterior primeiro")
    await charge_resource(db, user["id"], "journey_generation", f"Copiloto: gerar {step}")
    d = j.get("deliverables", {})
    ctx = (f"Funil: {FUNNELS.get(j.get('funnel'), '')}\nBriefing: {_brief_text(j)}\n"
           f"Copy aprovada: {json.dumps(d.get('copy', {}), ensure_ascii=False)}")
    if step == "campanha":
        ctx += f"\nCriativos: {json.dumps(d.get('criativos', {}), ensure_ascii=False)}"
    system = "Você é um estrategista sênior de tráfego e copywriter de respostas diretas. Português do Brasil."
    out = await llm.complete_text(f"journey-{jid}-{step}", system, GEN_PROMPTS[step] + "\n\n" + ctx)
    await record_usage(db, "journey_generation", user_id=user["id"], input_text=system + ctx, output_text=out)
    data = _json_from(out)
    if not data:
        raise HTTPException(status_code=502, detail="A IA não retornou um resultado válido. Tente de novo.")
    await db.journeys.update_one({"id": jid}, {"$set": {f"deliverables.{step}": data, "updated_at": _now()}})
    j.setdefault("deliverables", {})[step] = data
    return j


class DeliverableIn(BaseModel):
    data: dict


@router.put("/journey/{jid}/deliverable/{step}")
async def save_deliverable(jid: str, step: str, body: DeliverableIn, user: dict = Depends(get_current_user),
                           db: AsyncIOMotorDatabase = Depends(get_db)):
    if step not in GEN_PROMPTS:
        raise HTTPException(status_code=400, detail="Etapa inválida")
    j = await _get_journey(db, jid, user["id"])
    await db.journeys.update_one({"id": jid}, {"$set": {f"deliverables.{step}": body.data, "updated_at": _now()}})
    j.setdefault("deliverables", {})[step] = body.data
    return j


@router.post("/journey/{jid}/confirm/{step}")
async def confirm_step(jid: str, step: str, user: dict = Depends(get_current_user),
                       db: AsyncIOMotorDatabase = Depends(get_db)):
    """Cliente aprova o entregável da etapa. A landing é publicada ao ser aprovada."""
    if step not in GEN_PROMPTS:
        raise HTTPException(status_code=400, detail="Etapa inválida")
    j = await _get_journey(db, jid, user["id"])
    if not j.get("deliverables", {}).get(step):
        raise HTTPException(status_code=400, detail="Gere o conteúdo antes de aprovar")
    if step == "landing" and not j.get("landing_slug"):
        base = re.sub(r"[^a-z0-9]+", "-", (j.get("name") or "lp").lower()).strip("-")[:30] or "lp"
        slug = f"{base}-{secrets.token_hex(3)}"
        await db.journeys.update_one({"id": jid}, {"$set": {"landing_slug": slug}})
        j["landing_slug"] = slug
    return await _advance(db, j, step)


# ── Publicação no Meta ───────────────────────────────────────────
def _meta_err(e: MetaAPIError) -> HTTPException:
    return HTTPException(status_code=e.status if e.status and e.status < 500 else 400, detail=e.detail)


def _num(v, default: float) -> float:
    m = re.search(r"\d+(?:[.,]\d+)?", str(v or ""))
    return float(m.group(0).replace(",", ".")) if m else default


def _ages(text: str) -> tuple[int, int]:
    nums = [int(n) for n in re.findall(r"\d+", str(text or ""))]
    lo = min(max(nums[0], 18), 65) if nums else 18
    hi = min(max(nums[1], lo), 65) if len(nums) > 1 else 65
    return lo, hi


@router.get("/journey-meta-assets")
async def meta_assets(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Páginas e pixels da conta conectada, para o passo de publicação."""
    client = await get_meta_client(user, db)

    async def fetch(path, fields):
        try:
            return (await client._request("GET", path, params={"fields": fields, "limit": 100})).get("data", [])
        except MetaAPIError:
            return []

    # Páginas do perfil + páginas que a conta de anúncios pode promover (inclui as do
    # Gerenciador de Negócios, que não aparecem em /me/accounts).
    pages = {}
    for p in await fetch(f"/{client.ad_account_id}/promote_pages", "id,name") + await fetch("/me/accounts", "id,name"):
        pages.setdefault(p["id"], p)
    pixels = await fetch(f"/{client.ad_account_id}/adspixels", "id,name")
    return {"pages": list(pages.values()), "pixels": pixels}


class PublishIn(BaseModel):
    page_id: str = Field(pattern=r"^\d{5,25}$")
    pixel_id: str = ""
    landing_url: str = Field(min_length=8)
    activate: bool = False
    images: list[str] = Field(default_factory=list, max_length=3)  # imagens próprias (data URL)


async def _upload_own_images(user: dict, db, images: list[str]) -> list[str]:
    hashes = []
    for i, data in enumerate(images):
        if len(data) > 6_000_000:
            raise HTTPException(status_code=400, detail="Cada imagem deve ter no máximo 4 MB.")
        up = await upload_image(ImageUploadIn(filename=f"anuncio-{i + 1}.jpg", data_base64=data), user=user, db=db)
        if up.get("image_hash"):
            hashes.append(up["image_hash"])
    if not hashes:
        raise HTTPException(status_code=400, detail="O Meta não aceitou as imagens enviadas. Use JPG ou PNG.")
    return hashes


async def _creative_images(user: dict, db, criativos: list, n: int) -> list[str]:
    """Gera as imagens dos criativos estáticos e sobe na conta. Retorna image_hashes."""
    prompts = [c.get("prompt_imagem") or c.get("texto_imagem") for c in criativos if c.get("tipo") == "estatico"]
    prompts = [p for p in prompts if p][:n] or ["Professional ad image, modern, clean, high contrast"]
    hashes = []
    for i, p in enumerate(prompts):
        img = await llm.generate_image(f"{p}. Square 1:1 social media ad, no text overlay.")
        if not img:
            continue
        # cobra só depois que a imagem foi de fato gerada
        await charge_resource(db, user["id"], "creative_generation", "Copiloto: imagem do anúncio")
        up = await upload_image(ImageUploadIn(filename=f"criativo-{i + 1}.png", data_base64=img["data"]), user=user, db=db)
        if up.get("image_hash"):
            hashes.append(up["image_hash"])
    if not hashes:
        raise HTTPException(status_code=502, detail="O provedor de IA não devolveu imagens. Envie suas próprias imagens ou troque o modelo de imagem em Admin → Modelos IA.")
    return hashes


@router.post("/journey/{jid}/publish")
async def publish_campaign(jid: str, body: PublishIn, user: dict = Depends(get_current_user),
                           db: AsyncIOMotorDatabase = Depends(get_db)):
    """Aprova e publica campanha + conjuntos + anúncios no Meta (pausada, salvo activate=True)."""
    j = await _get_journey(db, jid, user["id"])
    if "campanha" not in j.get("done", []):
        raise HTTPException(status_code=400, detail="Aprove a estrutura da campanha primeiro")
    if (j.get("meta") or {}).get("campaign_id"):
        raise HTTPException(status_code=400, detail="Campanha já publicada")
    client = await get_meta_client(user, db)
    d = j.get("deliverables", {})
    plan = d.get("campanha") or {}
    conjuntos = (plan.get("conjuntos") or [{}])[:3]
    anuncios = (plan.get("anuncios") or [])[:3]
    if not anuncios:
        raise HTTPException(status_code=400, detail="A estrutura da campanha não tem anúncios")
    budget = max(_num(plan.get("orcamento_diario"), _num((j.get("briefing") or {}).get("orcamento_diario"), 30)), 10)
    leads = bool(body.pixel_id)
    hashes = (await _upload_own_images(user, db, body.images) if body.images
              else await _creative_images(user, db, (d.get("criativos") or {}).get("criativos", []), len(anuncios)))

    campaign_id = None
    try:
        camp = await client.create_campaign({
            "name": plan.get("nome") or j.get("name") or "Campanha Escola de Leads",
            "objective": "OUTCOME_LEADS" if leads else "OUTCOME_TRAFFIC",
            "buying_type": "AUCTION",
            "status": "PAUSED",
            "special_ad_categories": "[]",
            "is_adset_budget_sharing_enabled": "false",
        })
        campaign_id = camp["id"]
        adset_ids, ad_ids = [], []
        for cj in conjuntos:
            interests = []
            for name in (cj.get("interesses") or [])[:5]:
                if not name:
                    continue
                r = await client._request("GET", "/search", params={"type": "adinterest", "q": name, "limit": 1})
                if r.get("data"):
                    interests.append({"id": r["data"][0]["id"], "name": r["data"][0]["name"]})
            age_min, age_max = _ages(cj.get("idade"))
            targeting = {
                "geo_locations": {"countries": ["BR"]},
                "age_min": age_min, "age_max": age_max,
                "targeting_automation": {"advantage_audience": 0},
            }
            if interests:
                targeting["flexible_spec"] = [{"interests": interests}]
            adset = {
                "name": cj.get("nome") or "Conjunto",
                "campaign_id": campaign_id,
                "daily_budget": str(int(budget / len(conjuntos) * 100)),
                "billing_event": "IMPRESSIONS",
                "optimization_goal": "OFFSITE_CONVERSIONS" if leads else "LANDING_PAGE_VIEWS",
                "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
                "targeting": json.dumps(targeting),
                "status": "ACTIVE",
            }
            if leads:
                adset["promoted_object"] = json.dumps({"pixel_id": body.pixel_id, "custom_event_type": "LEAD"})
            res = await client._request("POST", f"/{client.ad_account_id}/adsets", data=adset)
            adset_ids.append(res["id"])
            for i, ad in enumerate(anuncios):
                creative = await client._request("POST", f"/{client.ad_account_id}/adcreatives", data={
                    "name": f"{ad.get('headline') or 'Anúncio'} – Criativo",
                    "object_story_spec": json.dumps({"page_id": body.page_id, "link_data": {
                        "link": body.landing_url,
                        "message": ad.get("texto") or "",
                        "name": (ad.get("headline") or "")[:40],
                        "image_hash": hashes[i % len(hashes)],
                        "call_to_action": {"type": ad.get("cta") or "APPLY_NOW", "value": {"link": body.landing_url}},
                    }}),
                })
                res = await client._request("POST", f"/{client.ad_account_id}/ads", data={
                    "name": ad.get("headline") or f"Anúncio {i + 1}",
                    "adset_id": adset_ids[-1],
                    "creative": json.dumps({"creative_id": creative["id"]}),
                    "status": "ACTIVE",
                })
                ad_ids.append(res["id"])
        if body.activate:
            await client.update_campaign(campaign_id, {"status": "ACTIVE"})
    except Exception as e:
        if campaign_id:  # não deixa campanha órfã pela metade
            try:
                await client._request("DELETE", f"/{campaign_id}")
            except Exception:
                pass
        if isinstance(e, MetaAPIError):
            raise _meta_err(e)
        raise

    meta = {"campaign_id": campaign_id, "adset_ids": adset_ids, "ad_ids": ad_ids,
            "status": "ACTIVE" if body.activate else "PAUSED", "published_at": _now()}
    upd = {"meta": meta, "pixel_id": body.pixel_id or None, "status": "approved", "approved_at": _now()}
    await db.journeys.update_one({"id": jid}, {"$set": upd})
    j.update(upd)
    return await _advance(db, j, "aprovacao")


# ── Monitoramento ────────────────────────────────────────────────
INSIGHT_FIELDS = "ad_id,ad_name,impressions,clicks,spend,ctr,frequency"


def _f(x) -> float:
    try:
        return float(x or 0)
    except Exception:
        return 0.0


def build_alerts(recent: list, prior: list, views: int, leads: int, spend: float, cpl_target: float) -> list:
    """Regras de alerta. recent = insights por anúncio (3d), prior = (14d)."""
    alerts = []
    prior_by = {r.get("ad_id"): r for r in prior}
    for r in recent:
        imp, ctr, freq = _f(r.get("impressions")), _f(r.get("ctr")), _f(r.get("frequency"))
        p_ctr = _f(prior_by.get(r.get("ad_id"), {}).get("ctr"))
        drop = (p_ctr - ctr) / p_ctr * 100 if p_ctr else 0
        name = r.get("ad_name") or r.get("ad_id")
        if imp >= 500 and (freq >= 3 or drop >= 30):
            alerts.append({"key": f"fadiga:{r.get('ad_id')}", "level": "high", "action": "criativos",
                           "title": f"Criativo cansado: {name}",
                           "message": f"Frequência {freq:.1f} e CTR {'caiu ' + str(round(drop)) + '%' if drop >= 30 else 'estável'}. Hora de trocar o criativo."})
        elif imp >= 1000 and ctr < 0.8:
            alerts.append({"key": f"copy:{r.get('ad_id')}", "level": "medium", "action": "copy",
                           "title": f"Copy com baixa atração: {name}",
                           "message": f"CTR de {ctr:.2f}% (abaixo de 0,8%). Teste novas headlines e textos."})
    conv = leads / views * 100 if views else 0
    if views >= 50 and conv < 10:
        alerts.append({"key": "conversao", "level": "high", "action": "estrutura",
                       "title": "Conversão da página baixa",
                       "message": f"{conv:.1f}% das visitas viram lead (meta ≥ 10%). Revise a estrutura da página e da oferta."})
    if cpl_target and leads >= 3 and spend / leads > cpl_target * 1.3:
        alerts.append({"key": "cpl", "level": "medium", "action": "estrutura",
                       "title": "Custo por lead acima da meta",
                       "message": f"CPL R$ {spend / leads:.2f} vs meta R$ {cpl_target:.2f}. Ajuste público ou oferta."})
    if cpl_target and leads == 0 and spend > cpl_target * 3:
        alerts.append({"key": "sem_leads", "level": "high", "action": "estrutura",
                       "title": "Gastando sem gerar leads",
                       "message": f"R$ {spend:.2f} investidos e nenhum lead. Revise a estrutura do funil."})
    return alerts


@router.get("/journey/{jid}/health")
async def journey_health(jid: str, user: dict = Depends(get_current_user),
                         db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await _get_journey(db, jid, user["id"])
    cid = (j.get("meta") or {}).get("campaign_id")
    if not cid:
        raise HTTPException(status_code=400, detail="Campanha ainda não publicada")
    client = await get_meta_client(user, db)
    try:
        q = {"level": "ad", "fields": INSIGHT_FIELDS, "limit": 200}
        recent = (await client._request("GET", f"/{cid}/insights", params={**q, "date_preset": "last_3d"})).get("data", [])
        prior = (await client._request("GET", f"/{cid}/insights", params={**q, "date_preset": "last_14d"})).get("data", [])
    except MetaAPIError as e:
        raise _meta_err(e)
    leads = await db.leads.count_documents({"journey_id": jid})
    views = j.get("landing_views", 0)
    spend = sum(_f(r.get("spend")) for r in prior)
    imps = sum(_f(r.get("impressions")) for r in prior)
    clicks = sum(_f(r.get("clicks")) for r in prior)
    cpl_target = _num(((j.get("deliverables", {}).get("campanha") or {}).get("kpis") or {}).get("cpl_alvo"), 0)
    return {
        "kpis": {
            "spend": round(spend, 2), "impressions": int(imps), "clicks": int(clicks),
            "ctr": round(clicks / imps * 100, 2) if imps else 0,
            "views": views, "leads": leads,
            "conversion": round(leads / views * 100, 1) if views else 0,
            "cpl": round(spend / leads, 2) if leads else None, "cpl_target": cpl_target or None,
        },
        "alerts": build_alerts(recent, prior, views, leads, spend, cpl_target),
    }


SUGGEST_PROMPTS = {
    "copy": 'O anúncio está com CTR baixo. Crie novas copies. JSON: {"headlines": ["", "", ""], "primary_texts": ["", "", ""], "angulo": ""}',
    "criativos": 'O criativo está com fadiga. Crie 3 novos criativos com ângulos diferentes. JSON: {"criativos": [{"tipo": "video|estatico", "gancho": "", "roteiro_ou_texto": "", "prompt_imagem": ""}]}',
    "estrutura": 'A conversão/CPL está ruim. Diagnostique e sugira nova estrutura (oferta, página, público). JSON: {"diagnostico": "", "mudancas": [{"onde": "", "o_que": "", "por_que": ""}], "nova_headline_pagina": ""}',
}


class SuggestIn(BaseModel):
    kind: str
    context: str = Field(default="", max_length=2000)


@router.post("/journey/{jid}/suggest")
async def suggest(jid: str, body: SuggestIn, user: dict = Depends(get_current_user),
                  db: AsyncIOMotorDatabase = Depends(get_db)):
    if body.kind not in SUGGEST_PROMPTS:
        raise HTTPException(status_code=400, detail="Tipo inválido")
    j = await _get_journey(db, jid, user["id"])
    await charge_resource(db, user["id"], "journey_generation", f"Copiloto: sugestão de {body.kind}")
    d = j.get("deliverables", {})
    ctx = (f"Briefing: {_brief_text(j)}\nCopy atual: {json.dumps(d.get('copy', {}), ensure_ascii=False)}\n"
           f"Criativos atuais: {json.dumps(d.get('criativos', {}), ensure_ascii=False)}\nAlerta: {body.context}")
    system = "Você é um gestor de tráfego sênior otimizando um funil de aplicação. Português do Brasil."
    out = await llm.complete_text(f"journey-{jid}-suggest", system, SUGGEST_PROMPTS[body.kind] + "\n\n" + ctx)
    await record_usage(db, "journey_generation", user_id=user["id"], input_text=system + ctx, output_text=out)
    data = _json_from(out)
    if not data:
        raise HTTPException(status_code=502, detail="A IA não retornou um resultado válido. Tente de novo.")
    item = {"id": str(uuid.uuid4()), "kind": body.kind, "context": body.context, "data": data, "created_at": _now()}
    sugs = ([item] + (j.get("suggestions") or []))[:10]
    await db.journeys.update_one({"id": jid}, {"$set": {"suggestions": sugs}})
    j["suggestions"] = sugs
    return j


class MetaStatusIn(BaseModel):
    active: bool


@router.post("/journey/{jid}/meta-status")
async def set_meta_status(jid: str, body: MetaStatusIn, user: dict = Depends(get_current_user),
                          db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await _get_journey(db, jid, user["id"])
    cid = (j.get("meta") or {}).get("campaign_id")
    if not cid:
        raise HTTPException(status_code=400, detail="Campanha ainda não publicada")
    client = await get_meta_client(user, db)
    status = "ACTIVE" if body.active else "PAUSED"
    try:
        await client.update_campaign(cid, {"status": status})
    except MetaAPIError as e:
        raise _meta_err(e)
    await db.journeys.update_one({"id": jid}, {"$set": {"meta.status": status}})
    j["meta"]["status"] = status
    return j


# ── Landing pública ──────────────────────────────────────────────
@router.get("/public/lp/{slug}")
async def public_landing(slug: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await db.journeys.find_one({"landing_slug": slug},
                                   {"_id": 0, "deliverables.landing": 1, "name": 1, "id": 1, "pixel_id": 1})
    if not j:
        raise HTTPException(status_code=404, detail="Página não encontrada")
    await db.journeys.update_one({"id": j["id"]}, {"$inc": {"landing_views": 1}})
    return {"name": j.get("name"), "landing": j.get("deliverables", {}).get("landing", {}),
            "pixel_id": j.get("pixel_id")}


class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    answers: dict = Field(default_factory=dict)


@router.post("/public/lp/{slug}/lead")
async def public_lead(slug: str, body: LeadIn, db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await db.journeys.find_one({"landing_slug": slug}, {"_id": 0, "id": 1, "user_id": 1, "name": 1})
    if not j:
        raise HTTPException(status_code=404, detail="Página não encontrada")
    answers = {str(k)[:200]: str(v)[:2000] for k, v in list(body.answers.items())[:20]}
    await db.leads.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": j["user_id"],
        "journey_id": j["id"],
        "campaign_name": j.get("name"),
        "name": body.name.strip(),
        "email": body.email,
        "phone": body.phone.strip(),
        "answers": answers,
        "status": "novo",
        "notes": "",
        "source": "landing",
        "created_at": _now(),
    })
    return {"ok": True}


# ── Leads (CRM) ──────────────────────────────────────────────────
@router.get("/leads")
async def list_leads(journey_id: str = "", user: dict = Depends(get_current_user),
                     db: AsyncIOMotorDatabase = Depends(get_db)):
    q = {"user_id": user["id"]}
    if journey_id:
        q["journey_id"] = journey_id
    leads = [d async for d in db.leads.find(q, {"_id": 0}).sort("created_at", -1).limit(1000)]
    jq = {"user_id": user["id"], "landing_slug": {"$ne": None}}
    if journey_id:
        jq["id"] = journey_id
    views = sum([d.get("landing_views", 0) async for d in db.journeys.find(jq, {"landing_views": 1})])
    by_status = {s: 0 for s in LEAD_STATUSES}
    for lead in leads:
        by_status[lead.get("status", "novo")] = by_status.get(lead.get("status", "novo"), 0) + 1
    return {
        "leads": leads,
        "stats": {
            "total": len(leads),
            "views": views,
            "conversion": round(len(leads) / views * 100, 1) if views else 0,
            "by_status": by_status,
        },
    }


class LeadPatch(BaseModel):
    status: str | None = None
    notes: str | None = None


@router.patch("/leads/{lid}")
async def update_lead(lid: str, body: LeadPatch, user: dict = Depends(get_current_user),
                      db: AsyncIOMotorDatabase = Depends(get_db)):
    upd = {}
    if body.status is not None:
        if body.status not in LEAD_STATUSES:
            raise HTTPException(status_code=400, detail="Status inválido")
        upd["status"] = body.status
    if body.notes is not None:
        upd["notes"] = body.notes[:4000]
    if upd:
        upd["updated_at"] = _now()
        await db.leads.update_one({"id": lid, "user_id": user["id"]}, {"$set": upd})
    return {"ok": True}
