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


@router.post("/journey/{jid}/approve")
async def approve_campaign(jid: str, user: dict = Depends(get_current_user),
                           db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await _get_journey(db, jid, user["id"])
    if "campanha" not in j.get("done", []):
        raise HTTPException(status_code=400, detail="Aprove a estrutura da campanha primeiro")
    await db.journeys.update_one({"id": jid}, {"$set": {"status": "approved", "approved_at": _now()}})
    j["status"] = "approved"
    return await _advance(db, j, "aprovacao")


# ── Landing pública ──────────────────────────────────────────────
@router.get("/public/lp/{slug}")
async def public_landing(slug: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    j = await db.journeys.find_one({"landing_slug": slug}, {"_id": 0, "deliverables.landing": 1, "name": 1, "id": 1})
    if not j:
        raise HTTPException(status_code=404, detail="Página não encontrada")
    await db.journeys.update_one({"id": j["id"]}, {"$inc": {"landing_views": 1}})
    return {"name": j.get("name"), "landing": j.get("deliverables", {}).get("landing", {})}


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
