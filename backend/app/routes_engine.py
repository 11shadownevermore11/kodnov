"""Конструктор маршрутов: оптимизация персональных маршрутов и генерация «маршрута за N часов»."""
from sqlalchemy.orm import Session, joinedload

from .models import Place, Vertical
from .utils import haversine, optimize_order, build_timeline, travel_minutes

FOOD_CATS = {"cafe", "restaurant", "coffee"}
SKIP_CATS = {"hotel"}
CENTER = (48.0080, 37.8040)  # центр Донецка


def _load(db: Session, ids):
    ps = db.query(Place).options(joinedload(Place.category), joinedload(Place.vertical)).filter(Place.id.in_(ids)).all()
    return {p.id: p for p in ps}


def optimize(db: Session, place_ids: list[int], start=None, start_time="10:00", transport="walk", keep_first=False,
             keep_order=False):
    places = _load(db, place_ids)
    ids = [i for i in place_ids if i in places]
    if keep_order:
        ordered = ids
    elif keep_first and ids:
        first, rest = ids[0], ids[1:]
        pts = [(places[i].lat, places[i].lng) for i in rest]
        order = optimize_order(pts, (places[first].lat, places[first].lng))
        ordered = [first] + [rest[i] for i in order]
    else:
        pts = [(places[i].lat, places[i].lng) for i in ids]
        order = optimize_order(pts, start)
        ordered = [ids[i] for i in order]
    stops = []
    for pid in ordered:
        p = places[pid]
        is_food = p.category and p.category.slug in FOOD_CATS
        stops.append({"place_id": pid, "stay_min": p.category.default_stay_min if p.category else 45,
                      "kind": "pause" if is_food else "visit", "pause_type": "cafe" if is_food else None})
    before = sum(haversine(places[ids[i]].lat, places[ids[i]].lng, places[ids[i + 1]].lat, places[ids[i + 1]].lng)
                 for i in range(len(ids) - 1)) if len(ids) > 1 else 0
    tl = build_timeline(stops, places, start_time, transport)
    tl["saved_km"] = round(max(0, before / 1000 - tl["distance_km"]), 2)
    tl["stops_raw"] = stops
    return tl


def generate(db: Session, hours: float, interests: list[str], lat=None, lng=None, include_food=True,
             start_time="10:00", transport="walk", city="Донецк"):
    budget = int(hours * 60)
    start = (lat, lng) if lat and lng else CENTER
    q = (db.query(Place).options(joinedload(Place.category), joinedload(Place.vertical))
         .join(Vertical, Place.vertical_id == Vertical.id)
         .filter(Place.moderation == "published", Place.status == "open", Vertical.enabled.is_(True),
                 Vertical.slug != "investment"))
    all_places = q.all()
    near = [p for p in all_places if haversine(start[0], start[1], p.lat, p.lng) < (15000 if transport == "walk" else 60000)]
    if not near:
        near = all_places
    food = [p for p in near if p.category and p.category.slug in FOOD_CATS]
    cands = [p for p in near if p.category and p.category.slug not in FOOD_CATS | SKIP_CATS]
    if interests:
        ints = set(interests)
        def match(p):
            return (p.vertical and p.vertical.slug in ints) or (p.category and p.category.slug in ints) or bool(
                ints & set(p.tags or []))
        matched = [p for p in cands if match(p)]
        if len(matched) >= 2:
            cands = matched
    pop = lambda p: p.rating * 2 + min(p.views, 500) / 100 + p.reviews_count / 5 + (2 if p.made_in_region else 0)

    selected, used, cur = [], 0, start
    reserve = 45 if include_food and budget >= 150 else 0
    while True:
        best, best_val, best_cost = None, -1, 0
        for p in cands:
            if p in selected:
                continue
            d = haversine(cur[0], cur[1], p.lat, p.lng)
            cost = travel_minutes(d, transport) + (p.category.default_stay_min if p.category else 45)
            if used + cost > budget - reserve:
                continue
            val = pop(p) / (1 + d / 700)
            if val > best_val:
                best, best_val, best_cost = p, val, cost
        if not best:
            break
        selected.append(best)
        used += best_cost
        cur = (best.lat, best.lng)
        if len(selected) >= 8:
            break
    if not selected:
        return None
    pts = [(p.lat, p.lng) for p in selected]
    order = optimize_order(pts, start)
    ordered = [selected[i] for i in order]
    stops = [{"place_id": p.id, "stay_min": p.category.default_stay_min if p.category else 45, "kind": "visit"}
             for p in ordered]
    places = {p.id: p for p in ordered}
    if reserve and food and len(ordered) >= 2:
        mid = len(ordered) // 2
        a, b = ordered[mid - 1], ordered[mid]
        cafe = min(food, key=lambda f: haversine(a.lat, a.lng, f.lat, f.lng) + haversine(f.lat, f.lng, b.lat, b.lng))
        stops.insert(mid, {"place_id": cafe.id, "stay_min": 40, "kind": "pause", "pause_type": "cafe",
                           "note": "Пауза на обед / кофе"})
        places[cafe.id] = cafe
    tl = build_timeline(stops, places, start_time, transport)
    tl["stops_raw"] = stops
    tl["title"] = f"Маршрут на {hours:g} ч"
    return tl
