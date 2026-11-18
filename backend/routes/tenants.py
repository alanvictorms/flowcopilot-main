"""
White label: agência = tenant (marca, cores, domínio próprio, cobrança por conta).

- GET  /api/branding                 público; resolve a marca pelo domínio acessado
- CRUD /api/admin/tenants            admin da plataforma
- GET/PUT /api/tenant/me             dono da agência edita a própria marca
- GET/POST /api/tenant/accounts      dono da agência gerencia contas de clientes
"""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from services.credits import add_credits
from services.db import get_db
from services.security import get_current_user, require_admin, hash_password

router = APIRouter(prefix="/api", tags=["tenants"])

DEFAULT_BRAND = {"tenant_id": None, "name": "FlowPilot", "logo": "/flowpilot-icon.png", "color": None}
MAX_LOGO = 400_000  # ~300 KB em data URL
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _host(raw: str) -> str:
    return (raw or "").split(",")[0].strip().lower().split(":")[0]


async def tenant_for_host(db, host: str):
    host = _host(host)
    return await db.tenants.find_one({"domain": host}, {"_id": 0}) if host else None


def request_host(request: Request) -> str:
    return request.headers.get("x-forwarded-host") or request.headers.get("host") or ""


def _brand(t: dict | None) -> dict:
    if not t:
        return dict(DEFAULT_BRAND)
    return {"tenant_id": t["id"], "name": t.get("name") or "FlowPilot",
            "logo": t.get("logo") or DEFAULT_BRAND["logo"], "color": t.get("color")}


def _check_brand(name, color, logo):
    if color and not HEX.match(color):
        raise HTTPException(status_code=400, detail="Cor inválida (use #RRGGBB)")
    if logo and (len(logo) > MAX_LOGO or not (logo.startswith("data:image/") or logo.startswith("https://"))):
        raise HTTPException(status_code=400, detail="Logo inválido ou maior que 300 KB")


@router.get("/branding")
async def branding(request: Request, host: str = "", tenant_id: str = "", db: AsyncIOMotorDatabase = Depends(get_db)):
    if tenant_id:
        return _brand(await db.tenants.find_one({"id": tenant_id}, {"_id": 0}))
    return _brand(await tenant_for_host(db, host or request_host(request)))


# ── Admin da plataforma ──────────────────────────────────────────
class TenantIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    domain: str = Field(default="", max_length=120)
    color: str = ""
    logo: str = ""
    owner_email: EmailStr | None = None
    license_fee: float = 15000
    price_per_account: float = 490


async def _set_owner(db, tenant_id: str, email):
    if not email:
        return
    u = await db.users.find_one({"email": email.lower().strip()})
    if not u:
        raise HTTPException(status_code=404, detail="Usuário dono não encontrado (cadastre-o antes)")
    await db.users.update_one({"id": u["id"]}, {"$set": {"tenant_id": tenant_id, "tenant_role": "owner"}})


async def _check_domain(db, domain: str, tenant_id: str = None):
    if not domain:
        return ""
    domain = _host(domain.replace("https://", "").replace("http://", "").split("/")[0])
    other = await db.tenants.find_one({"domain": domain, "id": {"$ne": tenant_id}})
    if other:
        raise HTTPException(status_code=400, detail="Domínio já usado por outra agência")
    return domain


@router.get("/admin/tenants")
async def list_tenants(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    out = []
    async for t in db.tenants.find({}, {"_id": 0, "logo": 0}).sort("created_at", -1):
        t["accounts"] = await db.users.count_documents({"tenant_id": t["id"], "tenant_role": {"$ne": "owner"}})
        t["monthly"] = round(t["accounts"] * (t.get("price_per_account") or 0), 2)
        owner = await db.users.find_one({"tenant_id": t["id"], "tenant_role": "owner"}, {"email": 1})
        t["owner_email"] = owner.get("email") if owner else None
        out.append(t)
    return out


@router.post("/admin/tenants")
async def create_tenant(body: TenantIn, admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    _check_brand(body.name, body.color, body.logo)
    doc = {
        "id": str(uuid.uuid4()), "name": body.name.strip(),
        "domain": await _check_domain(db, body.domain),
        "color": body.color, "logo": body.logo,
        "license_fee": body.license_fee, "price_per_account": body.price_per_account,
        "created_at": _now(),
    }
    await db.tenants.insert_one(dict(doc))
    await _set_owner(db, doc["id"], body.owner_email)
    doc.pop("logo")
    return doc


@router.patch("/admin/tenants/{tid}")
async def update_tenant(tid: str, body: TenantIn, admin: dict = Depends(require_admin),
                        db: AsyncIOMotorDatabase = Depends(get_db)):
    _check_brand(body.name, body.color, body.logo)
    upd = {"name": body.name.strip(), "domain": await _check_domain(db, body.domain, tid), "color": body.color,
           "license_fee": body.license_fee, "price_per_account": body.price_per_account}
    if body.logo:
        upd["logo"] = body.logo
    res = await db.tenants.update_one({"id": tid}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Agência não encontrada")
    await _set_owner(db, tid, body.owner_email)
    return {"ok": True}


@router.delete("/admin/tenants/{tid}")
async def delete_tenant(tid: str, admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.tenants.delete_one({"id": tid})
    await db.users.update_many({"tenant_id": tid}, {"$unset": {"tenant_id": "", "tenant_role": ""}})
    return {"ok": True}


# ── Dono da agência ──────────────────────────────────────────────
async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("tenant_id") or user.get("tenant_role") != "owner":
        raise HTTPException(status_code=403, detail="Acesso restrito ao dono da agência.")
    return user


@router.get("/tenant/me")
async def my_tenant(user: dict = Depends(require_owner), db: AsyncIOMotorDatabase = Depends(get_db)):
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Agência não encontrada")
    return t


class BrandIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    color: str = ""
    logo: str = ""


@router.put("/tenant/me")
async def update_my_tenant(body: BrandIn, user: dict = Depends(require_owner), db: AsyncIOMotorDatabase = Depends(get_db)):
    _check_brand(body.name, body.color, body.logo)
    upd = {"name": body.name.strip(), "color": body.color}
    if body.logo:
        upd["logo"] = body.logo
    await db.tenants.update_one({"id": user["tenant_id"]}, {"$set": upd})
    return {"ok": True}


@router.get("/tenant/accounts")
async def tenant_accounts(user: dict = Depends(require_owner), db: AsyncIOMotorDatabase = Depends(get_db)):
    out = []
    async for u in db.users.find({"tenant_id": user["tenant_id"], "tenant_role": {"$ne": "owner"}},
                                 {"_id": 0, "id": 1, "name": 1, "email": 1, "created_at": 1, "disabled": 1}):
        u["journeys"] = await db.journeys.count_documents({"user_id": u["id"]})
        u["leads"] = await db.leads.count_documents({"user_id": u["id"]})
        out.append(u)
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"price_per_account": 1})
    return {"accounts": out, "price_per_account": (t or {}).get("price_per_account", 0)}


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


@router.post("/tenant/accounts")
async def create_account(body: AccountIn, user: dict = Depends(require_owner), db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    uid = str(uuid.uuid4())
    await db.users.insert_one({
        "id": uid, "name": body.name.strip(), "email": email,
        "password_hash": hash_password(body.password), "created_at": _now(),
        "tenant_id": user["tenant_id"], "tenant_role": "client",
    })
    await add_credits(db, uid, 100, "welcome_bonus", "Créditos de boas-vindas")
    return {"ok": True, "id": uid}
