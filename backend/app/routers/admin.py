"""Панель управления: модераторы, кураторы «одного окна», администраторы."""
from datetime import datetime, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, DateTime, Date
from sqlalchemy.orm import Session, joinedload

from ..config import REVIEW_COMPLAINT_SLA_HOURS, SERVICE_ROLES, ROLE_TITLES
from ..db import get_db
from ..models import (User, Place, Vertical, Category, Review, ReviewComplaint, InaccuracyReport, CopyrightComplaint,
                      VerificationRequest, Event, Route, Opportunity, HeritageStory, PromoCode, InvestSite,
                      InvestApplication, FormSubmission, AnalyticsEvent, AuditLog, Favorite, Booking, PromoActivation)
from ..search import rebuild_index
from ..security import require_roles, audit
from ..utils import row_dict, unique_slug, place_full, local_now
from .public import review_dict

router = APIRouter(prefix="/api/admin", tags=["admin"])
curator_router = APIRouter(prefix="/api/curator", tags=["curator"])

MOD = require_roles("moderator")
ADMIN = require_roles()
CUR = require_roles("curator")
STAFF = require_roles("moderator", "curator")

# ресурс → (модель, роли с правом записи, роли с правом чтения)
RESOURCES = {
    "places": (Place, {"moderator"}, {"moderator"}),
    "events": (Event, {"moderator"}, {"moderator"}),
    "routes": (Route, {"moderator"}, {"moderator"}),
    "opportunities": (Opportunity, {"moderator"}, {"moderator"}),
    "stories": (HeritageStory, {"moderator"}, {"moderator"}),
    "promos": (PromoCode, {"moderator"}, {"moderator"}),
    "verticals": (Vertical, set(), {"moderator", "curator"}),
    "categories": (Category, set(), {"moderator"}),
    # паспорта площадок ведёт куратор; модератор — только просмотр (правки по согласованию с куратором)
    "sites": (InvestSite, {"curator"}, {"curator", "moderator"}),
    "submissions": (FormSubmission, {"moderator"}, {"moderator"}),
}
REINDEX = {"places", "verticals", "categories"}


def _check(res: str, user: User, write: bool):
    if res not in RESOURCES:
        raise HTTPException(404, "Неизвестный ресурс")
    _, w, r = RESOURCES[res]
    if user.role == "admin":
        return
    if user.role not in (w if write else (r | w)):
        raise HTTPException(403, "Нет прав на этот раздел")


def _apply(obj, data: dict):
    cols = {c.name: c for c in obj.__table__.columns}
    for k, v in data.items():
        if k not in cols or k == "id":
            continue
        col = cols[k]
        if v is not None and isinstance(col.type, DateTime) and isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "")) if v else None
        elif v is not None and isinstance(col.type, Date) and isinstance(v, str):
            v = date.fromisoformat(v[:10]) if v else None
        setattr(obj, k, v)


@router.get("/r/{res}")
def list_resource(res: str, q: Optional[str] = None, moderation: Optional[str] = None, limit: int = 500,
                  user: User = Depends(STAFF), db: Session = Depends(get_db)):
    _check(res, user, False)
    model = RESOURCES[res][0]
    query = db.query(model)
    if moderation and hasattr(model, "moderation"):
        query = query.filter(model.moderation == moderation)
    if q:
        name_col = getattr(model, "name", None) or getattr(model, "title", None) or getattr(model, "code", None)
        if name_col is not None:
            query = query.filter(name_col.ilike(f"%{q}%"))
    if res == "sites" and user.role == "curator":
        pass  # куратор видит все площадки, но правит только свои/назначенные — проверяется при записи
    return [row_dict(x) for x in query.order_by(model.id.desc()).limit(limit).all()]


@router.get("/r/{res}/{oid}")
def get_resource(res: str, oid: int, user: User = Depends(STAFF), db: Session = Depends(get_db)):
    _check(res, user, False)
    obj = db.get(RESOURCES[res][0], oid)
    if not obj:
        raise HTTPException(404)
    return place_full(obj) if res == "places" else row_dict(obj)


