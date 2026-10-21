"""Публичное API: доступно гостю. Общее для сайта и мобильного приложения."""
import hashlib
import json
from datetime import datetime, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..models import (Place, Vertical, Category, Review, Event, Route, Opportunity, HeritageStory, PromoCode,
                      InvestSite, ExcursionSlot, InaccuracyReport, CopyrightComplaint, AnalyticsEvent, User)
from ..queries import find_places
from ..routes_engine import optimize, generate
from ..security import get_optional_user
from ..utils import place_full, place_brief, event_dict, row_dict, build_timeline, local_now, haversine
from ..content import INFO_SECTIONS, EVENT_KINDS, OPPORTUNITY_KINDS, PLACE_STATUSES, FORMATS, LABELS, PRICE_LEVELS
from .. import photos

router = APIRouter(prefix="/api", tags=["public"])


def vertical_dict(v: Vertical, counts=None) -> dict:
    return {
        "id": v.id, "slug": v.slug, "name": v.name, "short": v.short, "description": v.description, "icon": v.icon,
        "color": v.color, "stage": v.stage, "is_professional": v.is_professional, "enabled": v.enabled,
        "map_layer": v.map_layer, "sort": v.sort, "form_title": v.form_title, "form_fields": v.form_fields or [],
        "count": (counts or {}).get(v.id, 0), "photo": photos.first("directions", v.slug),
        "categories": [{"id": c.id, "slug": c.slug, "name": c.name, "icon": c.icon, "fields": c.fields or [],
                        "default_stay_min": c.default_stay_min} for c in v.categories],
    }


def config_payload(db: Session) -> dict:
    verts = db.query(Vertical).options(joinedload(Vertical.categories)).filter(Vertical.enabled.is_(True)).order_by(
        Vertical.sort).all()
    counts = dict(db.query(Place.vertical_id, func.count(Place.id)).filter(Place.moderation == "published").group_by(
        Place.vertical_id).all())
    data = {
        "app": {"name": "Код Новороссии", "tagline": "Гид по ДНР: туризм, креативные индустрии и инвестиции",
                "region_center": [48.0080, 37.8040], "zoom": 12},
        "verticals": [vertical_dict(v, counts) for v in verts],
        "photos": photos.site_photos(),
        "dictionaries": {"event_kinds": EVENT_KINDS, "opportunity_kinds": OPPORTUNITY_KINDS,
                         "place_statuses": PLACE_STATUSES, "formats": FORMATS, "labels": LABELS,
                         "price_levels": PRICE_LEVELS},
    }
    data["version"] = hashlib.md5(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:10]
    return data


@router.get("/config")
def config(db: Session = Depends(get_db)):
    """Конфигурация вертикалей: клиенты строят слои карты, фильтры и формы из неё — без выпуска новой версии."""
    return config_payload(db)


@router.get("/stats/public")
def public_stats(db: Session = Depends(get_db)):
    return {
        "places": db.query(Place).filter(Place.moderation == "published").count(),
        "events": db.query(Event).filter(Event.start >= local_now() - timedelta(days=1)).count(),
        "routes": db.query(Route).filter(Route.is_curated.is_(True)).count(),
        "sites": db.query(InvestSite).filter(InvestSite.published.is_(True)).count(),
        "reviews": db.query(Review).filter(Review.status == "published").count(),
        "promos": db.query(PromoCode).filter(PromoCode.active.is_(True)).count(),
        "made_in_region": db.query(Place).filter(Place.made_in_region.is_(True)).count(),
    }


