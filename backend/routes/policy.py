"""
Policy Guardian (Camada 2 · item 21 do roadmap).

Revisa anúncios ANTES da publicação para reduzir reprovações e risco de
restrição da conta. Duas camadas:
  1. Checagens determinísticas (regex/termos) — funcionam sempre, sem custo;
  2. Análise de IA com JSON estrito — categorias especiais, promessas,
     atributos pessoais, consistência anúncio × página.

Risco alto bloqueia a publicação pelo Campaign Builder (aprovação humana
excepcional continua possível na tela).
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user
from services.activity import log_activity

router = APIRouter(prefix="/api/policy", tags=["policy"])

# Padrões de risco — categoria: [(regex, explicação)]
RED_FLAGS = {
    "promessa_exagerada": [
        (r"\bgarantid[oa]s?\b", "Promessa de resultado garantido"),
        (r"\b100%\s*(de\s*)?(resultado|aprova|lucro|eficaz)", "Alegação de eficácia absoluta"),
        (r"\bsem\s+esfor[çc]o\b", "Resultado sem esforço"),
        (r"\bmilagr", "Linguagem milagrosa"),
        (r"\bfique\s+ric[oa]\b", "Promessa de enriquecimento"),
        (r"\bganhe\s+r?\$?\s*\d+", "Promessa de ganho financeiro específico"),
        (r"\brenda\s+(extra\s+)?garantida\b", "Renda garantida"),
        (r"\bperca\s+\d+\s*(kg|quilos)", "Promessa de perda de peso específica"),
        (r"\bemagre[çc]a\s+(r[áa]pido|\d+)", "Promessa de emagrecimento rápido"),
    ],
    "atributo_pessoal": [
        (r"\bvoc[êe]\s+(est[áa]|sofre|tem|é)\s+(acima do peso|obes|endividad|doente|deprimid|ansios|carec|solteir)", "Implica atributo pessoal do usuário (proibido pela Meta)"),
        (r"\bsua\s+(d[íi]vida|doen[çc]a|depress[ãa]o|ansiedade|calv[íi]cie|obesidade)", "Referência direta a condição pessoal"),
        (r"\bsua\s+idade\b", "Referência à idade do usuário"),
    ],
    "saude": [
        (r"\bcura(r|\b)", "Alegação de cura"),
        (r"\btrata(mento)?\s+(definitivo|garantido)", "Tratamento definitivo/garantido"),
        (r"\belimina\s+(a\s+)?(doen[çc]a|diabetes|ansiedade|depress[ãa]o)", "Eliminação de doença"),
    ],
    "financas": [
        (r"\binvestimento\s+sem\s+risco\b", "Investimento sem risco"),
        (r"\blucro\s+(certo|garantido)\b", "Lucro garantido"),
        (r"\bdobre\s+seu\s+dinheiro\b", "Promessa de multiplicação de dinheiro"),
    ],
    "antes_depois": [
        (r"\bantes\s+e\s+depois\b", "Formato antes/depois (restrito para saúde/estética)"),
    ],
}

POLICY_SYS = (
    "Você é um revisor de políticas do Meta Ads. Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Analise o anúncio e retorne JSON ESTRITO: "
    "{ risk_level: 'low'|'medium'|'high', "
    "special_categories: [categorias especiais aplicáveis: crédito, emprego, habitação, política, nenhuma], "
    "findings: [ { category, excerpt, why_risky, severity: 'low'|'medium'|'high' } ], "
    "suggestions: [ reescritas seguras dos trechos problemáticos ], "
    "landing_page_consistency: string ou null, "
    "summary_pt: resumo de 2 frases } "
    "Considere: promessas exageradas, atributos pessoais, saúde, finanças, antes/depois, "
    "propriedade intelectual, uso de marcas. Retorne APENAS JSON."
)


class ReviewIn(BaseModel):
    headline: str = ""
    primary_text: str = ""
    description: str = ""
    cta: str = ""
    landing_url: str = ""
    image_description: str = ""
    niche: str = ""
    use_ai: bool = True


def deterministic_scan(texts: dict) -> list[dict]:
    findings = []
    joined = " ".join(v for v in texts.values() if v).lower()
    for category, patterns in RED_FLAGS.items():
        for pattern, why in patterns:
            m = re.search(pattern, joined, flags=re.IGNORECASE)
            if m:
                findings.append({
                    "category": category,
                    "excerpt": m.group(0),
                    "why_risky": why,
                    "severity": "high" if category in ("atributo_pessoal", "saude") else "medium",
                    "source": "scanner",
                })
    return findings


def _risk_from_findings(findings: list[dict]) -> str:
    if any(f.get("severity") == "high" for f in findings):
        return "high"
    if any(f.get("severity") == "medium" for f in findings):
        return "medium"
    return "low"


@router.post("/review")
async def review(body: ReviewIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    texts = {
        "headline": body.headline,
        "primary_text": body.primary_text,
        "description": body.description,
        "cta": body.cta,
        "image_description": body.image_description,
    }
    findings = deterministic_scan(texts)
    ai_result = {}

    if body.use_ai and any(texts.values()):
        try:
            from services import llm
            prompt = "Revise este anúncio:\n" + json.dumps(
                {**texts, "landing_url": body.landing_url, "niche": body.niche},
                ensure_ascii=False)[:8000]
            text = await llm.complete_text(f"policy-{uuid.uuid4()}", POLICY_SYS, prompt)
            start, end = text.find("{"), text.rfind("}")
            if start != -1 and end != -1:
                ai_result = json.loads(text[start:end + 1])
        except Exception:
            ai_result = {"error": "Análise de IA indisponível — usando somente o scanner."}

    for f in ai_result.get("findings") or []:
        f["source"] = "ai"
        findings.append(f)

    risk = ai_result.get("risk_level") or _risk_from_findings(findings)
    # O scanner determinístico nunca deixa o risco cair abaixo do que ele achou
    scanner_risk = _risk_from_findings([f for f in findings if f.get("source") == "scanner"])
    order = {"low": 0, "medium": 1, "high": 2}
    if order.get(scanner_risk, 0) > order.get(risk, 0):
        risk = scanner_risk

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "input": {**texts, "landing_url": body.landing_url, "niche": body.niche},
        "findings": findings,
        "risk_level": risk,
        "block_publish": risk == "high",
        "special_categories": ai_result.get("special_categories") or [],
        "suggestions": ai_result.get("suggestions") or [],
        "summary_pt": ai_result.get("summary_pt")
            or ("Nenhum problema encontrado pelo scanner." if not findings
                else f"{len(findings)} apontamento(s) — risco {risk}."),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.policy_reviews.insert_one({**doc})
    doc.pop("user_id", None)
    await log_activity(db, user["id"], "policy_review",
                       f"Revisão de política: risco {risk}",
                       {"review_id": doc["id"], "risk": risk, "findings": len(findings)})
    return doc


@router.get("/reviews")
async def list_reviews(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.policy_reviews.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(30)
    return [d async for d in cur]