@router.post("/r/{res}")
def create_resource(res: str, data: dict, user: User = Depends(STAFF), db: Session = Depends(get_db)):
    _check(res, user, True)
    model = RESOURCES[res][0]
    obj = model()
    if res == "categories" and not data.get("vertical_id"):
        raise HTTPException(400, "Укажите вертикаль")
    if res == "places":
        cat = db.get(Category, int(data.get("category_id") or 0))
        if not cat:
            raise HTTPException(400, "Укажите тип объекта")
        data["vertical_id"] = cat.vertical_id
    _apply(obj, data)
    if hasattr(model, "slug") and not data.get("slug"):
        title = data.get("name") or data.get("title") or "item"
        obj.slug = unique_slug(db, model, title) if res != "categories" else unique_slug(db, model, title)
    db.add(obj)
    audit(db, user, f"create_{res}", res, str(data.get("name") or data.get("title") or data.get("code") or ""))
    db.commit()
    if res in REINDEX:
        rebuild_index(db)
    return row_dict(obj)


@router.patch("/r/{res}/{oid}")
def update_resource(res: str, oid: int, data: dict, user: User = Depends(STAFF), db: Session = Depends(get_db)):
    _check(res, user, True)
    model = RESOURCES[res][0]
    obj = db.get(model, oid)
    if not obj:
        raise HTTPException(404)
    if res == "sites" and user.role == "curator" and obj.curator_id not in (None, user.id):
        raise HTTPException(403, "Площадку ведёт другой куратор")
    if res == "places" and "category_id" in data:
        cat = db.get(Category, int(data["category_id"]))
        if cat:
            data["vertical_id"] = cat.vertical_id
    _apply(obj, data)
    if res == "places":
        obj.last_checked = local_now().date()
    audit(db, user, f"update_{res}", f"{res}:{oid}", ", ".join(data.keys()))
    db.commit()
    if res in REINDEX:
        rebuild_index(db)
    return row_dict(obj)


@router.delete("/r/{res}/{oid}")
def delete_resource(res: str, oid: int, user: User = Depends(STAFF), db: Session = Depends(get_db)):
    _check(res, user, True)
    model = RESOURCES[res][0]
    obj = db.get(model, oid)
    if not obj:
        raise HTTPException(404)
    if res == "verticals":
        if db.query(Place).filter_by(vertical_id=oid).count():
            raise HTTPException(400, "В вертикали есть объекты — сначала отключите её (enabled=false) или перенесите объекты")
        db.query(Category).filter_by(vertical_id=oid).delete()
    if res == "places":
        for m in (Review, Favorite):
            db.query(m).filter_by(place_id=oid).delete()
        db.query(InaccuracyReport).filter_by(place_id=oid).delete()
    try:
        db.delete(obj)
        audit(db, user, f"delete_{res}", f"{res}:{oid}")
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"Нельзя удалить: есть связанные данные ({type(e).__name__})")
    if res in REINDEX:
        rebuild_index(db)
    return {"ok": True}


