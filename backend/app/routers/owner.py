"""Кабинет владельца бизнеса: верификация, управление карточкой, ответы на отзывы, расписание, статистика."""
import random
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..config import DEMO_MODE, VERIFICATION_SLA_WORKDAYS
from ..db import get_db
from ..models import (User, Place, Review, VerificationRequest, ExcursionSlot, Booking, PromoCode, Opportunity, Event,
                      AnalyticsEvent, Category, Vertical)
from ..search import rebuild_index
from ..security import get_current_user, require_owner, audit
from ..utils import place_full, row_dict, add_workdays, unique_slug, local_now
from .public import review_dict

router = APIRouter(prefix="/api/owner", tags=["owner"])


class VerificationIn(BaseModel):
    place_id: Optional[int] = None
    new_place: dict = {}
    org_name: str
    doc_type: str  # ЕГРЮЛ|ЕГРИП|ИНН
    doc_number: str
    doc_file: str = ""


@router.post("/verification")
def request_verification(data: VerificationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.doc_type not in ("ЕГРЮЛ", "ЕГРИП", "ИНН"):
        raise HTTPException(400, "Документ: ЕГРЮЛ, ЕГРИП или ИНН")
    digits = "".join(ch for ch in data.doc_number if ch.isdigit())
    if data.doc_type == "ИНН" and len(digits) not in (10, 12):
        raise HTTPException(400, "ИНН должен содержать 10 или 12 цифр")
    if data.doc_type in ("ЕГРЮЛ", "ЕГРИП") and len(digits) not in (13, 15):
        raise HTTPException(400, "ОГРН — 13 цифр, ОГРНИП — 15 цифр")
    if not data.place_id and not data.new_place.get("name"):
        raise HTTPException(400, "Выберите объект или укажите новый")
    code = f"{random.randint(0, 9999):04d}"
    vr = VerificationRequest(user_id=user.id, place_id=data.place_id, new_place=data.new_place, org_name=data.org_name,
                             doc_type=data.doc_type, doc_number=data.doc_number, doc_file=data.doc_file, contact_code=code,
                             deadline=add_workdays(datetime.utcnow(), VERIFICATION_SLA_WORKDAYS))
    db.add(vr)
    db.commit()
    contact = ""
    if data.place_id:
        p = db.get(Place, data.place_id)
        contact = p.phone or p.email if p else ""
    resp = {**row_dict(vr), "contact_code": None,
            "message": f"Код подтверждения отправлен на контакт из карточки {contact}".strip()}
    if DEMO_MODE:
        resp["demo_code"] = code  # в демо показываем код, в проде он уходит SMS/e-mail
    return resp


class CodeIn(BaseModel):
    code: str


@router.post("/verification/{vid}/confirm")
def confirm_contact(vid: int, data: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vr = db.get(VerificationRequest, vid)
    if not vr or vr.user_id != user.id:
        raise HTTPException(404)
    if vr.contact_code != data.code.strip():
        raise HTTPException(400, "Неверный код")
    vr.contact_confirmed = True
    db.commit()
    return {"ok": True}


@router.get("/verification")
def my_verifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{**row_dict(v), "contact_code": None} for v in
            db.query(VerificationRequest).filter_by(user_id=user.id).order_by(VerificationRequest.id.desc()).all()]


@router.get("/claimable")
def claimable(q: str = "", db: Session = Depends(get_db)):
    """Объекты без владельца — их можно «забрать» через верификацию."""
    query = db.query(Place).filter(Place.owner_id.is_(None), Place.moderation == "published")
    if q:
        query = query.filter(Place.name.ilike(f"%{q}%"))
    return [{"id": p.id, "name": p.name, "address": p.address} for p in query.order_by(Place.name).limit(30)]


def _my_place(db, user, pid) -> Place:
    p = db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category)).filter(Place.id == pid).first()
    if not p or (p.owner_id != user.id and user.role not in ("admin", "moderator")):
        raise HTTPException(404, "Объект не найден")
    return p


@router.get("/places")
def my_places(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    ps = db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category)).filter_by(owner_id=user.id).all()
    out = []
    for p in ps:
        d = place_full(p)
        d["unanswered"] = db.query(Review).filter(Review.place_id == p.id, Review.owner_reply == "").count()
        out.append(d)
    return out


