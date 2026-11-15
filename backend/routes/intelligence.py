"""Creative Market Intelligence — analyze competitors, extract patterns, generate concepts."""
import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user
from services import llm

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])

MARKET_SYS = (
    "Você é um analista de mídia paga mapeando estratégias de concorrentes. Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Para cada concorrente, analise URLs, textos e descrições fornecidas e produza JSON ESTRITO: "
    "{ competitors: [ { name, hooks: [], angles: [], formats: [], ctas: [], offers: [], strengths: [], weaknesses: [] } ], "
    "market_patterns: [ padrões que se repetem entre concorrentes ], "
    "underexplored_opportunities: [ ângulos/hooks/formatos ainda pouco usados ], "
    "original_concepts: [ { title, angle, hook, format, why_it_works } ] (5 conceitos ORIGINAIS, não cópias) }. "
    "Todo o conteúdo textual em pt-BR. Retorne APENAS JSON."
)


class Competitor(BaseModel):
    name: str
    urls: list[str] = []
    ad_examples: list[str] = []
    notes: str = ""


class AnalyzeIn(BaseModel):
    niche: str
    my_positioning: str = ""
    competitors: list[Competitor]


@router.post("/analyze")
async def analyze(body: AnalyzeIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    if not body.competitors:
        raise HTTPException(status_code=400, detail="Adicione ao menos 1 concorrente")
    prompt = "Analyze this market:\n" + json.dumps(body.model_dump(), ensure_ascii=False)[:10000]
    text = await llm.complete_text(f"intel-{uuid.uuid4()}", MARKET_SYS, prompt)
    start, end = text.find("{"), text.rfind("}")
    result = {}
    if start != -1 and end != -1:
        try: result = json.loads(text[start:end + 1])
        except Exception: pass
    report_id = str(uuid.uuid4())
    await db.market_reports.insert_one({
        "id": report_id, "user_id": user["id"], "input": body.model_dump(),
        "report": result, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": report_id, "report": result}


@router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.market_reports.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(30)
    return [d async for d in cur]


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.market_reports.delete_one({"id": report_id, "user_id": user["id"]})
    return {"ok": True}
