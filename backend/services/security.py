"""Auth: bcrypt hashing, JWT create/verify, Fernet encryption for Meta secrets."""
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from .db import get_db

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_DAYS = 7


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def _fernet() -> Fernet:
    return Fernet(os.environ["META_ENCRYPTION_KEY"].encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_TTL_DAYS),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])


def encrypt_str(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_str(value: str) -> str:
    if not value:
        return ""
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")


async def get_current_user(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    auth = request.headers.get("Authorization", "")
    token: Optional[str] = None
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("disabled"):
        raise HTTPException(status_code=403, detail="Conta desativada pelo administrador.")
    user.pop("_id", None)
    # Attach is_admin flag
    admin_env = (os.environ.get("ADMIN_EMAILS") or "").lower()
    admin_list = [e.strip() for e in admin_env.split(",") if e.strip()]
    user["is_admin"] = (user.get("email") or "").lower() in admin_list
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return user
