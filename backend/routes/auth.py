"""Auth routes: register, login, me."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from services.db import get_db
from services.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from services.credits import add_credits

# Créditos de boas-vindas para novos usuários poderem testar a plataforma.
WELCOME_CREDITS = 100

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    created_at: str
    is_admin: bool = False


class AuthResponse(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"


def _is_admin(email: str) -> bool:
    import os as _os
    admin_env = (_os.environ.get("ADMIN_EMAILS") or "").lower()
    return email.lower() in [e.strip() for e in admin_env.split(",") if e.strip()]


def _serialize(u: dict) -> dict:
    return {
        "id": u["id"],
        "name": u["name"],
        "email": u["email"],
        "created_at": u["created_at"],
        "is_admin": _is_admin(u["email"]),
    }


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterIn, db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    if WELCOME_CREDITS > 0:
        await add_credits(db, user_id, WELCOME_CREDITS, "welcome_bonus",
                          "Créditos de boas-vindas")
    token = create_access_token(user_id, email)
    return AuthResponse(user=UserOut(**_serialize(doc)), access_token=token)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginIn, db: AsyncIOMotorDatabase = Depends(get_db)):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("disabled"):
        raise HTTPException(status_code=403, detail="Conta desativada pelo administrador.")
    token = create_access_token(user["id"], user["email"])
    return AuthResponse(user=UserOut(**_serialize(user)), access_token=token)


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**_serialize(user))



class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    full_user = await db.users.find_one({"id": user["id"]})
    if not full_user or not verify_password(body.current_password, full_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    new_hash = hash_password(body.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": new_hash}})
    return {"ok": True}


class ProfilePatch(BaseModel):
    phone: Optional[str] = None


@router.patch("/profile")
async def update_profile(body: ProfilePatch, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_db)):
    updates = {}
    if body.phone is not None:
        updates["phone"] = body.phone
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    return {"ok": True}
