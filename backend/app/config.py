"""Настройки платформы «Код Новороссии». Всё переопределяется переменными окружения."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", BASE_DIR / "media"))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
WEB_DIST = Path(os.getenv("WEB_DIST", BASE_DIR.parent / "web" / "dist"))

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'kod.db'}")
SECRET_KEY = os.getenv("SECRET_KEY", "kod-novorossii-dev-secret-change-me-in-production")
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "72"))
TIMEZONE = os.getenv("TZ_NAME", "Europe/Moscow")
# DEMO_MODE: показывает демо-аккаунты и текущие 2FA-коды на странице входа (для жюри). В проде — false.
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"
SITE_URL = os.getenv("SITE_URL", "http://localhost:8000")

# Опционально: LLM для чат-бота (любой OpenAI-совместимый API: GigaChat-прокси, YandexGPT-прокси, локальная модель)
LLM_API_URL = os.getenv("LLM_API_URL", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")

SERVICE_ROLES = {"curator", "moderator", "admin"}  # для них обязательна 2FA
ROLE_TITLES = {
    "user": "Пользователь",
    "owner": "Владелец бизнеса",
    "curator": "Куратор «одного окна»",
    "moderator": "Модератор",
    "admin": "Администратор",
}
REVIEW_COMPLAINT_SLA_HOURS = 24
VERIFICATION_SLA_WORKDAYS = 3
GEO_CHECKIN_RADIUS_M = 300