@router.get("/places")
def list_places(request: Request, q: Optional[str] = None, vertical: Optional[str] = None,
                category: Optional[str] = None, min_rating: Optional[float] = None, open_now: bool = False,
                price_max: Optional[int] = None, formats: Optional[str] = None,
                made_in_region: bool = False, accessible: bool = False, label: Optional[str] = None,
                lat: Optional[float] = None, lng: Optional[float] = None, radius_m: Optional[float] = None,
                sort: str = "relevance", bbox: Optional[str] = None, city: Optional[str] = None,
                limit: int = 60, offset: int = 0, db: Session = Depends(get_db)):
    attrs = {k[5:]: v for k, v in request.query_params.items() if k.startswith("attr_")}
    res = find_places(db, q=q, vertical=vertical, category=category, min_rating=min_rating, open_now=open_now,
                      price_max=price_max, formats=formats, made_in_region=made_in_region, accessible=accessible,
                      label=label, lat=lat, lng=lng, radius_m=radius_m, sort=sort, attrs=attrs, bbox=bbox, city=city,
                      limit=limit, offset=offset)
    if q:
        db.add(AnalyticsEvent(type="search", meta={"q": q[:100], "results": res["total"]},
                              source=request.headers.get("X-Client", "web")))
        db.commit()
    return res


@router.get("/places/map")
def places_map(db: Session = Depends(get_db)):
    """Лёгкий список всех меток для карты (кластеризация на клиенте)."""
    rows = (db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
            .join(Vertical, Place.vertical_id == Vertical.id)
            .filter(Place.moderation == "published", Vertical.enabled.is_(True), Vertical.map_layer.is_(True)).all())
    return [{"id": p.id, "slug": p.slug, "name": p.name, "lat": p.lat, "lng": p.lng, "v": p.vertical.slug,
             "c": p.category.name if p.category else "", "r": round(p.rating, 1), "s": p.status} for p in rows]


@router.get("/search/suggest")
def suggest(q: str, db: Session = Depends(get_db)):
    res = find_places(db, q=q, limit=6)
    cats = db.query(Category).all()
    ql = q.lower().strip()
    cat_hits = [{"slug": c.slug, "name": c.name, "vertical_id": c.vertical_id} for c in cats if ql and ql[:4] in c.name.lower()][:3]
    events = db.query(Event).filter(Event.title.ilike(f"%{q}%"), Event.start >= local_now() - timedelta(days=1)).limit(3).all()
    return {"places": res["items"], "categories": cat_hits, "hints": res["hints"],
            "events": [{"slug": e.slug, "title": e.title, "start": e.start.isoformat()} for e in events]}


def _get_place(db, key: str) -> Place:
    q = db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
    p = q.filter(Place.id == int(key)).first() if key.isdigit() else q.filter(Place.slug == key).first()
    if not p:
        raise HTTPException(404, "Объект не найден")
    return p


