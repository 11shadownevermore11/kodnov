"""API авторизованного пользователя: отзывы, синхронизация избранного, личные маршруты, запись, заявки."""
import secrets
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..config import MEDIA_DIR, GEO_CHECKIN_RADIUS_M, DEMO_MODE
from ..db import get_db
from ..models import (User, Place, Favorite, Review, ReviewComplaint, Route, Booking, ExcursionSlot, Event, PromoCode,
                      PromoActivation, CheckIn, InvestApplication, InvestSite, FormSubmission, Vertical, HeritageStory,
                      ExpertNote, AnalyticsEvent)
from ..security import get_current_user, get_optional_user
from ..utils import place_brief, row_dict, haversine, unique_slug, build_timeline, local_now
from .public import review_dict, route_brief

router = APIRouter(prefix="/api", tags=["user"])


def _recalc_rating(db: Session, place_id: int):
    avg, cnt = db.query(func.avg(Review.rating), func.count(Review.id)).filter(
        Review.place_id == place_id, Review.status == "published").one()
    p = db.get(Place, place_id)
    p.rating = float(avg or 0)
    p.reviews_count = int(cnt or 0)


# ---------- Избранное ----------
@router.get("/me/favorites")
def my_favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    favs = db.query(Favorite).filter_by(user_id=user.id).order_by(Favorite.created_at.desc()).all()
    places = {p.id: p for p in db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
              .filter(Place.id.in_([f.place_id for f in favs])).all()}
    return [place_brief(places[f.place_id]) for f in favs if f.place_id in places]


class SyncIn(BaseModel):
    ids: list[int] = []  # локальное избранное с устройства
    removed: list[int] = []


