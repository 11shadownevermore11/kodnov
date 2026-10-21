"""Общая логика выборки объектов: фильтры, поиск, сортировка. Используется API, чат-ботом и SEO."""
from sqlalchemy.orm import Session, joinedload

from .models import Place, Vertical, Category
from .search import INDEX
from .utils import is_open_now, haversine, place_brief


def _as_list(v):
    if v is None or v == "":
        return []
    if isinstance(v, (list, tuple)):
        return [x for x in v if x not in (None, "")]
    return [x for x in str(v).split(",") if x]


def find_places(db: Session, *, q=None, vertical=None, category=None, min_rating=None, open_now=False, price_max=None,
                formats=None, made_in_region=None, accessible=None, label=None, lat=None, lng=None, radius_m=None,
                sort="relevance", attrs=None, bbox=None, city=None, limit=50, offset=0, include_pending=False,
                ids=None):
    query = db.query(Place).options(joinedload(Place.vertical), joinedload(Place.category))
    if not include_pending:
        query = query.filter(Place.moderation == "published")
    verts = _as_list(vertical)
    if verts:
        query = query.join(Vertical, Place.vertical_id == Vertical.id).filter(Vertical.slug.in_(verts),
                                                                                Vertical.enabled.is_(True))
    else:
        query = query.join(Vertical, Place.vertical_id == Vertical.id).filter(Vertical.enabled.is_(True))
    cats = _as_list(category)
    if cats:
        query = query.join(Category, Place.category_id == Category.id).filter(Category.slug.in_(cats))
    if min_rating:
        query = query.filter(Place.rating >= float(min_rating))
    if price_max not in (None, ""):
        query = query.filter(Place.price_level <= int(price_max))
    if made_in_region:
        query = query.filter(Place.made_in_region.is_(True))
    if accessible:
        query = query.filter(Place.accessible.is_(True))
    if city:
        query = query.filter(Place.city == city)
    if ids:
        query = query.filter(Place.id.in_(ids))
    if bbox:
        try:
            s, w, n, e = map(float, str(bbox).split(","))
            query = query.filter(Place.lat.between(s, n), Place.lng.between(w, e))
        except ValueError:
            pass
    items = query.all()

    fmts = _as_list(formats)
    if fmts:
        items = [p for p in items if set(fmts) & set(p.formats or [])]
    labels = _as_list(label)
    if labels:
        items = [p for p in items if set(labels) <= set(p.labels or [])]
    if open_now:
        items = [p for p in items if is_open_now(p)]
    if attrs:
        for k, v in attrs.items():
            if v in (None, ""):
                continue
            def ok(p, k=k, v=v):
                val = (p.attrs or {}).get(k)
                if isinstance(val, bool):
                    return val == (str(v).lower() in ("1", "true", "да", "yes"))
                if isinstance(val, list):
                    return v in val
                return str(val).lower() == str(v).lower()
            items = [p for p in items if ok(p)]
    if lat is not None and lng is not None and radius_m:
        items = [p for p in items if haversine(lat, lng, p.lat, p.lng) <= float(radius_m)]

    hints = []
    scores = {}
    if q and q.strip():
        scores, hints = INDEX.search(q)
        top = max(scores.values(), default=0)
        # отсекаем «хвост» слабых совпадений, чтобы сортировка по расстоянию не поднимала нерелевантное
        items = [p for p in items if scores.get(p.id, 0) >= top * 0.3]

    popularity = lambda p: p.views + p.favorites_count * 5 + p.reviews_count * 8 + p.route_builds * 3
    if sort == "distance" and lat is not None and lng is not None:
        items.sort(key=lambda p: haversine(lat, lng, p.lat, p.lng))
    elif sort == "rating":
        items.sort(key=lambda p: (p.rating, p.reviews_count), reverse=True)
    elif sort == "popularity":
        items.sort(key=popularity, reverse=True)
    elif sort == "name":
        items.sort(key=lambda p: p.name)
    elif scores:
        items.sort(key=lambda p: (scores.get(p.id, 0), popularity(p)), reverse=True)
    else:
        items.sort(key=popularity, reverse=True)

    total = len(items)
    page = items[offset: offset + limit] if limit else items
    return {"items": [place_brief(p, lat, lng) for p in page], "total": total, "hints": hints}