# ---------- Очередь модерации ----------
@router.get("/queue")
def queue(user: User = Depends(STAFF), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    sla = now - timedelta(hours=REVIEW_COMPLAINT_SLA_HOURS)
    return {
        "complaints": db.query(ReviewComplaint).filter_by(status="open").count(),
        "complaints_overdue": db.query(ReviewComplaint).filter(ReviewComplaint.status == "open", ReviewComplaint.created_at < sla).count(),
        "reports": db.query(InaccuracyReport).filter_by(status="open").count(),
        "copyright": db.query(CopyrightComplaint).filter_by(status="open").count(),
        "verifications": db.query(VerificationRequest).filter_by(status="pending").count(),
        "verifications_overdue": db.query(VerificationRequest).filter(VerificationRequest.status == "pending",
                                                                      VerificationRequest.deadline < now).count(),
        "places": db.query(Place).filter_by(moderation="pending").count(),
        "events": db.query(Event).filter_by(moderation="pending").count(),
        "stories": db.query(HeritageStory).filter_by(moderation="pending").count(),
        "opportunities": db.query(Opportunity).filter_by(moderation="pending").count(),
        "applications": db.query(InvestApplication).filter(InvestApplication.status.in_(["new", "in_review"])).count(),
        "submissions": db.query(FormSubmission).filter_by(status="new").count(),
    }


@router.get("/complaints")
def complaints(user: User = Depends(MOD), db: Session = Depends(get_db)):
    out = []
    now = datetime.utcnow()
    for c in db.query(ReviewComplaint).order_by(ReviewComplaint.status.desc(), ReviewComplaint.created_at).all():
        r = db.query(Review).options(joinedload(Review.user)).filter(Review.id == c.review_id).first()
        if not r:
            continue
        p = db.get(Place, r.place_id)
        deadline = c.created_at + timedelta(hours=REVIEW_COMPLAINT_SLA_HOURS)
        out.append({**row_dict(c), "review": review_dict(r), "place": {"name": p.name, "slug": p.slug},
                    "deadline": deadline.isoformat(), "hours_left": round((deadline - now).total_seconds() / 3600, 1)})
    return out


class ActionIn(BaseModel):
    action: str
    comment: str = ""
    patch: dict = {}


@router.post("/complaints/{cid}")
def resolve_complaint(cid: int, data: ActionIn, user: User = Depends(MOD), db: Session = Depends(get_db)):
    c = db.get(ReviewComplaint, cid)
    if not c:
        raise HTTPException(404)
    r = db.get(Review, c.review_id)
    if data.action == "hide":
        r.status = "hidden"
        c.status = "hidden"
    else:
        c.status = "kept"
    c.resolved_at, c.resolved_by = datetime.utcnow(), user.id
    from .user import _recalc_rating
    _recalc_rating(db, r.place_id)
    audit(db, user, f"complaint_{c.status}", f"review:{r.id}", data.comment)
    db.commit()
    return {"ok": True}


@router.get("/reviews")
def all_reviews(q: Optional[str] = None, user: User = Depends(MOD), db: Session = Depends(get_db)):
    query = db.query(Review).options(joinedload(Review.user))
    if q:
        query = query.filter(Review.text.ilike(f"%{q}%"))
    rs = query.order_by(Review.created_at.desc()).limit(300).all()
    names = {p.id: p.name for p in db.query(Place).filter(Place.id.in_([r.place_id for r in rs]))}
    return [{**review_dict(r), "place_name": names.get(r.place_id)} for r in rs]


@router.post("/reviews/{rid}/{action}")
def review_action(rid: int, action: str, user: User = Depends(MOD), db: Session = Depends(get_db)):
    r = db.get(Review, rid)
    if not r:
        raise HTTPException(404)
    r.status = "hidden" if action == "hide" else "published"
    from .user import _recalc_rating
    _recalc_rating(db, r.place_id)
    audit(db, user, f"review_{action}", f"review:{rid}")
    db.commit()
    return {"ok": True}


@router.get("/reports")
def reports(user: User = Depends(MOD), db: Session = Depends(get_db)):
    out = []
    for r in db.query(InaccuracyReport).order_by(InaccuracyReport.status.desc(), InaccuracyReport.created_at.desc()).all():
        p = db.get(Place, r.place_id)
        out.append({**row_dict(r), "place": {"id": p.id, "name": p.name, "slug": p.slug} if p else None})
    return out


@router.post("/reports/{rid}")
def resolve_report(rid: int, data: ActionIn, user: User = Depends(MOD), db: Session = Depends(get_db)):
    r = db.get(InaccuracyReport, rid)
    if not r:
        raise HTTPException(404)
    r.status = "fixed" if data.action == "fixed" else "rejected"
    r.resolved_at = datetime.utcnow()
    p = db.get(Place, r.place_id)
    if p and data.patch:
        _apply(p, data.patch)
    if p and data.action == "fixed":
        p.last_checked = local_now().date()
    audit(db, user, f"report_{r.status}", f"place:{r.place_id}", data.comment)
    db.commit()
    rebuild_index(db)
    return {"ok": True}


@router.get("/copyright")
def copyright_list(user: User = Depends(MOD), db: Session = Depends(get_db)):
    return [row_dict(c) for c in db.query(CopyrightComplaint).order_by(CopyrightComplaint.id.desc()).all()]


@router.post("/copyright/{cid}")
def copyright_resolve(cid: int, data: ActionIn, user: User = Depends(MOD), db: Session = Depends(get_db)):
    c = db.get(CopyrightComplaint, cid)
    if not c:
        raise HTTPException(404)
    c.status = "removed" if data.action == "removed" else "rejected"
    c.resolved_at = datetime.utcnow()
    if c.status == "removed" and c.place_id:
        p = db.get(Place, c.place_id)
        if p:
            p.portfolio = [i for i in (p.portfolio or []) if i.get("title", "").lower() not in c.material.lower()]
    audit(db, user, f"copyright_{c.status}", f"copyright:{cid}", data.comment)
    db.commit()
    return {"ok": True}


@router.get("/verifications")
def verifications(user: User = Depends(MOD), db: Session = Depends(get_db)):
    out = []
    now = datetime.utcnow()
    for v in db.query(VerificationRequest).options(joinedload(VerificationRequest.user)).order_by(
            VerificationRequest.status.desc(), VerificationRequest.created_at).all():
        p = db.get(Place, v.place_id) if v.place_id else None
        out.append({**row_dict(v), "contact_code": None, "user": {"name": v.user.name, "email": v.user.email},
                    "place": {"name": p.name, "slug": p.slug, "phone": p.phone, "email": p.email} if p else None,
                    "days_left": round((v.deadline - now).total_seconds() / 86400, 1) if v.deadline else None})
    return out


@router.post("/verifications/{vid}")
def decide_verification(vid: int, data: ActionIn, user: User = Depends(MOD), db: Session = Depends(get_db)):
    v = db.get(VerificationRequest, vid)
    if not v:
        raise HTTPException(404)
    if data.action == "approve" and not v.contact_confirmed:
        raise HTTPException(400, "Контакт из карточки ещё не подтверждён кодом")
    v.status = "approved" if data.action == "approve" else "rejected"
    v.comment, v.decided_by, v.decided_at = data.comment, user.id, datetime.utcnow()
    if v.status == "approved":
        u = db.get(User, v.user_id)
        u.owner_verified = True
        if u.role == "user":
            u.role = "owner"
        if v.place_id:
            db.get(Place, v.place_id).owner_id = u.id
        elif v.new_place.get("name") and v.new_place.get("category_id"):
            np = v.new_place
            cat = db.get(Category, int(np["category_id"]))
            p = Place(slug=unique_slug(db, Place, np["name"]), name=np["name"], vertical_id=cat.vertical_id,
                      category_id=cat.id, address=np.get("address", ""), lat=float(np.get("lat") or 48.008),
                      lng=float(np.get("lng") or 37.804), phone=np.get("phone", ""), short=np.get("short", ""),
                      description=np.get("description", ""), owner_id=u.id, moderation="published")
            db.add(p)
    audit(db, user, f"verification_{v.status}", f"verification:{vid}", data.comment)
    db.commit()
    rebuild_index(db)
    return {"ok": True}


@router.post("/moderate/{res}/{oid}")
def moderate(res: str, oid: int, data: ActionIn, user: User = Depends(MOD), db: Session = Depends(get_db)):
    if res not in ("places", "events", "stories", "opportunities"):
        raise HTTPException(404)
    obj = db.get(RESOURCES[res][0], oid)
    if not obj:
        raise HTTPException(404)
    obj.moderation = "published" if data.action == "publish" else "rejected"
    audit(db, user, f"moderate_{res}_{obj.moderation}", f"{res}:{oid}", data.comment)
    db.commit()
    if res == "places":
        rebuild_index(db)
    return {"ok": True}


# ---------- Пользователи и роли (администратор) ----------
@router.get("/users")
def users(q: Optional[str] = None, user: User = Depends(ADMIN), db: Session = Depends(get_db)):
    query = db.query(User)
    if q:
        query = query.filter(User.email.ilike(f"%{q}%") | User.name.ilike(f"%{q}%"))
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "role_title": ROLE_TITLES.get(u.role),
             "blocked": u.blocked, "is_expert": u.is_expert, "owner_verified": u.owner_verified,
             "totp_enabled": u.totp_enabled, "created_at": u.created_at.isoformat()}
            for u in query.order_by(User.id).all()]


