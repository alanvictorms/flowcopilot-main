"""
Business Intelligence Core (Camada 3 · item 22 do roadmap).

Armazena as informações estratégicas e financeiras do negócio: produtos e
ofertas (preço, custo, margem, impostos, comissão, LTV, CAC/CPL máximos,
estoque, capacidade), metas e calendário promocional.

O contexto compacto (`/context`) alimenta o Profit Autopilot, o chat da IA
e o Campaign Builder — decisões de marketing passam a conhecer o negócio.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from services.db import get_db
from services.security import get_current_user
from services.activity import log_activity

router = APIRouter(prefix="/api/business", tags=["business"])


class ProductIn(BaseModel):
    name: str
    kind: str = "product"            # product | service | offer
    price: float = 0.0               # preço de venda
    cost: float = 0.0                # custo do produto/serviço
    taxes_pct: float = 0.0           # impostos sobre a venda (%)
    commission_pct: float = 0.0      # comissão (%)
    avg_ticket: float = 0.0
    ltv: float = 0.0
    refund_rate_pct: float = 0.0
    max_cac: float = 0.0             # CAC máximo aceitável
    max_cpl: float = 0.0             # CPL máximo aceitável
    stock: Optional[int] = None      # None = não controla estoque
    daily_capacity: Optional[int] = None  # atendimento/entrega por dia
    regions: list[str] = Field(default_factory=list)
    campaign_ids: list[str] = Field(default_factory=list)  # campanhas ligadas a este produto
    notes: str = ""


class ProductOut(ProductIn):
    id: str
    margin_pct: float = 0.0
    unit_profit: float = 0.0
    created_at: str


class ProfileIn(BaseModel):
    company_name: str = ""
    segment: str = ""
    differentials: str = ""
    personas: str = ""
    common_objections: str = ""
    revenue_goal_month: float = 0.0
    profit_goal_month: float = 0.0
    communication_restrictions: str = ""
    promo_calendar: list[dict] = Field(default_factory=list)  # [{name, date, notes}]


def _enrich(doc: dict) -> dict:
    price = float(doc.get("price") or 0)
    cost = float(doc.get("cost") or 0)
    taxes = price * float(doc.get("taxes_pct") or 0) / 100.0
    commission = price * float(doc.get("commission_pct") or 0) / 100.0
    unit_profit = price - cost - taxes - commission
    doc["unit_profit"] = round(unit_profit, 2)
    doc["margin_pct"] = round(unit_profit / price * 100.0, 1) if price else 0.0
    return doc


# ------------------------------------------------------------- produtos ---

@router.get("/products", response_model=list[ProductOut])
async def list_products(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    cur = db.business_products.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1)
    return [_enrich(d) async for d in cur]


@router.post("/products", response_model=ProductOut)
async def create_product(body: ProductIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.business_products.insert_one({**doc})
    doc.pop("user_id", None)
    await log_activity(db, user["id"], "product_saved",
                       f"Cadastrou o produto '{doc.get('name')}'", {"product_id": doc["id"]})
    return _enrich(doc)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, body: ProductIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    res = await db.business_products.update_one(
        {"id": product_id, "user_id": user["id"]}, {"$set": body.model_dump()}
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    d = await db.business_products.find_one({"id": product_id}, {"_id": 0, "user_id": 0})
    return _enrich(d)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.business_products.delete_one({"id": product_id, "user_id": user["id"]})
    return {"ok": True}


# --------------------------------------------------------------- perfil ---

@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    d = await db.business_profile.find_one({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
    return d or ProfileIn().model_dump()


@router.put("/profile")
async def update_profile(body: ProfileIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = body.model_dump()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.business_profile.update_one(
        {"user_id": user["id"]}, {"$set": {**doc, "user_id": user["id"]}}, upsert=True
    )
    await log_activity(db, user["id"], "profile_saved", "Atualizou o perfil do negócio",
                       {"revenue_goal_month": doc.get("revenue_goal_month")})
    return doc


# -------------------------------------------------------------- contexto ---

@router.get("/context")
async def context(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    """Resumo compacto do negócio para injetar em prompts de IA e no Profit Autopilot."""
    profile = await db.business_profile.find_one({"user_id": user["id"]}, {"_id": 0, "user_id": 0}) or {}
    cur = db.business_products.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
    products = [_enrich(d) async for d in cur]
    return {
        "profile": profile,
        "products": [
            {k: p.get(k) for k in ("id", "name", "kind", "price", "unit_profit", "margin_pct",
                                    "ltv", "max_cac", "max_cpl", "stock", "daily_capacity",
                                    "campaign_ids")}
            for p in products
        ],
        "has_business_data": bool(profile or products),
    }
