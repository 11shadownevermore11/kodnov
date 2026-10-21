"""Свои фотографии без правки кода.

Положите файл в папку photos/ в корне проекта — сайт и приложение подхватят его сразу, без перезапуска и пересборки:

    photos/places/<slug-места>.jpg          главное фото места (обложка карточки, страница места, карусель)
    photos/places/<slug-места>_2.jpg        второе, третье… фото места (_2, _3, …)
    photos/places/<slug-места>/любое.jpg    или целая папка с фотографиями места (по алфавиту)
    photos/events/<slug-события>.jpg        обложка события (иначе берётся фото места проведения)
    photos/directions/<slug-направления>.jpg карточка направления на главной («Чем заняться»)
    photos/hero.jpg                         фон первого экрана главной
    photos/pages/<раздел>.jpg               фото под заголовком раздела: catalog, events, routes, map, heritage,
                                            investors, more, info, favorites, creative …

Форматы: .jpg .jpeg .png .webp. Свои фото показываются раньше демо-картинок.
Точные имена файлов для всех мест и событий — в photos/СПИСОК-ИМЁН.md (создаётся при запуске сервера).
"""
import os
import re
import time
from pathlib import Path

from .config import BASE_DIR

PHOTOS_DIR = Path(os.getenv("PHOTOS_DIR", BASE_DIR.parent / "photos"))
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
EXT = {".jpg", ".jpeg", ".png", ".webp"}
_cache: dict = {"t": 0.0, "map": {}}
_NUM = re.compile(r"^(.*)_(\d+)$")


def _url(p: Path) -> str:
    rel = p.relative_to(PHOTOS_DIR).as_posix()
    return f"/photos/{rel}?v={int(p.stat().st_mtime)}"  # ?v= — чтобы браузер не держал старую версию файла


def _scan() -> dict:
    """{(раздел, slug): [url, …]} — пересканирует папку не чаще раза в 3 секунды."""
    now = time.time()
    if now - _cache["t"] < 3:
        return _cache["map"]
    found: dict[tuple[str, str], list[tuple[int, str, str]]] = {}
    if PHOTOS_DIR.exists():
        for f in PHOTOS_DIR.rglob("*"):
            if not f.is_file() or f.suffix.lower() not in EXT:
                continue
            parts = f.relative_to(PHOTOS_DIR).parts
            if len(parts) == 1:                                   # photos/hero.jpg
                key, order = ("root", f.stem.lower()), 0
            elif len(parts) == 2:                                 # photos/places/slug_2.jpg
                m = _NUM.match(f.stem)
                slug, order = (m.group(1), int(m.group(2))) if m else (f.stem, 1)
                key = (parts[0].lower(), slug.lower())
            else:                                                 # photos/places/slug/любое.jpg
                key, order = (parts[0].lower(), parts[1].lower()), 100
            found.setdefault(key, []).append((order, f.name.lower(), _url(f)))
    _cache["map"] = {k: [u for *_, u in sorted(v)] for k, v in found.items()}
    _cache["t"] = now
    return _cache["map"]


def get(kind: str, slug: str) -> list[str]:
    return _scan().get((kind, (slug or "").lower()), [])


def first(kind: str, slug: str):
    lst = get(kind, slug)
    return lst[0] if lst else None


def site_photos() -> dict:
    """Фон первого экрана и фото разделов — для /api/config."""
    m = _scan()
    return {"hero": (m.get(("root", "hero")) or [None])[0],
            "pages": {slug: urls[0] for (kind, slug), urls in m.items() if kind == "pages" and urls}}


def write_names_list(db) -> None:
    """Создаёт photos/СПИСОК-ИМЁН.md — какие файлы класть, чтобы заменить заглушки."""
    from .models import Place, Event, Vertical
    lines = ["# Имена файлов для своих фотографий", "",
             "Файл создаётся автоматически при запуске сервера. Как пользоваться — в photos/README.md.", "",
             "## Места → `photos/places/`", "", "| Место | Город | Имя файла | Сейчас |", "|---|---|---|---|"]
    for p in db.query(Place).order_by(Place.city, Place.name).all():
        state = "своё фото" if get("places", p.slug) else ("демо-фото" if p.photos else "рисунок-заглушка")
        lines.append(f"| {p.name} | {p.city or ''} | `{p.slug}.jpg` | {state} |")
    lines += ["", "## События → `photos/events/`", "", "| Событие | Имя файла |", "|---|---|"]
    for e in db.query(Event).order_by(Event.start).all():
        lines.append(f"| {e.title} | `{e.slug}.jpg` |")
    lines += ["", "## Направления на главной → `photos/directions/`", "", "| Направление | Имя файла |", "|---|---|"]
    for v in db.query(Vertical).order_by(Vertical.sort).all():
        lines.append(f"| {v.name} | `{v.slug}.jpg` |")
    lines += ["", "## Фон первого экрана и разделов", "", "| Где | Файл |", "|---|---|",
              "| Главная, первый экран | `photos/hero.jpg` |"]
    for slug, name in [("catalog", "Каталог"), ("map", "Карта"), ("events", "Афиша"), ("routes", "Маршруты"),
                       ("creative", "Креативные индустрии"), ("heritage", "Морское наследие"), ("investors", "Инвесторам"),
                       ("careers", "Кадры и образование"), ("favorites", "Избранное"), ("promo", "Промокоды"),
                       ("passport", "Паспорт путешественника"), ("info", "Важно знать"), ("more", "Ещё")]:
        lines.append(f"| {name} | `photos/pages/{slug}.jpg` |")
    try:
        (PHOTOS_DIR / "СПИСОК-ИМЁН.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError:
        pass
