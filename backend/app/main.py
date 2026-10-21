"""Код Новороссии — единая цифровая платформа туризма ДНР. Точка входа API."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .config import MEDIA_DIR, WEB_DIST, DEMO_MODE
from .db import Base, engine, SessionLocal, get_db
from .routers import auth, public, user, owner, admin, misc
from .search import rebuild_index
from . import photos


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        from .models import Vertical, AuditLog
        from .seed import seed, SEED_VERSION
        marker = db.query(AuditLog).filter(AuditLog.action == "seed").order_by(AuditLog.id.desc()).first()
        if not db.query(Vertical).first():
            seed(db)
        elif DEMO_MODE and (marker is None or marker.entity != f"v{SEED_VERSION}"):
            # демо-данные обновились — пересоздаём демо-базу
            db.close()
            Base.metadata.drop_all(engine)
            Base.metadata.create_all(engine)
            db = SessionLocal()
            seed(db)
        rebuild_index(db)
        photos.write_names_list(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Код Новороссии API", version="1.0.0", lifespan=lifespan,
              description="Общее API сайта и мобильного приложения: объекты, вертикали, поиск, отзывы, маршруты, "
                          "события, кабинеты владельцев и инвесторов, панель управления.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)

for r in (auth.router, public.router, user.router, owner.router, admin.router, admin.curator_router, misc.router):
    app.include_router(r)

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")
app.mount("/photos", StaticFiles(directory=str(photos.PHOTOS_DIR)), name="photos")  # свои фото — см. photos/README.md


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- Раздача собранного React-приложения с SEO-подстановкой ----------
if WEB_DIST.exists():
    if (WEB_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str, request: Request, db: Session = Depends(get_db)):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = WEB_DIST / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        template = (WEB_DIST / "index.html").read_text(encoding="utf-8")
        meta = misc.seo_meta(db, "/" + full_path)
        return HTMLResponse(misc.render_index(template, meta, "/" + full_path))
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"app": "Код Новороссии API", "docs": "/docs",
                "hint": "Соберите веб: cd web && npm i && npm run build — и сайт будет доступен здесь же"}
