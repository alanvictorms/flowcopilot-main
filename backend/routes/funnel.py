"""Funnel Doctor — analyze funnel stages, find bottleneck, prescribe fix."""
import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services.llm_usage import record_usage
from services.credits import charge_resource
from services import llm

router = APIRouter(prefix="/api/funnel", tags=["funnel"])

DOCTOR_SYS = (
    "Você é um médico de funil de mídia paga. Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Dado números de estágios do funil, identifique o estágio mais fraco, "
    "explique causa provável (criativo, targeting, landing page, oferta, atrito de formulário, atendimento/vendas) "
    "e proponha 3 correções concretas priorizadas por impacto. Retorne JSON ESTRITO: "
    "{ diagnosis: string em pt-BR, weakest_stage: string, likely_causes: [strings em pt-BR], fixes: [ { action em pt-BR, why em pt-BR, priority } ], "
    "benchmarks: { stage: {name, your_rate, healthy_range} } }. Retorne APENAS JSON."
)


class FunnelIn(BaseModel):
    impressions: int
    clicks: int
    landing_page_views: int = 0
    leads: int = 0
    qualified_leads: int = 0
    sales: int = 0
    revenue: float = 0
    spend: float = 0
    notes: str = ""


def rate(a, b):
    return round(a / b * 100, 2) if b else 0.0


@router.post("/diagnose")
async def diagnose(body: FunnelIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await charge_resource(db, user["id"], "funnel_analysis", "Diagnóstico de funil")
    stages = {
        "impression_to_click": rate(body.clicks, body.impressions),
        "click_to_lpv": rate(body.landing_page_views, body.clicks) if body.landing_page_views else None,
        "lpv_to_lead": rate(body.leads, body.landing_page_views or body.clicks),
        "lead_to_qualified": rate(body.qualified_leads, body.leads),
        "qualified_to_sale": rate(body.sales, body.qualified_leads),
        "click_to_sale": rate(body.sales, body.clicks),
    }
    cpl = body.spend / body.leads if body.leads else 0
    cpq = body.spend / body.qualified_leads if body.qualified_leads else 0
    cps = body.spend / body.sales if body.sales else 0
    roas = body.revenue / body.spend if body.spend else 0

    ctx = {
        "inputs": body.model_dump(),
        "stage_rates_pct": stages,
        "unit_economics": {"cpl": round(cpl, 2), "cpq": round(cpq, 2), "cps": round(cps, 2), "roas": round(roas, 2)},
    }
    prompt = "Diagnose this funnel:\n" + json.dumps(ctx, ensure_ascii=False)
    text = await llm.complete_text(f"funnel-{uuid.uuid4()}", DOCTOR_SYS, prompt)
    await record_usage(db, "funnel_analysis", user_id=user["id"],
                       input_text=prompt, output_text=text, model=llm.current_model())
    start, end = text.find("{"), text.rfind("}")
    result = {}
    if start != -1 and end != -1:
        try: result = json.loads(text[start:end + 1])
        except Exception: pass
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "input": body.model_dump(),
        "stages": stages,
        "unit_economics": ctx["unit_economics"],
        "diagnosis": result,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.funnel_diagnostics.insert_one({**doc})
    doc.pop("user_id", None)
    return doc


@router.get("/history")
async def history(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.funnel_diagnostics.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(20)
    return [d async for d in cur]
