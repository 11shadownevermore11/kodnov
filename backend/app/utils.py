"""Утилиты: транслитерация, расстояния, «открыто сейчас», оптимизация маршрутов, сериализация."""
import math
import re
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

from .config import TIMEZONE
from . import photos

TZ = ZoneInfo(TIMEZONE)
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_TITLES = {"mon": "Пн", "tue": "Вт", "wed": "Ср", "thu": "Чт", "fri": "Пт", "sat": "Сб", "sun": "Вс"}

_TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
               ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
                "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def slugify(text: str) -> str:
    s = "".join(_TR.get(ch, ch) for ch in text.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:120] or "item"


def unique_slug(db, model, text: str) -> str:
    base = slugify(text)
    slug, i = base, 2
    while db.query(model).filter(model.slug == slug).first():
        slug = f"{base}-{i}"
        i += 1
    return slug


def haversine(lat1, lng1, lat2, lng2) -> float:
    """Расстояние в метрах."""
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def local_now() -> datetime:
    return datetime.now(TZ).replace(tzinfo=None)


def _parse_range(rng: str):
    a, b = rng.split("-")
    ha, ma = map(int, a.split(":"))
    hb, mb = map(int, b.split(":"))
    return ha * 60 + ma, hb * 60 + mb


def is_open_now(place, at: datetime | None = None) -> bool:
    if place.status != "open":
        return False
    hours = place.hours or {}
    if hours.get("always"):
        return True
    at = at or local_now()
    key = DAYS[at.weekday()]
    rng = hours.get(key)
    if not rng:
        return False
    try:
        start, end = _parse_range(rng)
    except Exception:
        return False
    m = at.hour * 60 + at.minute
    if end <= start:  # работает после полуночи
        return m >= start or m < end
    return start <= m < end


def today_hours(place) -> str:
    hours = place.hours or {}
    if hours.get("always"):
        return "Круглосуточно"
    rng = hours.get(DAYS[local_now().weekday()])
    return rng or "Выходной"


def add_workdays(start: datetime, days: int) -> datetime:
    d = start
    added = 0
    while added < days:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


# ---------- Маршруты ----------
WALK_KMH = 4.5
CAR_KMH = 30


def travel_minutes(m: float, transport: str = "walk") -> int:
    speed = WALK_KMH if transport == "walk" else CAR_KMH
    k = 1.3  # коэффициент извилистости улиц
    return max(1, round(m * k / 1000 / speed * 60))


def optimize_order(points: list[tuple[float, float]], start: tuple[float, float] | None = None) -> list[int]:
    """Ближайший сосед + 2-opt. Возвращает порядок индексов."""
    n = len(points)
    if n <= 2:
        return list(range(n))

    def d(i, j):
        return haversine(points[i][0], points[i][1], points[j][0], points[j][1])

    if start:
        first = min(range(n), key=lambda i: haversine(start[0], start[1], points[i][0], points[i][1]))
    else:
        # начинаем с крайней точки (самой западной), чтобы маршрут шёл «в одну сторону»
        first = min(range(n), key=lambda i: points[i][1])
    order = [first]
    left = set(range(n)) - {first}
    while left:
        last = order[-1]
        nxt = min(left, key=lambda j: d(last, j))
        order.append(nxt)
        left.remove(nxt)

    def length(o):
        return sum(d(o[i], o[i + 1]) for i in range(len(o) - 1))

    improved = True
    while improved:
        improved = False
        for i in range(1, n - 1):
            for k in range(i + 1, n):
                new = order[:i] + order[i:k + 1][::-1] + order[k + 1:]
                if length(new) + 1e-6 < length(order):
                    order = new
                    improved = True
    return order


