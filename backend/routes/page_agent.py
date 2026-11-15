"""
Page Agent (experimental) — integração opcional do agente que vive na página
(https://github.com/alibaba/page-agent). Roda 100% no browser e executa
navegação/tarefas por comando. O admin liga/desliga e configura o modelo.

Segurança: quando ligado, a config (inclui api_key) é entregue ao browser para
inicializar o agente. Isso expõe a chave no cliente — use uma chave dedicada de
teste. Para produção, o ideal é um proxy no backend (endpoint compatível-OpenAI).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from services.db import get_db
from services.security import get_current_user, require_admin

router = APIRouter(prefix="/api/page-agent", tags=["page-agent"])

SETTINGS_KEY = "page_agent"
DEFAULTS = {
    "enabled": False,
    "model": "",
    "base_url": "",
    "api_key": "",
    "language": "pt-BR",
    "use_demo": True,  # usa o script de demo (API grátis) quando não há chave própria
}


class PageAgentConfigIn(BaseModel):
    enabled: bool = False
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    language: str = "pt-BR"
    use_demo: bool = True


async def _get(db) -> dict:
    doc = await db.platform_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0})
    if not doc:
        return dict(DEFAULTS)
    return {**DEFAULTS, **{k: doc.get(k, DEFAULTS[k]) for k in DEFAULTS}}


@router.get("/config")
async def user_config(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Config para o browser inicializar o agente. Só entrega detalhes se ligado."""
    cfg = await _get(db)
    if not cfg.get("enabled"):
        return {"enabled": False}
    return {
        "enabled": True,
        "model": cfg.get("model") or "",
        "base_url": cfg.get("base_url") or "",
        "api_key": cfg.get("api_key") or "",
        "language": cfg.get("language") or "pt-BR",
        "use_demo": bool(cfg.get("use_demo")),
    }


@router.get("/admin/config")
async def admin_get(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    return await _get(db)


@router.post("/admin/config")
async def admin_set(
    body: PageAgentConfigIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.platform_settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": {"key": SETTINGS_KEY, **body.model_dump(),
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}
