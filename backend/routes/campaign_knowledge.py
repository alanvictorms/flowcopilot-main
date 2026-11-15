"""
Base de conhecimento por campanha.

Cada campanha pode ter contexto próprio (texto, links, arquivos, imagens) para
o agente estudar e gerar conteúdo sem misturar coisas de campanhas distintas do
negócio. Fica vinculado a (user_id, campaign_id).
"""
import base64
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user, decode_token

router = APIRouter(prefix="/api/campaign-knowledge", tags=["campaign-knowledge"])

MAX_BYTES = 6 * 1024 * 1024  # 6 MB por arquivo


class KnowledgeIn(BaseModel):
    kind: str = Field(default="text")  # text | link | file | image
    title: str = ""
    content: str = ""                  # texto ou URL
    data_base64: str = ""              # para file/image (data URL ou base64 puro)
    filename: str = ""
    mime: str = ""


def _strip_data_url(raw: str) -> str:
    if "," in raw and raw.strip().startswith("data:"):
        return raw.split(",", 1)[1]
    return raw


@router.get("/{campaign_id}")
async def list_knowledge(
    campaign_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cur = db.campaign_knowledge.find(
        {"user_id": user["id"], "campaign_id": campaign_id},
        {"_id": 0, "data": 0},  # não devolve o binário na listagem
    ).sort("created_at", -1).limit(200)
    return [d async for d in cur]


@router.post("/{campaign_id}")
async def add_knowledge(
    campaign_id: str,
    body: KnowledgeIn,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "campaign_id": campaign_id,
        "kind": body.kind,
        "title": body.title.strip(),
        "content": body.content.strip(),
        "filename": body.filename.strip(),
        "mime": body.mime.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.kind in ("file", "image") and body.data_base64:
        raw = _strip_data_url(body.data_base64)
        try:
            raw_bytes = base64.b64decode(raw)
        except Exception:
            raise HTTPException(status_code=400, detail="Base64 inválido")
        if len(raw_bytes) > MAX_BYTES:
            raise HTTPException(status_code=400, detail="Arquivo muito grande (máx 6 MB).")
        doc["data"] = raw
        doc["size"] = len(raw_bytes)
    elif body.kind in ("text", "link") and not (body.content or body.title):
        raise HTTPException(status_code=400, detail="Informe o conteúdo.")
    await db.campaign_knowledge.insert_one({**doc})
    doc.pop("data", None)
    return doc


@router.delete("/{campaign_id}/{item_id}")
async def delete_knowledge(
    campaign_id: str,
    item_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.campaign_knowledge.delete_one(
        {"id": item_id, "user_id": user["id"], "campaign_id": campaign_id})
    return {"ok": True}


@router.get("/{campaign_id}/{item_id}/file")
async def get_knowledge_file(
    campaign_id: str,
    item_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Serve o binário (aceita token via header Bearer ou ?t= para uso em <img>/download)."""
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
    doc = await db.campaign_knowledge.find_one(
        {"id": item_id, "user_id": user_id, "campaign_id": campaign_id})
    if not doc or not doc.get("data"):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return Response(content=base64.b64decode(doc["data"]),
                    media_type=doc.get("mime") or "application/octet-stream")
