"""Интеграционные тесты API: python -m pytest -q (из папки backend)."""
import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DEMO_MODE"] = "true"

import pyotp
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


def login(c, email, secret=None):
    r = c.post("/api/auth/login", json={"email": email, "password": "demo123"}).json()
    if r.get("need_totp"):
        r = c.post("/api/auth/login", json={"email": email, "password": "demo123", "totp": pyotp.TOTP(secret).now()}).json()
    return {"Authorization": f"Bearer {r['token']}"}


ADMIN = ("admin@kod.ru", "JBSWY3DPEHPK3PXP")
MOD = ("moderator@kod.ru", "KRSXG5CTMVRXEZLU")
CUR = ("curator@kod.ru", "MFRGGZDFMZTWQ2LK")


def test_config_and_verticals(c):
    cfg = c.get("/api/config").json()
    slugs = [v["slug"] for v in cfg["verticals"]]
    assert {"tourism", "creative", "industry", "investment", "maritime"} <= set(slugs)


def test_search_morphology_typos_layout(c):
    assert c.get("/api/places", params={"q": "музеи"}).json()["total"] >= 3
    assert c.get("/api/places", params={"q": "тиатр"}).json()["total"] >= 1  # опечатка
    r = c.get("/api/places", params={"q": "veptq"}).json()  # раскладка: «музей»
    assert r["total"] >= 1 and r["hints"] == ["музей"]


def test_filters_and_sort(c):
    r = c.get("/api/places", params={"vertical": "creative", "label": "interns", "sort": "rating"}).json()
    assert all("interns" in p["labels"] for p in r["items"])
    r = c.get("/api/places", params={"lat": 48.008, "lng": 37.804, "sort": "distance", "limit": 5}).json()
    d = [p["distance_m"] for p in r["items"]]
    assert d == sorted(d)


def test_service_role_requires_2fa(c):
    r = c.post("/api/auth/login", json={"email": "admin@kod.ru", "password": "demo123"}).json()
    assert r.get("need_totp") is True
    bad = c.post("/api/auth/login", json={"email": "admin@kod.ru", "password": "demo123", "totp": "000000"})
    assert bad.status_code == 401


def test_reviews_owner_cannot_rate(c):
    owner = login(c, "owner@kod.ru")
    place = c.get("/api/places/restoran-na-pechi").json()
    r = c.post(f"/api/places/{place['id']}/reviews", json={"rating": 5, "text": "Мой лучший"}, headers=owner)
    assert r.status_code == 403
    user = login(c, "user@kod.ru")
    r = c.post(f"/api/places/{place['id']}/reviews", json={"rating": 4, "text": "Вкусно"}, headers=user)
    assert r.status_code == 200
    rid = r.json()["id"]
    assert c.patch(f"/api/reviews/{rid}", json={"rating": 5, "text": "Очень вкусно"}, headers=user).json()["rating"] == 5
    assert c.post(f"/api/owner/reviews/{rid}/reply", json={"text": "Спасибо!"}, headers=owner).json()["owner_reply"] == "Спасибо!"
    assert c.post(f"/api/reviews/{rid}/complaint", json={"reason": "тест"}).status_code == 200


def test_favorites_offline_sync(c):
    user = login(c, "user@kod.ru")
    ids = c.post("/api/me/favorites/sync", json={"ids": [1, 2, 3], "removed": []}, headers=user).json()["ids"]
    assert {1, 2, 3} <= set(ids)


def test_routes(c):
    r = c.get("/api/routes").json()
    assert any(x["title"] == "Креативный Донецк" for x in r)
    opt = c.post("/api/routes/optimize", json={"place_ids": [1, 5, 2, 13, 20]}).json()
    assert len(opt["stops"]) == 5 and opt["distance_km"] > 0
    gen = c.post("/api/routes/generate", json={"hours": 3, "interests": ["creative"]}).json()
    assert gen["duration_min"] <= 3 * 60 + 30


def test_invest_flow(c):
    m = c.post("/api/invest/match", json={"area_ha": 10, "power_mw": 5, "needs": ["railway"], "industry": "логистика"}).json()
    assert m[0]["score"] >= m[-1]["score"]
    user = login(c, "user@kod.ru")
    a = c.post("/api/invest/applications", json={"project": "Тестовый завод", "site_id": m[0]["site"]["id"]}, headers=user).json()
    cur = login(c, *CUR)
    upd = c.patch(f"/api/curator/applications/{a['id']}", json={"status": "in_review", "comment": "Взяли в работу"}, headers=cur).json()
    assert upd["status"] == "in_review" and len(upd["history"]) == 2


def test_admin_creates_vertical_without_release(c):
    adm = login(c, *ADMIN)
    v = c.post("/api/admin/r/verticals", json={"name": "Спортивный туризм", "color": "#16A34A", "icon": "bike"}, headers=adm).json()
    c.post("/api/admin/r/categories", json={"vertical_id": v["id"], "name": "Велодорожки",
                                           "fields": [{"key": "length_km", "label": "Длина", "type": "number"}]}, headers=adm)
    cfg = c.get("/api/config").json()
    assert any(x["name"] == "Спортивный туризм" for x in cfg["verticals"])


def test_moderator_cannot_manage_users(c):
    mod = login(c, *MOD)
    assert c.get("/api/admin/users", headers=mod).status_code == 403
    assert c.get("/api/admin/complaints", headers=mod).status_code == 200


def test_verification_flow(c):
    r = c.post("/api/auth/register", json={"email": "biz@test.ru", "password": "secret1", "name": "Бизнес"}).json()
    h = {"Authorization": f"Bearer {r['token']}"}
    vr = c.post("/api/owner/verification", json={"place_id": 15, "org_name": "ООО Тест", "doc_type": "ИНН",
                                                  "doc_number": "9301234567"}, headers=h).json()
    assert c.post(f"/api/owner/verification/{vr['id']}/confirm", json={"code": vr["demo_code"]}, headers=h).status_code == 200
    mod = login(c, *MOD)
    assert c.post(f"/api/admin/verifications/{vr['id']}", json={"action": "approve"}, headers=mod).status_code == 200
    me = c.get("/api/auth/me", headers=h).json()
    assert me["role"] == "owner" and me["owner_verified"]


def test_assistant_and_seo(c):
    r = c.post("/api/assistant/chat", json={"message": "где поесть"}).json()
    assert r["places"]
    r = c.post("/api/assistant/chat", json={"message": "маршрут на 2 часа"}).json()
    assert r["route"]
    assert "<urlset" in c.get("/sitemap.xml").text


def test_offline_bundle(c):
    b = c.get("/api/sync/bundle").json()
    assert len(b["places"]) > 30 and b["config"]["verticals"]
