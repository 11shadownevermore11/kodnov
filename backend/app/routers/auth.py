from typing import Optional

import pyotp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import SERVICE_ROLES, DEMO_MODE, ROLE_TITLES
from ..db import get_db
from ..models import User, Favorite, Review, Booking, InvestApplication, CheckIn
from ..security import (hash_password, verify_password, create_token, get_current_user, get_setup_user,
                        new_totp_secret, totp_uri, verify_totp, audit)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: str
    password: str
    name: str


class LoginIn(BaseModel):
    email: str
    password: str
    totp: Optional[str] = None


class CodeIn(BaseModel):
    code: str


class MePatch(BaseModel):
    name: Optional[str] = None
    interests: Optional[list] = None
    investor_profile: Optional[dict] = None
    settings: Optional[dict] = None


def user_dict(u: User, db: Session | None = None) -> dict:
    d = {
        "id": u.id, "email": u.email, "name": u.name, "role": u.role, "role_title": ROLE_TITLES.get(u.role, u.role),
        "is_expert": u.is_expert, "owner_verified": u.owner_verified, "totp_enabled": u.totp_enabled,
        "interests": u.interests or [], "investor_profile": u.investor_profile or {}, "settings": u.settings or {},
        "is_service": u.role in SERVICE_ROLES, "created_at": u.created_at.isoformat(),
    }
    if db is not None:
        d["stats"] = {
            "favorites": db.query(Favorite).filter_by(user_id=u.id).count(),
            "reviews": db.query(Review).filter_by(user_id=u.id).count(),
            "bookings": db.query(Booking).filter_by(user_id=u.id).count(),
            "applications": db.query(InvestApplication).filter_by(user_id=u.id).count(),
            "stamps": db.query(CheckIn).filter_by(user_id=u.id).count(),
        }
    return d


@router.post("/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if "@" not in email or len(data.password) < 6:
        raise HTTPException(400, "Проверьте e-mail и пароль (минимум 6 символов)")
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(400, "Пользователь с таким e-mail уже зарегистрирован")
    u = User(email=email, name=data.name.strip() or email.split("@")[0], password_hash=hash_password(data.password))
    db.add(u)
    db.commit()
    return {"token": create_token(u), "user": user_dict(u)}


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=data.email.strip().lower()).first()
    if not u or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Неверный e-mail или пароль")
    if u.blocked:
        raise HTTPException(403, "Аккаунт заблокирован")
    if u.role in SERVICE_ROLES:
        if not u.totp_enabled:
            # служебная роль без 2FA → обязательная настройка
            return {"need_totp_setup": True, "setup_token": create_token(u, scope="2fa_setup")}
        if not data.totp:
            return {"need_totp": True}
        if not verify_totp(u, data.totp):
            raise HTTPException(401, "Неверный код двухфакторной защиты")
    audit(db, u, "login", "user", u.email)
    db.commit()
    return {"token": create_token(u), "user": user_dict(u)}


@router.post("/2fa/setup")
def totp_setup(user: User = Depends(get_setup_user), db: Session = Depends(get_db)):
    if not user.totp_secret or not user.totp_enabled:
        user.totp_secret = new_totp_secret()
        db.commit()
    return {"secret": user.totp_secret, "otpauth_uri": totp_uri(user)}


@router.post("/2fa/enable")
def totp_enable(data: CodeIn, user: User = Depends(get_setup_user), db: Session = Depends(get_db)):
    if not verify_totp(user, data.code):
        raise HTTPException(400, "Код не подошёл — проверьте время на телефоне")
    user.totp_enabled = True
    audit(db, user, "2fa_enabled", "user", user.email)
    db.commit()
    return {"token": create_token(user), "user": user_dict(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_dict(user, db)


@router.patch("/me")
def update_me(data: MePatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit()
    return user_dict(user, db)


@router.get("/demo-accounts")
def demo_accounts(db: Session = Depends(get_db)):
    """Только в DEMO_MODE: демо-доступы и текущие TOTP-коды, чтобы жюри могло войти под любой ролью."""
    if not DEMO_MODE:
        raise HTTPException(404)
    out = []
    for email in ["admin@kod.ru", "moderator@kod.ru", "curator@kod.ru", "owner@kod.ru", "user@kod.ru",
                  "expert@kod.ru"]:
        u = db.query(User).filter_by(email=email).first()
        if not u:
            continue
        out.append({"email": u.email, "password": "demo123", "role": u.role, "role_title": ROLE_TITLES[u.role],
                    "name": u.name,
                    "totp": pyotp.TOTP(u.totp_secret).now() if u.totp_enabled and u.totp_secret else None})
    return out