class UserPatch(BaseModel):
    role: Optional[str] = None
    blocked: Optional[bool] = None
    is_expert: Optional[bool] = None
    owner_verified: Optional[bool] = None


@router.patch("/users/{uid}")
def update_user(uid: int, data: UserPatch, user: User = Depends(ADMIN), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404)
    if data.role and data.role not in ROLE_TITLES:
        raise HTTPException(400, "Неизвестная роль")
    if u.id == user.id and data.role and data.role != "admin":
        raise HTTPException(400, "Нельзя понизить собственную роль")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(u, k, v)
    if data.role in SERVICE_ROLES and not u.totp_enabled:
        u.totp_secret = None  # при следующем входе — обязательная настройка 2FA
    audit(db, user, "update_user", f"user:{uid}", str(data.model_dump(exclude_none=True)))
    db.commit()
    return {"ok": True}


@router.get("/analytics")
def analytics(days: int = 30, user: User = Depends(ADMIN), db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (db.query(AnalyticsEvent.type, func.date(AnalyticsEvent.created_at), func.count(AnalyticsEvent.id))
            .filter(AnalyticsEvent.created_at >= since).group_by(AnalyticsEvent.type, func.date(AnalyticsEvent.created_at)).all())
    series = {}
    for t, d, c in rows:
        series.setdefault(str(d), {})[t] = c
    days_list = [(datetime.utcnow() - timedelta(days=i)).date().isoformat() for i in range(days - 1, -1, -1)]
    timeline = [{"date": d, **{k: series.get(d, {}).get(k, 0) for k in ("view", "search", "favorite", "route_build", "booking", "promo")}}
                for d in days_list]
    totals = dict(db.query(AnalyticsEvent.type, func.count(AnalyticsEvent.id)).filter(AnalyticsEvent.created_at >= since)
                  .group_by(AnalyticsEvent.type).all())
    sources = dict(db.query(AnalyticsEvent.source, func.count(AnalyticsEvent.id)).filter(AnalyticsEvent.created_at >= since)
                   .group_by(AnalyticsEvent.source).all())
    top = db.query(Place).order_by(Place.views.desc()).limit(10).all()
    searches = db.query(AnalyticsEvent).filter(AnalyticsEvent.type == "search", AnalyticsEvent.created_at >= since).all()
    qcount, zero = {}, {}
    for s in searches:
        q = (s.meta or {}).get("q", "").lower().strip()
        if not q:
            continue
        qcount[q] = qcount.get(q, 0) + 1
        if (s.meta or {}).get("results") == 0:
            zero[q] = zero.get(q, 0) + 1
    verts = db.query(Vertical).all()
    by_vert = []
    for v in verts:
        cnt = db.query(Place).filter_by(vertical_id=v.id).count()
        views = db.query(func.coalesce(func.sum(Place.views), 0)).filter(Place.vertical_id == v.id).scalar()
        by_vert.append({"slug": v.slug, "name": v.name, "color": v.color, "places": cnt, "views": int(views or 0)})
    roles = dict(db.query(User.role, func.count(User.id)).group_by(User.role).all())
    heat = [[p.lat, p.lng, p.views] for p in db.query(Place).filter(Place.views > 0).all()]
    return {
        "kpi": {"users": db.query(User).count(), "places": db.query(Place).count(),
                "reviews": db.query(Review).count(), "favorites": db.query(Favorite).count(),
                "bookings": db.query(Booking).count(), "applications": db.query(InvestApplication).count(),
                "promo_activations": db.query(PromoActivation).count(),
                "avg_rating": round(float(db.query(func.avg(Review.rating)).scalar() or 0), 2)},
        "totals": totals, "sources": sources, "timeline": timeline, "roles": roles,
        "top_places": [{"name": p.name, "slug": p.slug, "views": p.views, "rating": round(p.rating, 1)} for p in top],
        "top_searches": sorted(qcount.items(), key=lambda x: -x[1])[:10],
        "zero_searches": sorted(zero.items(), key=lambda x: -x[1])[:10],
        "by_vertical": by_vert, "heat": heat,
        "funnel": {"views": totals.get("view", 0), "favorites": totals.get("favorite", 0),
                   "route_builds": totals.get("route_build", 0), "bookings": totals.get("booking", 0)},
    }


@router.get("/audit")
def audit_log(user: User = Depends(ADMIN), db: Session = Depends(get_db)):
    return [row_dict(a) for a in db.query(AuditLog).order_by(AuditLog.id.desc()).limit(300).all()]


@router.get("/system")
def system(user: User = Depends(ADMIN), db: Session = Depends(get_db)):
    from ..config import DATABASE_URL, DEMO_MODE, LLM_API_URL
    from ..search import INDEX
    return {"database": DATABASE_URL.split("://")[0], "demo_mode": DEMO_MODE, "llm": bool(LLM_API_URL),
            "search_index_docs": len(INDEX.docs), "search_vocab": len(INDEX.vocab),
            "server_time": local_now().isoformat(), "version": "1.0.0"}


@router.post("/system/reindex")
def reindex(user: User = Depends(ADMIN), db: Session = Depends(get_db)):
    rebuild_index(db)
    audit(db, user, "reindex", "search")
    db.commit()
    return {"ok": True}


# ---------- Куратор «одного окна» ----------
APP_STATUSES = {
    "new": "Новая", "in_review": "На рассмотрении", "site_proposed": "Предложена площадка",
    "negotiations": "Переговоры", "approved": "Одобрена", "rejected": "Отклонена",
}


@curator_router.get("/applications")
def cur_applications(status: Optional[str] = None, user: User = Depends(CUR), db: Session = Depends(get_db)):
    q = db.query(InvestApplication)
    if status:
        q = q.filter(InvestApplication.status == status)
    out = []
    for a in q.order_by(InvestApplication.id.desc()).all():
        d = row_dict(a)
        inv = db.get(User, a.user_id)
        d["investor"] = {"name": inv.name, "email": inv.email} if inv else None
        if a.site_id:
            s = db.get(InvestSite, a.site_id)
            d["site"] = {"id": s.id, "slug": s.slug, "name": s.name} if s else None
        if a.curator_id:
            c = db.get(User, a.curator_id)
            d["curator"] = {"id": c.id, "name": c.name} if c else None
        out.append(d)
    return {"items": out, "statuses": APP_STATUSES,
            "curators": [{"id": u.id, "name": u.name} for u in db.query(User).filter(User.role.in_(["curator", "admin"]))]}


class AppPatch(BaseModel):
    status: Optional[str] = None
    curator_id: Optional[int] = None
    site_id: Optional[int] = None
    comment: str = ""


@curator_router.patch("/applications/{aid}")
def cur_update(aid: int, data: AppPatch, user: User = Depends(CUR), db: Session = Depends(get_db)):
    a = db.get(InvestApplication, aid)
    if not a:
        raise HTTPException(404)
    if data.status and data.status not in APP_STATUSES:
        raise HTTPException(400, "Неизвестный статус")
    changes = []
    if data.status and data.status != a.status:
        a.status = data.status
        changes.append(f"статус: {APP_STATUSES[data.status]}")
    if data.curator_id and data.curator_id != a.curator_id:
        a.curator_id = data.curator_id
        changes.append("назначен куратор")
    if data.site_id and data.site_id != a.site_id:
        a.site_id = data.site_id
        s = db.get(InvestSite, data.site_id)
        changes.append(f"площадка: {s.name if s else data.site_id}")
    a.history = list(a.history or []) + [{"at": datetime.utcnow().isoformat(), "status": a.status, "by": user.name,
                                           "comment": "; ".join(changes + ([data.comment] if data.comment else []))}]
    a.updated_at = datetime.utcnow()
    audit(db, user, "application_update", f"application:{aid}", "; ".join(changes))
    db.commit()
    return row_dict(a)
