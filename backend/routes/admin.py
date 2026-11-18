"""
Painel Administrativo — gestão de usuários/workspaces.

Cada usuário É um workspace isolado: todos os dados (hub, planos, memória,
atividade, CRM) ficam vinculados ao user_id dele. Aqui o admin enxerga o
panorama de cada workspace e pode ativar/desativar acessos.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from services.db import get_db
from services.security import require_admin, hash_password, create_access_token
from services.credits import add_credits, get_balance
from services.llm_usage import usage_by_resource
from services import llm

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ToggleActiveIn(BaseModel):
    disabled: bool


class CreateUserIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class EditUserFullIn(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    new_password: Optional[str] = None
    disabled: Optional[bool] = None
    plan_id: Optional[str] = None
    credit_adjustment: Optional[int] = None
    credit_reason: Optional[str] = None


class SendNotificationIn(BaseModel):
    user_ids: List[str]
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    urgency: str = "medium"


class CreditConfigIn(BaseModel):
    credit_value_brl: float = Field(ge=0.01)
    min_recharge_credits: int = Field(ge=1)


async def _workspace_stats(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    meta = await db.meta_settings.find_one({"user_id": user_id}, {"_id": 0, "ad_account_id": 1})
    profile = await db.agent_profile.find_one({"user_id": user_id}, {"_id": 0, "updated_at": 1, "approval_rate_pct": 1})
    last_activity = await db.user_activity.find_one(
        {"user_id": user_id}, {"_id": 0, "created_at": 1, "summary": 1}, sort=[("created_at", -1)])
    balance = await get_balance(db, user_id)
    sub = await db.user_subscriptions.find_one({"user_id": user_id, "status": "active"}, {"_id": 0})
    plan_name = None
    if sub:
        plan = await db.subscription_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0, "name": 1})
        plan_name = (plan or {}).get("name")
    return {
        "meta_connected": bool(meta),
        "ad_account_id": (meta or {}).get("ad_account_id"),
        "action_plans": await db.action_plans.count_documents({"user_id": user_id}),
        "pending_approvals": await db.action_plans.count_documents({"user_id": user_id, "status": "pending_approval"}),
        "decisions_ledger": await db.decision_ledger.count_documents({"user_id": user_id}),
        "memory_count": await db.strategy_memory.count_documents({"user_id": user_id}),
        "activity_count": await db.user_activity.count_documents({"user_id": user_id}),
        "rules_count": await db.automation_rules.count_documents({"user_id": user_id}),
        "products_count": await db.business_products.count_documents({"user_id": user_id}),
        "metrics_rows": await db.metrics_daily.count_documents({"user_id": user_id}),
        "profile_consolidated_at": (profile or {}).get("updated_at"),
        "approval_rate_pct": (profile or {}).get("approval_rate_pct"),
        "last_activity_at": (last_activity or {}).get("created_at"),
        "last_activity_summary": (last_activity or {}).get("summary"),
        "credit_balance": balance,
        "plan_name": plan_name,
        "plan_expires_at": (sub or {}).get("expires_at"),
    }


@router.get("/users")
async def list_users(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    users = []
    async for u in db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(500):
        stats = await _workspace_stats(db, u["id"])
        users.append({
            "id": u["id"],
            "name": u.get("name"),
            "email": u.get("email"),
            "created_at": u.get("created_at"),
            "disabled": bool(u.get("disabled")),
            **stats,
        })
    return users


@router.get("/users/{user_id}")
async def user_detail(user_id: str, admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    stats = await _workspace_stats(db, user_id)
    profile = await db.agent_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    activity = [d async for d in db.user_activity.find(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("created_at", -1).limit(30)]
    sub = await db.user_subscriptions.find_one({"user_id": user_id, "status": "active"}, {"_id": 0})
    sub_history = [s async for s in db.user_subscriptions.find(
        {"user_id": user_id}, {"_id": 0}).sort("started_at", -1).limit(20)]
    transactions = [t async for t in db.credit_transactions.find(
        {"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(30)]
    return {
        "user": u,
        "stats": stats,
        "agent_profile": profile,
        "recent_activity": activity,
        "subscription": sub,
        "subscription_history": sub_history,
        "recent_transactions": transactions,
    }


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(
    user_id: str,
    body: ToggleActiveIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Você não pode desativar a própria conta de admin")
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {"disabled": body.disabled,
                  "disabled_at": datetime.now(timezone.utc).isoformat() if body.disabled else None}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True, "user_id": user_id, "disabled": body.disabled}


@router.post("/users")
async def create_user(
    body: CreateUserIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await _log_admin_action(db, admin["id"], "create_user",
                            f"Criou o usuário {email}", {"target_user_id": user_id})
    return {"ok": True, "user_id": user_id}


@router.patch("/users/{user_id}")
async def edit_user_full(
    user_id: str,
    body: EditUserFullIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.email is not None:
        email = body.email.lower().strip()
        dup = await db.users.find_one({"email": email, "id": {"$ne": user_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Email já em uso por outro usuário")
        updates["email"] = email
    if body.new_password is not None and body.new_password:
        updates["password_hash"] = hash_password(body.new_password)
    if body.disabled is not None:
        updates["disabled"] = body.disabled
        if body.disabled:
            updates["disabled_at"] = datetime.now(timezone.utc).isoformat()

    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})

    if body.plan_id is not None:
        from datetime import timedelta
        plan = await db.subscription_plans.find_one({"id": body.plan_id}, {"_id": 0})
        if plan:
            now = datetime.now(timezone.utc).isoformat()
            expires = (datetime.now(timezone.utc) + timedelta(days=plan.get("duration_days", 30))).isoformat()
            await db.user_subscriptions.update_many(
                {"user_id": user_id, "status": "active"},
                {"$set": {"status": "replaced"}},
            )
            await db.user_subscriptions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "plan_id": body.plan_id,
                "status": "active",
                "credits_total": plan["credits"],
                "started_at": now,
                "expires_at": expires,
                "payment_id": "admin_assigned",
            })
            await add_credits(db, user_id, plan["credits"], "admin_adjustment",
                             f"Plano {plan['name']} atribuído pelo admin")

    if body.credit_adjustment is not None and body.credit_adjustment != 0:
        reason = body.credit_reason or "Ajuste manual pelo admin"
        await add_credits(db, user_id, body.credit_adjustment, "admin_adjustment", reason)

    changed = list(updates.keys())
    if body.plan_id:
        changed.append("plan")
    if body.credit_adjustment:
        changed.append(f"credits({body.credit_adjustment:+d})")
    await _log_admin_action(db, admin["id"], "edit_user",
                            f"Editou o usuário {user_id}", {"target_user_id": user_id, "fields": changed})
    return {"ok": True}


@router.post("/users/{user_id}/login-as")
async def login_as_user(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    token = create_access_token(user_id, target["email"])
    await _log_admin_action(db, admin["id"], "login_as",
                            f"Logou como o usuário {target['email']}", {"target_user_id": user_id})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Você não pode alterar seu próprio status de admin")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    admin_env = (os.environ.get("ADMIN_EMAILS") or "").lower()
    admin_list = [e.strip() for e in admin_env.split(",") if e.strip()]
    is_currently_admin = target["email"].lower() in admin_list
    return {
        "ok": True,
        "user_id": user_id,
        "is_admin": is_currently_admin,
        "note": "Para promover/remover admin, altere a variável ADMIN_EMAILS no .env do servidor e reinicie.",
    }


# ── Notifications (admin → user) ──────────────────────────────────
@router.post("/notifications/send")
async def send_notification(
    body: SendNotificationIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for uid in body.user_ids:
        docs.append({
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "title": body.title,
            "message": body.message,
            "urgency": body.urgency,
            "type": "admin",
            "read": False,
            "dismissed": False,
            "created_at": now,
        })
    if docs:
        await db.notifications.insert_many(docs)
    await _log_admin_action(db, admin["id"], "send_notification",
                            f"Enviou notificação para {len(body.user_ids)} usuário(s)",
                            {"title": body.title, "user_count": len(body.user_ids)})
    return {"ok": True, "sent": len(docs)}


# ── Credit config (global) ────────────────────────────────────────
@router.get("/credit-config")
async def get_credit_config(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    cfg = await db.platform_settings.find_one({"key": "credit_config"}, {"_id": 0})
    if not cfg:
        return {"credit_value_brl": 0.10, "min_recharge_credits": 10}
    return {"credit_value_brl": cfg.get("credit_value_brl", 0.10), "min_recharge_credits": cfg.get("min_recharge_credits", 10)}


@router.post("/credit-config")
async def set_credit_config(
    body: CreditConfigIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.platform_settings.update_one(
        {"key": "credit_config"},
        {"$set": {
            "key": "credit_config",
            **body.model_dump(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


# ── Audit log ─────────────────────────────────────────────────────
async def _log_admin_action(db, admin_id: str, action: str, summary: str, details: dict = None):
    await db.admin_audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "action": action,
        "summary": summary,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@router.get("/audit-log")
async def audit_log(
    limit: int = 50,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.admin_audit_log.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    logs = [d async for d in cursor]
    for log in logs:
        admin_user = await db.users.find_one({"id": log.get("admin_id")}, {"_id": 0, "name": 1, "email": 1})
        log["admin_name"] = (admin_user or {}).get("name", "—")
        log["admin_email"] = (admin_user or {}).get("email", "—")
    return logs


# ── LLM provider config ───────────────────────────────────────────
class LLMConfigIn(BaseModel):
    mode: str = "custom"
    base_url: str = "https://api.openai.com/v1"
    provider: str = "custom"
    api_key: str = ""
    custom_model: str = "gpt-4o-mini"
    custom_image_model: str = "gpt-image-1"


@router.get("/llm-config")
async def get_llm_config(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    return {**llm.get_config(), "providers": llm.PROVIDERS}


@router.post("/llm-config")
async def set_llm_config(
    body: LLMConfigIn,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cfg = body.model_dump()
    await db.platform_settings.update_one(
        {"key": "llm_config"},
        {"$set": {"key": "llm_config", **cfg, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    llm.apply_config(cfg)  # atualiza o cache em memória imediatamente
    await _log_admin_action(db, admin["id"], "llm_config", f"Atualizou LLM (modo={cfg.get('mode')})")
    return {"ok": True, "config": llm.get_config()}


# ── LLM token usage (média por recurso) ───────────────────────────
@router.get("/llm-usage")
async def llm_usage(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    rows = await usage_by_resource(db)
    # Enriquece com nome amigável do catálogo de recursos.
    names = {}
    async for r in db.resource_pricing.find({}, {"_id": 0, "resource_key": 1, "name": 1}):
        names[r["resource_key"]] = r.get("name")
    for row in rows:
        row["name"] = names.get(row["resource_key"], row["resource_key"])
    total = sum(r["total_tokens"] for r in rows)
    return {"rows": rows, "total_tokens": total, "resources": len(rows)}


@router.get("/overview")
async def overview(admin: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_db)):
    total_users = await db.users.count_documents({})
    disabled = await db.users.count_documents({"disabled": True})
    connected = await db.meta_settings.count_documents({"access_token_enc": {"$exists": True, "$ne": ""}})
    total_plans = await db.action_plans.count_documents({})
    total_decisions = await db.decision_ledger.count_documents({})
    return {
        "total_users": total_users,
        "active_users": total_users - disabled,
        "disabled_users": disabled,
        "meta_connected": connected,
        "total_action_plans": total_plans,
        "total_ledger_decisions": total_decisions,
    }