@router.post("/me/favorites/sync")
def sync_favorites(data: SyncIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Слияние локального избранного (сделанного офлайн или гостем) с серверным."""
    existing = {f.place_id: f for f in db.query(Favorite).filter_by(user_id=user.id).all()}
    for pid in data.removed:
        if pid in existing:
            db.delete(existing.pop(pid))
            p = db.get(Place, pid)
            if p:
                p.favorites_count = max(0, p.favorites_count - 1)
    for pid in data.ids:
        if pid not in existing and db.get(Place, pid):
            db.add(Favorite(user_id=user.id, place_id=pid))
            db.get(Place, pid).favorites_count += 1
            existing[pid] = True
    db.commit()
    return {"ids": [f.place_id for f in db.query(Favorite).filter_by(user_id=user.id).all()]}


@router.post("/me/favorites/{place_id}")
def add_favorite(place_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.query(Favorite).filter_by(user_id=user.id, place_id=place_id).first():
        db.add(Favorite(user_id=user.id, place_id=place_id))
        p = db.get(Place, place_id)
        if p:
            p.favorites_count += 1
        db.add(AnalyticsEvent(type="favorite", place_id=place_id, user_id=user.id))
        db.commit()
    return {"ok": True}


@router.delete("/me/favorites/{place_id}")
def remove_favorite(place_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(Favorite).filter_by(user_id=user.id, place_id=place_id).first()
    if f:
        db.delete(f)
        p = db.get(Place, place_id)
        if p:
            p.favorites_count = max(0, p.favorites_count - 1)
        db.commit()
    return {"ok": True}


# ---------- Отзывы ----------
class ReviewIn(BaseModel):
    rating: int
    text: str = ""
    photos: list[str] = []


@router.post("/places/{place_id}/reviews")
def create_review(place_id: int, data: ReviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Place, place_id)
    if not p:
        raise HTTPException(404, "Объект не найден")
    if p.owner_id == user.id:
        raise HTTPException(403, "Владелец не может оценивать свой объект — но может ответить на отзывы")
    if not 1 <= data.rating <= 5:
        raise HTTPException(400, "Оценка — от 1 до 5")
    if db.query(Review).filter_by(place_id=place_id, user_id=user.id).first():
        raise HTTPException(400, "Вы уже оставили отзыв — его можно отредактировать")
    r = Review(place_id=place_id, user_id=user.id, rating=data.rating, text=data.text.strip()[:3000], photos=data.photos[:6])
    db.add(r)
    db.flush()
    _recalc_rating(db, place_id)
    db.commit()
    r = db.query(Review).options(joinedload(Review.user)).filter(Review.id == r.id).one()
    return review_dict(r)


@router.patch("/reviews/{rid}")
def edit_review(rid: int, data: ReviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Review, rid)
    if not r or r.user_id != user.id:
        raise HTTPException(404, "Отзыв не найден")
    r.rating = max(1, min(5, data.rating))
    r.text = data.text.strip()[:3000]
    r.photos = data.photos[:6]
    r.updated_at = datetime.utcnow()
    _recalc_rating(db, r.place_id)
    db.commit()
    return review_dict(r)


@router.delete("/reviews/{rid}")
def delete_review(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Review, rid)
    if not r or (r.user_id != user.id and user.role not in ("admin", "moderator")):
        raise HTTPException(404, "Отзыв не найден")
    pid = r.place_id
    db.query(ReviewComplaint).filter_by(review_id=rid).delete()
    db.delete(r)
    db.flush()
    _recalc_rating(db, pid)
    db.commit()
    return {"ok": True}


class ComplaintIn(BaseModel):
    reason: str


@router.post("/reviews/{rid}/complaint")
def complain_review(rid: int, data: ComplaintIn, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    if not db.get(Review, rid):
        raise HTTPException(404)
    db.add(ReviewComplaint(review_id=rid, user_id=user.id if user else None, reason=data.reason[:300]))
    db.commit()
    return {"ok": True, "message": "Жалоба отправлена. Модератор рассмотрит её в течение 24 часов."}


@router.get("/me/reviews")
def my_reviews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rs = db.query(Review).options(joinedload(Review.user)).filter_by(user_id=user.id).order_by(Review.created_at.desc()).all()
    places = {p.id: p for p in db.query(Place).filter(Place.id.in_([r.place_id for r in rs])).all()}
    return [{**review_dict(r), "place": {"slug": places[r.place_id].slug, "name": places[r.place_id].name}} for r in rs]


# ---------- Личные маршруты ----------
class MyRouteIn(BaseModel):
    title: str
    stops: list[dict]
    start_time: str = "10:00"
    transport: str = "walk"
    description: str = ""


@router.get("/me/routes")
def my_routes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [route_brief(r, db) for r in db.query(Route).filter_by(user_id=user.id).order_by(Route.id.desc()).all()]


@router.post("/me/routes")
def save_route(data: MyRouteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = Route(slug=unique_slug(db, Route, f"{data.title}-{secrets.token_hex(2)}"), title=data.title,
              description=data.description, is_curated=False, user_id=user.id, published=False,
              stops=[{k: s.get(k) for k in ("place_id", "stay_min", "kind", "pause_type", "note") if k in s} for s in data.stops],
              start_time=data.start_time, transport=data.transport, color="#1B4FA3", theme="personal")
    db.add(r)
    db.commit()
    return route_brief(r, db)


@router.delete("/me/routes/{rid}")
def delete_route(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Route, rid)
    if not r or r.user_id != user.id:
        raise HTTPException(404)
    db.delete(r)
    db.commit()
    return {"ok": True}


# ---------- Запись на экскурсии и события ----------
class BookingIn(BaseModel):
    slot_id: Optional[int] = None
    event_id: Optional[int] = None
    people: int = 1
    contact: str = ""
    comment: str = ""


@router.post("/bookings")
def create_booking(data: BookingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    people = max(1, min(50, data.people))
    place_id = None
    if data.slot_id:
        s = db.get(ExcursionSlot, data.slot_id)
        if not s:
            raise HTTPException(404, "Слот не найден")
        p = db.get(Place, s.place_id)
        gmin = int((p.attrs or {}).get("group_min") or 0)
        if s.group_only and people < max(gmin, 5):
            raise HTTPException(400, f"Экскурсия только для групп от {max(gmin, 5)} человек")
        if s.booked + people > s.capacity:
            raise HTTPException(400, f"Осталось мест: {s.capacity - s.booked}")
        s.booked += people
        place_id = s.place_id
        status = "pending" if (p.attrs or {}).get("access_status") == "по заявке" else "confirmed"
    elif data.event_id:
        e = db.get(Event, data.event_id)
        if not e:
            raise HTTPException(404, "Событие не найдено")
        if e.capacity and e.booked + people > e.capacity:
            raise HTTPException(400, f"Осталось мест: {e.capacity - e.booked}")
        e.booked += people
        place_id = e.place_id
        status = "confirmed"
    else:
        raise HTTPException(400, "Укажите экскурсию или событие")
    b = Booking(user_id=user.id, slot_id=data.slot_id, event_id=data.event_id, place_id=place_id, people=people,
                contact=data.contact or user.email, comment=data.comment, status=status)
    db.add(b)
    db.add(AnalyticsEvent(type="booking", place_id=place_id, user_id=user.id))
    db.commit()
    return {**row_dict(b), "message": "Заявка отправлена владельцу — ожидайте подтверждения" if status == "pending" else "Вы записаны!"}


@router.get("/me/bookings")
def my_bookings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = []
    for b in db.query(Booking).filter_by(user_id=user.id).order_by(Booking.created_at.desc()).all():
        d = row_dict(b)
        if b.slot_id:
            s = db.get(ExcursionSlot, b.slot_id)
            d["title"], d["start"] = s.title, s.start.isoformat()
        if b.event_id:
            e = db.get(Event, b.event_id)
            d["title"], d["start"], d["event_slug"] = e.title, e.start.isoformat(), e.slug
        if b.place_id:
            p = db.get(Place, b.place_id)
            d["place"] = {"slug": p.slug, "name": p.name, "address": p.address} if p else None
        out.append(d)
    return out


@router.delete("/me/bookings/{bid}")
def cancel_booking(bid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = db.get(Booking, bid)
    if not b or b.user_id != user.id:
        raise HTTPException(404)
    if b.status != "cancelled":
        b.status = "cancelled"
        if b.slot_id:
            s = db.get(ExcursionSlot, b.slot_id)
            s.booked = max(0, s.booked - b.people)
        if b.event_id:
            e = db.get(Event, b.event_id)
            e.booked = max(0, e.booked - b.people)
    db.commit()
    return {"ok": True}


# ---------- Промокоды ----------
@router.post("/promos/{pid}/activate")
def activate_promo(pid: int, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    pr = db.get(PromoCode, pid)
    if not pr or not pr.active:
        raise HTTPException(404, "Промокод не найден")
    pr.activations += 1
    db.add(PromoActivation(promo_id=pid, user_id=user.id if user else None))
    db.add(AnalyticsEvent(type="promo", place_id=pr.place_id, user_id=user.id if user else None))
    db.commit()
    token = secrets.token_hex(3).upper()
    return {"code": pr.code, "discount": pr.discount, "qr": f"KODNR:{pr.code}:{token}", "token": token}


# ---------- Паспорт путешественника ----------
ACHIEVEMENTS = [
    ("first", "Первый штамп", "Отметьтесь в любом месте", lambda s: s["total"] >= 1),
    ("explorer", "Исследователь", "5 мест", lambda s: s["total"] >= 5),
    ("creative", "Креативный Донецк", "3 места креативных индустрий", lambda s: s["by"].get("creative", 0) >= 3),
    ("classic", "Классика", "3 достопримечательности", lambda s: s["by"].get("tourism", 0) >= 3),
    ("industry", "Сделано в регионе", "Побывать на предприятии", lambda s: s["by"].get("industry", 0) >= 1),
    ("sea", "Морская душа", "Объект морского наследия", lambda s: s["by"].get("maritime", 0) >= 1),
    ("polymath", "Полимат", "Штампы в 4 вертикалях", lambda s: len(s["by"]) >= 4),
]


class CheckInIn(BaseModel):
    place_id: int
    lat: Optional[float] = None
    lng: Optional[float] = None
    demo: bool = False


@router.post("/checkins")
def checkin(data: CheckInIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Place, data.place_id)
    if not p:
        raise HTTPException(404)
    if not (DEMO_MODE and data.demo):
        if data.lat is None or data.lng is None:
            raise HTTPException(400, "Нужна геопозиция")
        dist = haversine(data.lat, data.lng, p.lat, p.lng)
        if dist > GEO_CHECKIN_RADIUS_M:
            raise HTTPException(400, f"Вы в {round(dist)} м от места. Подойдите ближе ({GEO_CHECKIN_RADIUS_M} м), чтобы получить штамп.")
    if not db.query(CheckIn).filter_by(user_id=user.id, place_id=p.id).first():
        db.add(CheckIn(user_id=user.id, place_id=p.id))
        db.commit()
    return passport(user, db)


@router.get("/me/passport")
def passport(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cs = db.query(CheckIn).filter_by(user_id=user.id).order_by(CheckIn.created_at).all()
    places = {p.id: p for p in db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
              .filter(Place.id.in_([c.place_id for c in cs])).all()}
    by = {}
    stamps = []
    for c in cs:
        p = places.get(c.place_id)
        if not p:
            continue
        by[p.vertical.slug] = by.get(p.vertical.slug, 0) + 1
        stamps.append({"at": c.created_at.isoformat(), "place": place_brief(p)})
    stats = {"total": len(stamps), "by": by}
    ach = [{"id": a, "title": t, "description": d, "done": f(stats)} for a, t, d, f in ACHIEVEMENTS]
    level = 1 + len(stamps) // 3
    return {"stamps": stamps, "achievements": ach, "level": level, "next_level_in": 3 - len(stamps) % 3, "by_vertical": by}


# ---------- Инвестор: единая заявка ----------
class ApplicationIn(BaseModel):
    site_id: Optional[int] = None
    project: str
    company: str = ""
    inn: str = ""
    industry: str = ""
    investment_mln: float = 0
    jobs: int = 0
    need_area_ha: float = 0
    need_power_mw: float = 0
    needs: list[str] = []
    support: list[str] = []
    contact: str = ""
    comment: str = ""


@router.post("/invest/applications")
def create_application(data: ApplicationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(data.project.strip()) < 3:
        raise HTTPException(400, "Укажите название проекта")
    curator_id = None
    if data.site_id:
        s = db.get(InvestSite, data.site_id)
        curator_id = s.curator_id if s else None
    if not curator_id:
        c = db.query(User).filter_by(role="curator").first()
        curator_id = c.id if c else None
    a = InvestApplication(user_id=user.id, curator_id=curator_id, **data.model_dump())
    a.history = [{"at": datetime.utcnow().isoformat(), "status": "new", "by": user.name, "comment": "Заявка подана"}]
    db.add(a)
    db.flush()
    a.number = f"ОО-{datetime.utcnow():%y%m}-{a.id:04d}"
    # инвестор — профиль пользователя: сохраняем реквизиты
    prof = dict(user.investor_profile or {})
    prof.update({"company": data.company, "inn": data.inn, "industry": data.industry})
    user.investor_profile = prof
    db.commit()
    return row_dict(a)


@router.get("/me/applications")
def my_applications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = []
    for a in db.query(InvestApplication).filter_by(user_id=user.id).order_by(InvestApplication.id.desc()).all():
        d = row_dict(a)
        if a.site_id:
            s = db.get(InvestSite, a.site_id)
            d["site"] = {"slug": s.slug, "name": s.name} if s else None
        if a.curator_id:
            c = db.get(User, a.curator_id)
            d["curator"] = {"name": c.name, "email": c.email} if c else None
        out.append(d)
    return out


class MessageIn(BaseModel):
    comment: str


@router.post("/invest/applications/{aid}/messages")
def application_message(aid: int, data: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(InvestApplication, aid)
    if not a or (a.user_id != user.id and user.role not in ("curator", "admin")):
        raise HTTPException(404)
    a.history = list(a.history or []) + [{"at": datetime.utcnow().isoformat(), "status": a.status, "by": user.name,
                                           "comment": data.comment[:2000]}]
    a.updated_at = datetime.utcnow()
    db.commit()
    return row_dict(a)


# ---------- Формы вертикалей ----------
class FormIn(BaseModel):
    data: dict
    place_id: Optional[int] = None


@router.post("/verticals/{slug}/submit")
def submit_form(slug: str, data: FormIn, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    v = db.query(Vertical).filter_by(slug=slug).first()
    if not v:
        raise HTTPException(404)
    for f in v.form_fields or []:
        if f.get("required") and not data.data.get(f["key"]):
            raise HTTPException(400, f"Заполните поле «{f['label']}»")
    db.add(FormSubmission(vertical_id=v.id, place_id=data.place_id, user_id=user.id if user else None, data=data.data))
    db.commit()
    return {"ok": True, "message": "Заявка отправлена"}


# ---------- Морское наследие: вклад жителей ----------
class StoryIn(BaseModel):
    title: str
    text: str
    place_id: Optional[int] = None
    period: str = ""
    photos: list[str] = []
    rights_confirmed: bool = False


@router.post("/heritage/stories")
def submit_story(data: StoryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.rights_confirmed:
        raise HTTPException(400, "Подтвердите, что вы автор материалов или имеете право их публиковать")
    s = HeritageStory(title=data.title, text=data.text, place_id=data.place_id, period=data.period, photos=data.photos,
                      author=user.name, author_kind="expert" if user.is_expert else "resident", user_id=user.id,
                      rights_confirmed=True, moderation="pending")
    db.add(s)
    db.commit()
    return {"ok": True, "message": "Спасибо! Материал опубликуют после проверки модератором."}


def _require_expert(user: User):
    if not (user.is_expert or user.role in ("admin", "moderator")):
        raise HTTPException(403, "Закрытое пространство экспертов")


@router.get("/heritage/expert")
def expert_space(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_expert(user)
    pending = db.query(HeritageStory).filter_by(moderation="pending").all()
    notes = db.query(ExpertNote).options(joinedload(ExpertNote.user)).order_by(ExpertNote.id.desc()).limit(100).all()
    return {"pending": [row_dict(s) for s in pending],
            "notes": [{**row_dict(n), "user_name": n.user.name} for n in notes]}


class NoteIn(BaseModel):
    text: str
    story_id: Optional[int] = None


@router.post("/heritage/expert/notes")
def expert_note(data: NoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_expert(user)
    db.add(ExpertNote(user_id=user.id, text=data.text, story_id=data.story_id))
    db.commit()
    return {"ok": True}


# ---------- Загрузка файлов ----------
ALLOWED = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".mp3", ".m4a"}


@router.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(400, "Недопустимый тип файла")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Файл больше 10 МБ")
    name = f"{uuid.uuid4().hex}{ext}"
    (MEDIA_DIR / name).write_bytes(content)
    return {"url": f"/media/{name}"}
