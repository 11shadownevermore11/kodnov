"""Чат-бот и SEO: sitemap.xml, robots.txt, серверная подстановка мета-тегов для постоянных адресов страниц."""
import html
import json
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..assistant import chat
from ..config import SITE_URL
from ..db import get_db
from ..models import Place, Event, Route, Vertical, InvestSite

router = APIRouter(tags=["misc"])


class ChatIn(BaseModel):
    message: str
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/api/assistant/chat")
def assistant(data: ChatIn, db: Session = Depends(get_db)):
    return chat(db, data.message[:500], data.lat, data.lng)


@router.get("/sitemap.xml")
def sitemap(db: Session = Depends(get_db)):
    urls = ["/", "/map", "/catalog", "/events", "/routes", "/investors", "/careers", "/heritage", "/promo", "/info"]
    urls += [f"/place/{p.slug}" for p in db.query(Place).filter_by(moderation="published")]
    urls += [f"/events/{e.slug}" for e in db.query(Event).filter_by(moderation="published")]
    urls += [f"/routes/{r.slug}" for r in db.query(Route).filter_by(is_curated=True, published=True)]
    urls += [f"/v/{v.slug}" for v in db.query(Vertical).filter_by(enabled=True)]
    urls += [f"/investors/sites/{s.slug}" for s in db.query(InvestSite).filter_by(published=True)]
    body = "".join(f"<url><loc>{SITE_URL}{u}</loc></url>" for u in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'
    return Response(xml, media_type="application/xml")


@router.get("/robots.txt")
def robots():
    return Response(f"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /cabinet\nSitemap: {SITE_URL}/sitemap.xml\n",
                    media_type="text/plain")


def seo_meta(db: Session, path: str) -> dict:
    """Мета-теги и JSON-LD для страницы — подставляются в index.html на сервере (SEO без SSR-фреймворка)."""
    title, desc, ld = "Код Новороссии — гид по ДНР", "Туризм, креативные индустрии, события, маршруты и инвестиционные площадки региона в одном окне.", None
    parts = path.strip("/").split("/")
    if len(parts) == 2 and parts[0] == "place":
        p = db.query(Place).filter_by(slug=parts[1]).first()
        if p:
            title = f"{p.name} — {p.category.name if p.category else ''} | Код Новороссии"
            desc = (p.short or p.description)[:180]
            ld = {"@context": "https://schema.org", "@type": "TouristAttraction" if p.vertical and p.vertical.slug == "tourism" else "LocalBusiness",
                  "name": p.name, "description": desc, "telephone": p.phone or None,
                  "address": {"@type": "PostalAddress", "streetAddress": p.address, "addressLocality": p.city},
                  "geo": {"@type": "GeoCoordinates", "latitude": p.lat, "longitude": p.lng},
                  "url": f"{SITE_URL}/place/{p.slug}"}
            if p.reviews_count:
                ld["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": round(p.rating, 1), "reviewCount": p.reviews_count}
    elif len(parts) == 2 and parts[0] == "events":
        e = db.query(Event).filter_by(slug=parts[1]).first()
        if e:
            title, desc = f"{e.title} — афиша | Код Новороссии", e.description[:180]
            ld = {"@context": "https://schema.org", "@type": "Event", "name": e.title, "startDate": e.start.isoformat(),
                  "description": desc}
    elif len(parts) == 2 and parts[0] == "routes":
        r = db.query(Route).filter_by(slug=parts[1]).first()
        if r:
            title, desc = f"Маршрут «{r.title}» | Код Новороссии", (r.subtitle or r.description)[:180]
    elif len(parts) == 2 and parts[0] == "v":
        v = db.query(Vertical).filter_by(slug=parts[1]).first()
        if v:
            title, desc = f"{v.name} | Код Новороссии", v.short
    return {"title": title, "description": desc, "ld": ld}


def render_index(template: str, meta: dict, path: str) -> str:
    t = html.escape(meta["title"])
    d = html.escape(meta["description"] or "")
    head = (f'<title>{t}</title><meta name="description" content="{d}">'
            f'<meta property="og:title" content="{t}"><meta property="og:description" content="{d}">'
            f'<meta property="og:type" content="website"><meta property="og:url" content="{SITE_URL}{path}">'
            f'<meta property="og:image" content="{SITE_URL}/logo-black.png"><link rel="canonical" href="{SITE_URL}{path}">')
    if meta.get("ld"):
        head += f'<script type="application/ld+json">{json.dumps(meta["ld"], ensure_ascii=False)}</script>'
    import re
    template = re.sub(r"<title>.*?</title>", "", template, flags=re.S)
    return template.replace("</head>", head + "</head>", 1)
