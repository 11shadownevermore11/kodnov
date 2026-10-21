"""Аутентификация: PBKDF2-хэши, JWT, TOTP-2FA для служебных ролей, проверка ролей."""
import hashlib
import hmac
import os
import base64
from datetime import datetime, timedelta
from typing import Optional

import jwt
import pyotp
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import SECRET_KEY, TOKEN_TTL_HOURS, SERVICE_ROLES
from .db import get_db
from .models import User, AuditLog


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return "pbkdf2$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_b64, dk_b64 = stored.split("$")
        salt = base64.b64decode(salt_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


def create_token(user: User, scope: str = "full") -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "scope": scope,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_TTL_HOURS if scope == "full" else 1),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Сессия истекла, войдите снова")


def _token_from_request(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    token = _token_from_request(request)
    if not token:
        return None
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if data.get("scope") != "full":
        return None
    user = db.get(User, int(data["sub"]))
    if not user or user.blocked:
        return None
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _token_from_request(request)
    if not token:
        raise HTTPException(401, "Требуется вход в аккаунт")
    data = decode_token(token)
    if data.get("scope") != "full":
        raise HTTPException(401, "Завершите настройку двухфакторной защиты")
    user = db.get(User, int(data["sub"]))
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    if user.blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    return user


def get_setup_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Пользователь с временным токеном (scope=2fa_setup) — только для подключения 2FA."""
    token = _token_from_request(request)
    if not token:
        raise HTTPException(401, "Нет токена")
    data = decode_token(token)
    user = db.get(User, int(data["sub"]))
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return user


def require_roles(*roles: str):
    allowed = set(roles) | {"admin"}

    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "Недостаточно прав для этого действия")
        if user.role in SERVICE_ROLES and not user.totp_enabled:
            raise HTTPException(403, "Для служебных ролей обязательна двухфакторная защита")
        return user

    return dep


def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("owner", "admin", "moderator") or (user.role == "owner" and not user.owner_verified):
        raise HTTPException(403, "Раздел доступен верифицированным владельцам бизнеса")
    return user


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(user: User) -> str:
    return pyotp.TOTP(user.totp_secret).provisioning_uri(name=user.email, issuer_name="Код Новороссии")


def verify_totp(user: User, code: str) -> bool:
    if not user.totp_secret or not code:
        return False
    return pyotp.TOTP(user.totp_secret).verify(str(code).strip().replace(" ", ""), valid_window=1)


def audit(db: Session, user: Optional[User], action: str, entity: str = "", details: str = ""):
    db.add(AuditLog(user_id=user.id if user else None, user_name=user.name if user else "система",
                    action=action, entity=entity, details=details[:2000]))