@router.get("/places/{key}")
def get_place(key: str, request: Request, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    p = _get_place(db, key)
    if p.moderation != "published" and not (user and (user.id == p.owner_id or user.role in ("admin", "moderator"))):
        raise HTTPException(404, "Объект на модерации")
    p.views += 1
    db.add(AnalyticsEvent(type="view", place_id=p.id, user_id=user.id if user else None,
                          source=request.headers.get("X-Client", "web")))
    db.commit()
    d = place_full(p)
    reviews = (db.query(Review).options(joinedload(Review.user))
               .filter(Review.place_id == p.id, Review.status == "published").order_by(Review.created_at.desc()).all())
    dist = {i: 0 for i in range(1, 6)}
    for r in reviews:
        dist[r.rating] += 1
    d["reviews"] = [review_dict(r) for r in reviews[:30]]
    d["rating_distribution"] = dist
    d["promos"] = [row_dict(x) for x in db.query(PromoCode).filter_by(place_id=p.id, active=True).all()]
    d["slots"] = [row_dict(s) for s in db.query(ExcursionSlot).filter(ExcursionSlot.place_id == p.id,
                                                                       ExcursionSlot.start >= local_now()).order_by(ExcursionSlot.start).limit(12)]
    d["opportunities"] = [row_dict(o) for o in db.query(Opportunity).filter_by(place_id=p.id, moderation="published")]
    d["stories"] = [row_dict(s) for s in db.query(HeritageStory).filter_by(place_id=p.id, moderation="published")]
    d["events"] = [event_dict(e) for e in db.query(Event).filter(Event.place_id == p.id, Event.moderation == "published",
                                                                 Event.start >= local_now() - timedelta(hours=6)).order_by(Event.start).limit(6)]
    near = (db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
            .filter(Place.id != p.id, Place.moderation == "published",
                    Place.lat.between(p.lat - 0.02, p.lat + 0.02), Place.lng.between(p.lng - 0.03, p.lng + 0.03)).all())
    near.sort(key=lambda x: haversine(p.lat, p.lng, x.lat, x.lng))
    d["nearby"] = [place_brief(x, p.lat, p.lng) for x in near[:6]]
    d["is_owner"] = bool(user and user.id == p.owner_id)
    d["my_review"] = None
    if user:
        mine = next((r for r in reviews if r.user_id == user.id), None)
        d["my_review"] = review_dict(mine) if mine else None
    return d


def review_dict(r: Review) -> dict:
    return {"id": r.id, "place_id": r.place_id, "user_id": r.user_id, "user_name": r.user.name if r.user else "Гость",
            "rating": r.rating, "text": r.text, "photos": r.photos or [], "status": r.status,
            "owner_reply": r.owner_reply, "owner_reply_at": r.owner_reply_at.isoformat() if r.owner_reply_at else None,
            "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat() if r.updated_at else None}


@router.get("/places/{key}/reviews")
def place_reviews(key: str, db: Session = Depends(get_db)):
    p = _get_place(db, key)
    rs = (db.query(Review).options(joinedload(Review.user)).filter(Review.place_id == p.id, Review.status == "published")
          .order_by(Review.created_at.desc()).all())
    return [review_dict(r) for r in rs]


class ReportIn(BaseModel):
    field: str = "other"
    message: str
    contact: str = ""


@router.post("/places/{key}/report")
def report_inaccuracy(key: str, data: ReportIn, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    p = _get_place(db, key)
    if len(data.message.strip()) < 3:
        raise HTTPException(400, "Опишите неточность")
    db.add(InaccuracyReport(place_id=p.id, user_id=user.id if user else None, field=data.field, message=data.message,
                            contact=data.contact))
    db.commit()
    return {"ok": True, "message": "Спасибо! Модератор проверит информацию."}


class CopyrightIn(BaseModel):
    place_id: Optional[int] = None
    material: str
    claimant_name: str
    claimant_contact: str
    proof: str = ""
    description: str = ""


@router.post("/copyright")
def copyright_complaint(data: CopyrightIn, db: Session = Depends(get_db)):
    db.add(CopyrightComplaint(**data.model_dump()))
    db.commit()
    return {"ok": True, "message": "Жалоба зарегистрирована. Срок рассмотрения — до 3 рабочих дней; на время проверки материал может быть скрыт."}


class EventIn(BaseModel):
    type: str
    place_id: Optional[int] = None
    meta: dict = {}


@router.post("/analytics/event")
def track(data: EventIn, request: Request, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    if data.type not in ("share", "route_build", "call", "site", "promo_view", "audio"):
        raise HTTPException(400, "unknown event")
    if data.place_id:
        p = db.get(Place, data.place_id)
        if p:
            if data.type == "share":
                p.shares += 1
            if data.type == "route_build":
                p.route_builds += 1
    db.add(AnalyticsEvent(type=data.type, place_id=data.place_id, user_id=user.id if user else None, meta=data.meta,
                          source=request.headers.get("X-Client", "web")))
    db.commit()
    return {"ok": True}


# ---------- Вертикали ----------
@router.get("/verticals/{slug}")
def get_vertical(slug: str, db: Session = Depends(get_db)):
    v = db.query(Vertical).options(joinedload(Vertical.categories)).filter_by(slug=slug, enabled=True).first()
    if not v:
        raise HTTPException(404, "Вертикаль не найдена")
    d = vertical_dict(v)
    res = find_places(db, vertical=slug, sort="popularity", limit=200)
    d["places"] = res["items"]
    d["count"] = res["total"]
    d["events"] = [event_dict(e) for e in db.query(Event).filter(Event.vertical_id == v.id, Event.moderation == "published",
                                                                 Event.start >= local_now() - timedelta(hours=6)).order_by(Event.start).limit(8)]
    place_ids = [p["id"] for p in res["items"]]
    d["opportunities"] = [row_dict(o) for o in db.query(Opportunity).filter(Opportunity.place_id.in_(place_ids),
                                                                            Opportunity.moderation == "published").limit(12)] if place_ids else []
    d["routes"] = [route_brief(r, db) for r in db.query(Route).filter(Route.is_curated.is_(True), Route.published.is_(True)).all()
                   if r.theme == slug]
    return d


# ---------- События ----------
@router.get("/events")
def list_events(date_from: Optional[str] = None, date_to: Optional[str] = None, kind: Optional[str] = None,
                vertical: Optional[str] = None, q: Optional[str] = None, free: bool = False,
                db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.moderation == "published")
    start = datetime.fromisoformat(date_from) if date_from else local_now() - timedelta(hours=6)
    query = query.filter((Event.end >= start) | ((Event.end.is_(None)) & (Event.start >= start)))
    if date_to:
        query = query.filter(Event.start <= datetime.fromisoformat(date_to) + timedelta(days=1))
    if kind:
        query = query.filter(Event.kind.in_(kind.split(",")))
    if free:
        query = query.filter(Event.price == 0)
    if q:
        query = query.filter(Event.title.ilike(f"%{q}%") | Event.description.ilike(f"%{q}%"))
    events = query.order_by(Event.start).all()
    places = {p.id: p for p in db.query(Place).filter(Place.id.in_([e.place_id for e in events if e.place_id])).all()}
    verts = {v.id: v for v in db.query(Vertical).all()}
    if vertical:
        vs = vertical.split(",")
        events = [e for e in events if e.vertical_id and verts.get(e.vertical_id) and verts[e.vertical_id].slug in vs]
    return [event_dict(e, places.get(e.place_id), verts.get(e.vertical_id)) for e in events]


@router.get("/events/{slug}")
def get_event(slug: str, db: Session = Depends(get_db)):
    e = db.query(Event).filter_by(slug=slug).first()
    if not e:
        raise HTTPException(404, "Событие не найдено")
    place = db.get(Place, e.place_id) if e.place_id else None
    vert = db.get(Vertical, e.vertical_id) if e.vertical_id else None
    return event_dict(e, place, vert)


# ---------- Маршруты ----------
def route_brief(r: Route, db: Session) -> dict:
    ids = [s["place_id"] for s in r.stops]
    places = {p.id: p for p in db.query(Place).options(joinedload(Place.category), joinedload(Place.vertical))
              .filter(Place.id.in_(ids)).all()}
    tl = build_timeline(r.stops, places, r.start_time, r.transport)
    verts = []
    for s in tl["stops"]:
        v = s["place"]["vertical"]
        if v and v["slug"] not in [x["slug"] for x in verts]:
            verts.append(v)
    return {"id": r.id, "slug": r.slug, "title": r.title, "subtitle": r.subtitle, "description": r.description,
            "theme": r.theme, "color": r.color, "is_curated": r.is_curated, "transport": r.transport,
            "user_id": r.user_id, "published": r.published,
            "stops_count": len(tl["stops"]), "pauses": sum(1 for s in tl["stops"] if s["kind"] == "pause"),
            "duration_min": tl["duration_min"], "distance_km": tl["distance_km"], "verticals": verts,
            "polyline": tl["polyline"], "start_time": r.start_time}


@router.get("/routes")
def list_routes(db: Session = Depends(get_db)):
    rs = db.query(Route).filter(Route.is_curated.is_(True), Route.published.is_(True)).order_by(Route.id).all()
    return [route_brief(r, db) for r in rs]


@router.get("/routes/{slug}")
def get_route(slug: str, start: Optional[str] = None, db: Session = Depends(get_db),
              user: Optional[User] = Depends(get_optional_user)):
    r = db.query(Route).filter_by(slug=slug).first()
    if not r or (not r.published and not (user and user.id == r.user_id)):
        raise HTTPException(404, "Маршрут не найден")
    ids = [s["place_id"] for s in r.stops]
    places = {p.id: p for p in db.query(Place).options(joinedload(Place.category), joinedload(Place.vertical))
              .filter(Place.id.in_(ids)).all()}
    d = route_brief(r, db)
    d.update(build_timeline(r.stops, places, start or r.start_time, r.transport))
    return d


class OptimizeIn(BaseModel):
    place_ids: list[int]
    lat: Optional[float] = None
    lng: Optional[float] = None
    start_time: str = "10:00"
    transport: str = "walk"
    keep_order: bool = False


@router.post("/routes/optimize")
def optimize_route(data: OptimizeIn, db: Session = Depends(get_db)):
    """Персональный маршрут из избранного: порядок оптимизируется по расстоянию (ближайший сосед + 2-opt)."""
    if len(data.place_ids) < 1:
        raise HTTPException(400, "Добавьте хотя бы одно место")
    start = (data.lat, data.lng) if data.lat and data.lng else None
    return optimize(db, data.place_ids, start, data.start_time, data.transport, keep_order=data.keep_order)


class GenerateIn(BaseModel):
    hours: float = 3
    interests: list[str] = []
    lat: Optional[float] = None
    lng: Optional[float] = None
    include_food: bool = True
    start_time: str = "10:00"
    transport: str = "walk"


@router.post("/routes/generate")
def generate_route(data: GenerateIn, db: Session = Depends(get_db)):
    """Умный конструктор: маршрут под интересы и доступное время."""
    res = generate(db, max(1.0, min(data.hours, 12)), data.interests, data.lat, data.lng, data.include_food,
                   data.start_time, data.transport)
    if not res:
        raise HTTPException(404, "Не удалось подобрать места — попробуйте другие интересы")
    return res


# ---------- Кадры, наследие, промокоды ----------
@router.get("/opportunities")
def list_opportunities(kind: Optional[str] = None, industry: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Opportunity).filter(Opportunity.moderation == "published")
    if kind:
        q = q.filter(Opportunity.kind.in_(kind.split(",")))
    if industry:
        q = q.filter(Opportunity.industry == industry)
    items = q.order_by(Opportunity.id.desc()).all()
    places = {p.id: p for p in db.query(Place).filter(Place.id.in_([o.place_id for o in items if o.place_id])).all()}
    out = []
    for o in items:
        d = row_dict(o)
        p = places.get(o.place_id)
        d["place"] = {"slug": p.slug, "name": p.name} if p else None
        out.append(d)
    return out


@router.post("/opportunities/{oid}/apply")
def apply_opportunity(oid: int, db: Session = Depends(get_db)):
    o = db.get(Opportunity, oid)
    if not o:
        raise HTTPException(404)
    o.applications += 1
    db.commit()
    return {"ok": True, "contact": o.contact}


@router.get("/heritage")
def heritage(db: Session = Depends(get_db)):
    v = db.query(Vertical).filter_by(slug="maritime").first()
    stories = db.query(HeritageStory).filter_by(moderation="published").order_by(HeritageStory.id).all()
    places = {p.id: p for p in db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
              .filter(Place.id.in_([s.place_id for s in stories if s.place_id])).all()}
    out = []
    for s in stories:
        d = row_dict(s)
        d["place"] = place_brief(places[s.place_id]) if s.place_id in places else None
        out.append(d)
    objs = find_places(db, vertical="maritime", limit=100)["items"] if v and v.enabled else []
    return {"stories": out, "places": objs}


@router.post("/heritage/stories/{sid}/listen")
def listen(sid: int, db: Session = Depends(get_db)):
    s = db.get(HeritageStory, sid)
    if s:
        s.listens += 1
        db.commit()
    return {"ok": True}


@router.get("/promos")
def promos(db: Session = Depends(get_db)):
    ps = db.query(PromoCode).filter_by(active=True).all()
    places = {p.id: p for p in db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
              .filter(Place.id.in_([x.place_id for x in ps])).all()}
    out = []
    for x in ps:
        d = row_dict(x)
        d["place"] = place_brief(places[x.place_id]) if x.place_id in places else None
        out.append(d)
    return out


@router.get("/info")
def info():
    return INFO_SECTIONS


# ---------- Инвесторам (публичная часть) ----------
@router.get("/invest/sites")
def invest_sites(db: Session = Depends(get_db)):
    return [row_dict(s) for s in db.query(InvestSite).filter_by(published=True).order_by(InvestSite.id).all()]


@router.get("/invest/sites/{slug}")
def invest_site(slug: str, db: Session = Depends(get_db)):
    s = db.query(InvestSite).filter_by(slug=slug).first()
    if not s:
        raise HTTPException(404, "Площадка не найдена")
    d = row_dict(s)
    if s.curator_id:
        c = db.get(User, s.curator_id)
        d["curator"] = {"name": c.name, "email": c.email} if c else None
    return d


class MatchIn(BaseModel):
    industry: str = ""
    area_ha: float = 0
    power_mw: float = 0
    needs: list[str] = []  # gas|water|sewage|railway
    kind: str = ""  # greenfield|brownfield|technopark|office
    max_highway_km: float = 0
    city: str = ""


@router.post("/invest/match")
def invest_match(data: MatchIn, db: Session = Depends(get_db)):
    """Мастер подбора площадки: скоринг по требованиям проекта с объяснением."""
    out = []
    for s in db.query(InvestSite).filter_by(published=True).all():
        score, reasons, misses = 0, [], []
        if data.area_ha:
            if s.area_ha >= data.area_ha:
                score += 25; reasons.append(f"площадь {s.area_ha:g} га ≥ {data.area_ha:g} га")
            else:
                score += max(0, 25 * s.area_ha / data.area_ha - 10); misses.append(f"площадь {s.area_ha:g} га меньше нужной")
        else:
            score += 15
        if data.power_mw:
            if s.power_mw >= data.power_mw:
                score += 25; reasons.append(f"мощность {s.power_mw:g} МВт")
            else:
                misses.append(f"мощность {s.power_mw:g} МВт — потребуется техприсоединение")
        else:
            score += 15
        for need, title in (("gas", "газ"), ("water", "вода"), ("sewage", "канализация"), ("railway", "ж/д ветка")):
            if need in data.needs:
                if getattr(s, need):
                    score += 8; reasons.append(title)
                else:
                    misses.append(f"нет: {title}")
        if data.industry:
            if any(data.industry.lower() in i.lower() for i in s.industries):
                score += 20; reasons.append(f"подходит для отрасли «{data.industry}»")
        if data.kind and s.kind == data.kind:
            score += 10
        if data.max_highway_km and s.highway_km <= data.max_highway_km:
            score += 5; reasons.append(f"{s.highway_km:g} км до трассы")
        if data.city and s.city == data.city:
            score += 5
        if s.status == "free":
            score += 10
        elif s.status == "occupied":
            score -= 40; misses.append("площадка занята")
        out.append({"site": row_dict(s), "score": max(0, min(100, round(score))), "reasons": reasons, "misses": misses})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


# ---------- Офлайн-пакет ----------
@router.get("/sync/bundle")
def sync_bundle(db: Session = Depends(get_db)):
    """Всё, что нужно приложению для работы без сети: поиск и карточки доступны офлайн, в том числе гостю."""
    cfg = config_payload(db)
    places = (db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
              .filter(Place.moderation == "published").all())
    return {
        "version": cfg["version"] + "-" + str(len(places)),
        "generated_at": local_now().isoformat(),
        "config": cfg,
        "places": [place_full(p) for p in places],
        "events": list_events(db=db, date_from=None, date_to=None, kind=None, vertical=None, q=None, free=False),
        "routes": [get_route(r.slug, None, db, None) for r in db.query(Route).filter(Route.is_curated.is_(True), Route.published.is_(True)).all()],
        "promos": promos(db),
        "sites": invest_sites(db),
        "opportunities": list_opportunities(db=db),
        "heritage": heritage(db)["stories"],
        "info": INFO_SECTIONS,
    }