OWNER_FIELDS = {"name", "short", "description", "address", "phone", "website", "email", "social", "hours", "photos",
                "tags", "price_level", "avg_check", "formats", "labels", "services", "portfolio", "attrs", "status",
                "accessible", "lat", "lng"}


@router.patch("/places/{pid}")
def update_place(pid: int, data: dict, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    p = _my_place(db, user, pid)
    for k, v in data.items():
        if k in OWNER_FIELDS:
            if k == "portfolio":
                for item in v or []:
                    if not item.get("rights_confirmed"):
                        raise HTTPException(400, f"Подтвердите права на материал «{item.get('title', '')}»")
            setattr(p, k, v)
    p.last_checked = local_now().date()
    audit(db, user, "owner_update_place", f"place:{p.id}", ", ".join(data.keys()))
    db.commit()
    rebuild_index(db)
    return place_full(p)


@router.post("/places")
def create_place(data: dict, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Новое предприятие от верифицированного владельца → на модерацию."""
    cat = db.get(Category, int(data.get("category_id") or 0))
    if not cat:
        raise HTTPException(400, "Выберите тип объекта")
    if not data.get("name") or data.get("lat") is None:
        raise HTTPException(400, "Укажите название и точку на карте")
    p = Place(slug=unique_slug(db, Place, data["name"]), vertical_id=cat.vertical_id, category_id=cat.id,
              owner_id=user.id, moderation="pending", lat=float(data["lat"]), lng=float(data["lng"]), name=data["name"])
    for k, v in data.items():
        if k in OWNER_FIELDS and k not in ("lat", "lng", "name"):
            setattr(p, k, v)
    db.add(p)
    audit(db, user, "owner_create_place", "place", data["name"])
    db.commit()
    return {"id": p.id, "slug": p.slug, "moderation": p.moderation}


class ReplyIn(BaseModel):
    text: str


@router.post("/reviews/{rid}/reply")
def reply_review(rid: int, data: ReplyIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    r = db.query(Review).options(joinedload(Review.user)).filter(Review.id == rid).first()
    if not r:
        raise HTTPException(404)
    _my_place(db, user, r.place_id)
    r.owner_reply = data.text.strip()[:2000]
    r.owner_reply_at = datetime.utcnow()
    db.commit()
    return review_dict(r)


@router.get("/reviews")
def owner_reviews(user: User = Depends(require_owner), db: Session = Depends(get_db)):
    ids = [p.id for p in db.query(Place).filter_by(owner_id=user.id)]
    rs = (db.query(Review).options(joinedload(Review.user)).filter(Review.place_id.in_(ids))
          .order_by(Review.created_at.desc()).all())
    names = {p.id: p.name for p in db.query(Place).filter(Place.id.in_(ids))}
    return [{**review_dict(r), "place_name": names.get(r.place_id)} for r in rs]


@router.get("/stats")
def owner_stats(place_id: Optional[int] = None, days: int = 30, user: User = Depends(require_owner),
                db: Session = Depends(get_db)):
    """Статистика по своим объектам: просмотры, избранное, маршруты, промокоды, записи."""
    ids = [p.id for p in db.query(Place).filter_by(owner_id=user.id)] if user.role == "owner" else \
        [p.id for p in db.query(Place)]
    if place_id:
        ids = [i for i in ids if i == place_id]
    since = datetime.utcnow() - timedelta(days=days)
    rows = (db.query(AnalyticsEvent.type, func.date(AnalyticsEvent.created_at), func.count(AnalyticsEvent.id))
            .filter(AnalyticsEvent.place_id.in_(ids), AnalyticsEvent.created_at >= since)
            .group_by(AnalyticsEvent.type, func.date(AnalyticsEvent.created_at)).all())
    series = {}
    totals = {}
    for t, day, cnt in rows:
        series.setdefault(str(day), {})[t] = cnt
        totals[t] = totals.get(t, 0) + cnt
    days_list = [(datetime.utcnow() - timedelta(days=i)).date().isoformat() for i in range(days - 1, -1, -1)]
    timeline = [{"date": d, **{k: series.get(d, {}).get(k, 0) for k in ("view", "favorite", "route_build", "share", "promo", "booking")}}
                for d in days_list]
    places = db.query(Place).filter(Place.id.in_(ids)).all()
    sources = dict(db.query(AnalyticsEvent.source, func.count(AnalyticsEvent.id)).filter(
        AnalyticsEvent.place_id.in_(ids), AnalyticsEvent.type == "view", AnalyticsEvent.created_at >= since)
                   .group_by(AnalyticsEvent.source).all())
    return {
        "totals": totals, "timeline": timeline, "sources": sources,
        "places": [{"id": p.id, "name": p.name, "views": p.views, "favorites": p.favorites_count, "rating": round(p.rating, 1),
                    "reviews": p.reviews_count, "route_builds": p.route_builds, "shares": p.shares} for p in places],
    }


# ---------- Экскурсии, промокоды, вакансии, события своего объекта ----------
class SlotIn(BaseModel):
    title: str = "Экскурсия"
    start: str
    duration_min: int = 60
    capacity: int = 15
    price: int = 0
    group_only: bool = False


@router.get("/places/{pid}/slots")
def place_slots(pid: int, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    _my_place(db, user, pid)
    out = []
    for s in db.query(ExcursionSlot).filter_by(place_id=pid).order_by(ExcursionSlot.start).all():
        d = row_dict(s)
        d["bookings"] = [row_dict(b) for b in db.query(Booking).filter_by(slot_id=s.id).all()]
        out.append(d)
    return out


@router.post("/places/{pid}/slots")
def add_slot(pid: int, data: SlotIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    _my_place(db, user, pid)
    s = ExcursionSlot(place_id=pid, title=data.title, start=datetime.fromisoformat(data.start), duration_min=data.duration_min,
                      capacity=data.capacity, price=data.price, group_only=data.group_only)
    db.add(s)
    db.commit()
    return row_dict(s)


@router.delete("/slots/{sid}")
def del_slot(sid: int, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    s = db.get(ExcursionSlot, sid)
    if not s:
        raise HTTPException(404)
    _my_place(db, user, s.place_id)
    db.query(Booking).filter_by(slot_id=sid).update({"status": "cancelled"})
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.post("/bookings/{bid}/{action}")
def booking_action(bid: int, action: str, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    b = db.get(Booking, bid)
    if not b or not b.place_id:
        raise HTTPException(404)
    _my_place(db, user, b.place_id)
    b.status = {"confirm": "confirmed", "reject": "cancelled"}.get(action, b.status)
    db.commit()
    return row_dict(b)


class PromoIn(BaseModel):
    code: str
    discount: int = 5
    description: str = "на весь ассортимент"
    valid_until: Optional[str] = None


@router.post("/places/{pid}/promo")
def set_promo(pid: int, data: PromoIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    _my_place(db, user, pid)
    if not 3 <= data.discount <= 5:
        raise HTTPException(400, "Скидка партнёра — от 3 до 5%")
    db.query(PromoCode).filter_by(place_id=pid).update({"active": False})
    pr = PromoCode(place_id=pid, code=data.code.upper().strip(), discount=data.discount, description=data.description,
                   valid_until=datetime.fromisoformat(data.valid_until).date() if data.valid_until else None)
    db.add(pr)
    db.commit()
    return row_dict(pr)


class OppIn(BaseModel):
    kind: str
    title: str
    description: str = ""
    format: str = "очно"
    salary: str = ""
    deadline: Optional[str] = None
    contact: str = ""


@router.post("/places/{pid}/opportunities")
def add_opportunity(pid: int, data: OppIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    p = _my_place(db, user, pid)
    o = Opportunity(place_id=pid, org=p.name, industry=p.category.name if p.category else "", kind=data.kind,
                    title=data.title, description=data.description, format=data.format, salary=data.salary,
                    deadline=datetime.fromisoformat(data.deadline).date() if data.deadline else None,
                    contact=data.contact or p.email or p.phone)
    db.add(o)
    db.commit()
    return row_dict(o)


class OwnerEventIn(BaseModel):
    title: str
    kind: str
    start: str
    end: Optional[str] = None
    description: str = ""
    price: int = 0
    registration: bool = False
    capacity: int = 0


@router.post("/places/{pid}/events")
def add_event(pid: int, data: OwnerEventIn, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    p = _my_place(db, user, pid)
    e = Event(slug=unique_slug(db, Event, data.title), title=data.title, kind=data.kind, place_id=p.id,
              vertical_id=p.vertical_id, start=datetime.fromisoformat(data.start),
              end=datetime.fromisoformat(data.end) if data.end else None, description=data.description,
              price=data.price, registration=data.registration, capacity=data.capacity, created_by=user.id,
              moderation="pending")
    db.add(e)
    db.commit()
    return {"id": e.id, "slug": e.slug, "moderation": "pending"}
