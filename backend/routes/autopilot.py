"""Creative Autopilot — generate copies, headlines, CTAs, image prompts via Claude."""
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

router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])

AUTOPILOT_SYS = (
    "Você é um copywriter direto para Meta Ads. Sempre responda EM PORTUGUÊS DO BRASIL. "
    "Dado produto, oferta, público e tom, produza JSON ESTRITO com as chaves: "
    "headlines (5 opções curtas em pt-BR), primary_texts (5 corpos 100-150 chars em pt-BR), "
    "descriptions (5 uma-linha em pt-BR), ctas (3 CTAs da lista Meta: SHOP_NOW, LEARN_MORE, SIGN_UP etc), "
    "image_prompts (4 prompts detalhados EM INGLÊS para gerador de imagem: cena, estilo, mood, cores), "
    "video_scripts (2 roteiros curtos 15-30s em pt-BR com hook + corpo + CTA). "
    "Retorne APENAS JSON."
)


class GenerateIn(BaseModel):
    product: str
    offer: str = ""
    audience: str = ""
    tone: str = "direct"  # direct | inspirational | playful | premium | urgent
    language: str = "pt-BR"
    extra: str = ""


@router.post("/generate")
async def generate(body: GenerateIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    prompt = "Generate a creative package. Data:\n" + json.dumps(body.model_dump(), ensure_ascii=False)
    text = await llm.complete_text(f"autopilot-{uuid.uuid4()}", AUTOPILOT_SYS, prompt)
    start, end = text.find("{"), text.rfind("}")
    pack = {}
    if start != -1 and end != -1:
        try: pack = json.loads(text[start:end + 1])
        except Exception: pass
    pack_id = str(uuid.uuid4())
    await db.creative_packs.insert_one({
        "id": pack_id, "user_id": user["id"], "input": body.model_dump(),
        "pack": pack, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": pack_id, "pack": pack}


@router.get("/packs")
async def list_packs(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.creative_packs.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(50)
    return [d async for d in cur]


@router.delete("/packs/{pack_id}")
async def delete_pack(pack_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.creative_packs.delete_one({"id": pack_id, "user_id": user["id"]})
    return {"ok": True}



class GenerateImageIn(BaseModel):
    prompt: str


@router.post("/packs/{pack_id}/generate-image")
async def generate_image(pack_id: str, body: GenerateImageIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Gera uma imagem a partir do prompt, usando o modelo de imagem configurado no admin."""
    try:
        img = await llm.generate_image(body.prompt)
        if not img:
            raise HTTPException(status_code=400, detail="Nenhuma imagem gerada.")
        img_data = img["data"]
        mime = img.get("mime", "image/png")
        # Store in pack
        await db.creative_packs.update_one(
            {"id": pack_id, "user_id": user["id"]},
            {"$push": {"generated_images": {"prompt": body.prompt, "mime": mime, "data": img_data, "created_at": datetime.now(timezone.utc).isoformat()}}}
        )
        return {"ok": True, "image_base64": img_data[:50] + "...", "mime": mime, "full_data": img_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar imagem: {str(e)[:200]}")