def build_timeline(stops: list[dict], places: dict, start_time: str = "10:00", transport: str = "walk") -> dict:
    """stops: [{place_id, stay_min, kind, pause_type, note}] → расписание с временем прихода/ухода."""
    h, m = map(int, (start_time or "10:00").split(":"))
    t = h * 60 + m
    out, total_dist = [], 0.0
    prev = None
    for idx, s in enumerate(stops):
        p = places.get(s.get("place_id"))
        if not p:
            continue
        walk_min, dist = 0, 0.0
        if prev is not None:
            dist = haversine(prev.lat, prev.lng, p.lat, p.lng)
            walk_min = travel_minutes(dist, transport)
            total_dist += dist
            t += walk_min
        stay = int(s.get("stay_min") or (p.category.default_stay_min if p.category else 45))
        out.append({
            "order": len(out) + 1,
            "kind": s.get("kind", "visit"),
            "pause_type": s.get("pause_type"),
            "note": s.get("note", ""),
            "stay_min": stay,
            "arrive": f"{t // 60 % 24:02d}:{t % 60:02d}",
            "leave": f"{(t + stay) // 60 % 24:02d}:{(t + stay) % 60:02d}",
            "travel_min": walk_min,
            "travel_m": round(dist),
            "place": place_brief(p),
        })
        t += stay
        prev = p
    start_min = h * 60 + m
    return {
        "stops": out,
        "duration_min": t - start_min,
        "distance_km": round(total_dist / 1000, 2),
        "start": start_time,
        "finish": f"{t // 60 % 24:02d}:{t % 60:02d}",
        "polyline": [[s["place"]["lat"], s["place"]["lng"]] for s in out],
    }


# ---------- Сериализация ----------
def place_brief(p, lat=None, lng=None) -> dict:
    d = {
        "id": p.id, "slug": p.slug, "name": p.name, "short": p.short, "address": p.address, "city": p.city,
        "lat": p.lat, "lng": p.lng, "photos": photos.get("places", p.slug) + [x for x in (p.photos or []) if not str(x).startswith("/photos/")], "status": p.status,
        "rating": round(p.rating or 0, 1), "reviews_count": p.reviews_count, "price_level": p.price_level,
        "tags": p.tags or [], "labels": p.labels or [], "formats": p.formats or [],
        "made_in_region": p.made_in_region, "accessible": p.accessible,
        # график не указан → None: интерфейс пишет «график уточняйте», а не «закрыто»
        "open_now": is_open_now(p) if p.hours else None, "today_hours": today_hours(p) if p.hours else "",
        "hours": p.hours or {},
        "vertical": {"id": p.vertical.id, "slug": p.vertical.slug, "name": p.vertical.name,
                     "color": p.vertical.color, "icon": p.vertical.icon} if p.vertical else None,
        "category": {"id": p.category.id, "slug": p.category.slug, "name": p.category.name,
                     "icon": p.category.icon} if p.category else None,
        "views": p.views, "favorites_count": p.favorites_count, "moderation": p.moderation,
    }
    if lat is not None and lng is not None:
        d["distance_m"] = round(haversine(lat, lng, p.lat, p.lng))
    return d


def place_full(p) -> dict:
    d = place_brief(p)
    fields = (p.category.fields if p.category else []) or []
    attrs = p.attrs or {}
    d.update({
        "description": p.description, "hours": p.hours or {}, "phone": p.phone, "website": p.website,
        "email": p.email, "social": p.social or {}, "last_checked": p.last_checked.isoformat() if p.last_checked else None,
        "avg_check": p.avg_check, "services": p.services or [], "portfolio": p.portfolio or [],
        "attrs": attrs, "owner_id": p.owner_id,
        "fields": [{**f, "value": attrs.get(f["key"])} for f in fields if attrs.get(f["key"]) not in (None, "", [])],
        "route_builds": p.route_builds, "shares": p.shares,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    })
    return d


def event_dict(e, place=None, vertical=None) -> dict:
    return {
        "id": e.id, "slug": e.slug, "title": e.title, "kind": e.kind, "start": e.start.isoformat(),
        "end": e.end.isoformat() if e.end else None, "description": e.description, "price": e.price,
        "age": e.age, "registration": e.registration, "capacity": e.capacity, "booked": e.booked,
        "tags": e.tags or [], "moderation": e.moderation,
        "place": {"id": place.id, "slug": place.slug, "name": place.name, "address": place.address,
                  "lat": place.lat, "lng": place.lng,
                  "photo": photos.first("places", place.slug) or (place.photos or [None])[0]} if place else None,
        "photo": photos.first("events", e.slug),
        "vertical": {"slug": vertical.slug, "name": vertical.name, "color": vertical.color} if vertical else None,
    }


def site_dict(s) -> dict:
    return {c.name: getattr(s, c.name) for c in s.__table__.columns}


def row_dict(obj) -> dict:
    out = {}
    for c in obj.__table__.columns:
        v = getattr(obj, c.name)
        if isinstance(v, (datetime, date)):
            v = v.isoformat()
        out[c.name] = v
    return out
