"""Модель данных платформы. Ядро (объекты, отзывы, маршруты, события, роли) + вертикали, настраиваемые в админке."""
from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Integer, Float, Boolean, Text, DateTime, Date, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(30), default="user")  # user|owner|curator|moderator|admin
    is_expert: Mapped[bool] = mapped_column(Boolean, default=False)  # доступ в закрытое пространство экспертов
    owner_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_secret: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    interests: Mapped[list] = mapped_column(JSON, default=list)
    investor_profile: Mapped[dict] = mapped_column(JSON, default=dict)  # инвестор — профиль пользователя
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Vertical(Base):
    """Тематическое направление. Создаётся в админке и сразу появляется на сайте и в приложении."""
    __tablename__ = "verticals"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    short: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(50), default="map-pin")
    color: Mapped[str] = mapped_column(String(20), default="#1B4FA3")
    stage: Mapped[int] = mapped_column(Integer, default=1)
    is_professional: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    map_layer: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=100)
    form_title: Mapped[str] = mapped_column(String(120), default="")  # форма заявки вертикали
    form_fields: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    categories: Mapped[list["Category"]] = relationship(back_populates="vertical", order_by="Category.sort")


class Category(Base):
    """Тип объекта. Набор полей карточки задаётся в админке (fields)."""
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    vertical_id: Mapped[int] = mapped_column(ForeignKey("verticals.id"))
    slug: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(50), default="map-pin")
    fields: Mapped[list] = mapped_column(JSON, default=list)  # [{key,label,type,options,unit,filterable,required}]
    default_stay_min: Mapped[int] = mapped_column(Integer, default=45)
    sort: Mapped[int] = mapped_column(Integer, default=100)
    vertical: Mapped[Vertical] = relationship(back_populates="categories")


class Place(Base):
    __tablename__ = "places"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    vertical_id: Mapped[int] = mapped_column(ForeignKey("verticals.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    short: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    city: Mapped[str] = mapped_column(String(100), default="Донецк")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    hours: Mapped[dict] = mapped_column(JSON, default=dict)  # {"mon":"09:00-18:00",...,"sun":null}
    phone: Mapped[str] = mapped_column(String(60), default="")
    website: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    social: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="open")  # open|closed|temporarily_unavailable
    last_checked: Mapped[date] = mapped_column(Date, default=date.today)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    price_level: Mapped[int] = mapped_column(Integer, default=1)  # 0 бесплатно .. 3 дорого
    avg_check: Mapped[int] = mapped_column(Integer, default=0)
    formats: Mapped[list] = mapped_column(JSON, default=list)  # индивидуально|группой|по записи|онлайн|с детьми
    labels: Mapped[list] = mapped_column(JSON, default=list)  # interns|excursions|orders
    made_in_region: Mapped[bool] = mapped_column(Boolean, default=False)
    accessible: Mapped[bool] = mapped_column(Boolean, default=False)
    services: Mapped[list] = mapped_column(JSON, default=list)  # [{name, price}]
    portfolio: Mapped[list] = mapped_column(JSON, default=list)  # [{title, year, description, image, rights_confirmed}]
    attrs: Mapped[dict] = mapped_column(JSON, default=dict)  # значения полей типа объекта
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    moderation: Mapped[str] = mapped_column(String(20), default="published")  # published|pending|rejected
    rating: Mapped[float] = mapped_column(Float, default=0)
    reviews_count: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(Integer, default=0)
    favorites_count: Mapped[int] = mapped_column(Integer, default=0)
    route_builds: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    vertical: Mapped[Vertical] = relationship()
    category: Mapped[Category] = relationship()


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("place_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="published")  # published|hidden
    owner_reply: Mapped[str] = mapped_column(Text, default="")
    owner_reply_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    user: Mapped[User] = relationship()


class ReviewComplaint(Base):
    __tablename__ = "review_complaints"
    id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id"))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|hidden|kept
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class InaccuracyReport(Base):
    __tablename__ = "inaccuracy_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"))
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    field: Mapped[str] = mapped_column(String(60), default="other")
    message: Mapped[str] = mapped_column(Text)
    contact: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class CopyrightComplaint(Base):
    __tablename__ = "copyright_complaints"
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[Optional[int]] = mapped_column(ForeignKey("places.id"), nullable=True)
    material: Mapped[str] = mapped_column(String(300))  # что нарушает (ссылка/название работы)
    claimant_name: Mapped[str] = mapped_column(String(200))
    claimant_contact: Mapped[str] = mapped_column(String(200))
    proof: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|removed|rejected
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "place_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Route(Base):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    subtitle: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    theme: Mapped[str] = mapped_column(String(60), default="")
    color: Mapped[str] = mapped_column(String(20), default="#F21C33")
    is_curated: Mapped[bool] = mapped_column(Boolean, default=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    transport: Mapped[str] = mapped_column(String(20), default="walk")  # walk|car
    start_time: Mapped[str] = mapped_column(String(5), default="10:00")
    stops: Mapped[list] = mapped_column(JSON, default=list)  # [{place_id, stay_min, kind: visit|pause, pause_type, note}]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(40))  # festival|exhibition|masterclass|open_day|concert|lecture|excursion|hackathon
    vertical_id: Mapped[Optional[int]] = mapped_column(ForeignKey("verticals.id"), nullable=True)
    place_id: Mapped[Optional[int]] = mapped_column(ForeignKey("places.id"), nullable=True)
    start: Mapped[datetime] = mapped_column(DateTime, index=True)
    end: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(Integer, default=0)
    age: Mapped[str] = mapped_column(String(10), default="0+")
    registration: Mapped[bool] = mapped_column(Boolean, default=False)
    capacity: Mapped[int] = mapped_column(Integer, default=0)
    booked: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    moderation: Mapped[str] = mapped_column(String(20), default="published")
    created_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class ExcursionSlot(Base):
    __tablename__ = "excursion_slots"
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Экскурсия")
    start: Mapped[datetime] = mapped_column(DateTime)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    capacity: Mapped[int] = mapped_column(Integer, default=15)
    booked: Mapped[int] = mapped_column(Integer, default=0)
    price: Mapped[int] = mapped_column(Integer, default=0)
    group_only: Mapped[bool] = mapped_column(Boolean, default=False)


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    slot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("excursion_slots.id"), nullable=True)
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("events.id"), nullable=True)
    place_id: Mapped[Optional[int]] = mapped_column(ForeignKey("places.id"), nullable=True)
    people: Mapped[int] = mapped_column(Integer, default=1)
    contact: Mapped[str] = mapped_column(String(200), default="")
    comment: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="confirmed")  # pending|confirmed|cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PromoCode(Base):
    __tablename__ = "promo_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    code: Mapped[str] = mapped_column(String(40))
    discount: Mapped[int] = mapped_column(Integer, default=5)  # 3–5 %
    description: Mapped[str] = mapped_column(String(300), default="на весь ассортимент")
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    activations: Mapped[int] = mapped_column(Integer, default=0)


class PromoActivation(Base):
    __tablename__ = "promo_activations"
    id: Mapped[int] = mapped_column(primary_key=True)
    promo_id: Mapped[int] = mapped_column(ForeignKey("promo_codes.id"))
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class VerificationRequest(Base):
    """Верификация владельца: заявка → документ (ЕГРЮЛ/ЕГРИП/ИНН) + подтверждение по контактам → решение модератора ≤ 3 раб. дней."""
    __tablename__ = "verification_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    place_id: Mapped[Optional[int]] = mapped_column(ForeignKey("places.id"), nullable=True)
    new_place: Mapped[dict] = mapped_column(JSON, default=dict)
    org_name: Mapped[str] = mapped_column(String(300))
    doc_type: Mapped[str] = mapped_column(String(20))  # ЕГРЮЛ|ЕГРИП|ИНН
    doc_number: Mapped[str] = mapped_column(String(40))
    doc_file: Mapped[str] = mapped_column(String(300), default="")
    contact_code: Mapped[str] = mapped_column(String(10), default="")
    contact_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|approved|rejected
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")
    decided_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    user: Mapped[User] = relationship()


class InvestSite(Base):
    __tablename__ = "invest_sites"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(40), default="greenfield")  # greenfield|brownfield|technopark|office
    city: Mapped[str] = mapped_column(String(100), default="Донецк")
    address: Mapped[str] = mapped_column(String(300), default="")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    polygon: Mapped[list] = mapped_column(JSON, default=list)  # [[lat,lng],...]
    area_ha: Mapped[float] = mapped_column(Float, default=1)
    building_m2: Mapped[int] = mapped_column(Integer, default=0)
    power_mw: Mapped[float] = mapped_column(Float, default=0)
    gas: Mapped[bool] = mapped_column(Boolean, default=False)
    water: Mapped[bool] = mapped_column(Boolean, default=False)
    sewage: Mapped[bool] = mapped_column(Boolean, default=False)
    railway: Mapped[bool] = mapped_column(Boolean, default=False)
    highway_km: Mapped[float] = mapped_column(Float, default=1)
    status: Mapped[str] = mapped_column(String(30), default="free")  # free|reserved|occupied
    ownership: Mapped[str] = mapped_column(String(60), default="Государственная")
    deal: Mapped[str] = mapped_column(String(60), default="Аренда / продажа")
    price: Mapped[str] = mapped_column(String(100), default="по запросу")
    industries: Mapped[list] = mapped_column(JSON, default=list)
    benefits: Mapped[list] = mapped_column(JSON, default=list)  # льготы СЭЗ и т.п.
    documents: Mapped[list] = mapped_column(JSON, default=list)  # [{title, url}]
    description: Mapped[str] = mapped_column(Text, default="")
    before: Mapped[dict] = mapped_column(JSON, default=dict)  # «Новая жизнь площадок»: {text, year}
    after: Mapped[dict] = mapped_column(JSON, default=dict)
    residents: Mapped[list] = mapped_column(JSON, default=list)
    curator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=True)


class InvestApplication(Base):
    """Единая заявка инвестора «одно окно» со статусами и куратором."""
    __tablename__ = "invest_applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("invest_sites.id"), nullable=True)
    project: Mapped[str] = mapped_column(String(300))
    company: Mapped[str] = mapped_column(String(300), default="")
    inn: Mapped[str] = mapped_column(String(20), default="")
    industry: Mapped[str] = mapped_column(String(100), default="")
    investment_mln: Mapped[float] = mapped_column(Float, default=0)
    jobs: Mapped[int] = mapped_column(Integer, default=0)
    need_area_ha: Mapped[float] = mapped_column(Float, default=0)
    need_power_mw: Mapped[float] = mapped_column(Float, default=0)
    needs: Mapped[list] = mapped_column(JSON, default=list)  # gas, water, railway…
    support: Mapped[list] = mapped_column(JSON, default=list)  # какие меры поддержки интересны
    contact: Mapped[str] = mapped_column(String(200), default="")
    comment: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="new")
    curator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    history: Mapped[list] = mapped_column(JSON, default=list)  # [{at, status, by, comment}]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Opportunity(Base):
    """Кадры и образование: стажировки, курсы, вакансии, наставники."""
    __tablename__ = "opportunities"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # internship|course|vacancy|mentor
    title: Mapped[str] = mapped_column(String(200))
    place_id: Mapped[Optional[int]] = mapped_column(ForeignKey("places.id"), nullable=True)
    org: Mapped[str] = mapped_column(String(200), default="")
    industry: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    format: Mapped[str] = mapped_column(String(40), default="очно")
    salary: Mapped[str] = mapped_column(String(80), default="")
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    contact: Mapped[str] = mapped_column(String(200), default="")
    moderation: Mapped[str] = mapped_column(String(20), default="published")
    applications: Mapped[int] = mapped_column(Integer, default=0)


class HeritageStory(Base):
    """Морское наследие Приазовья: истории, аудиогиды, материалы жителей (с модерацией)."""
    __tablename__ = "heritage_stories"
    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[Optional[int]] = mapped_column(ForeignKey("places.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    period: Mapped[str] = mapped_column(String(60), default="")
    author: Mapped[str] = mapped_column(String(200), default="")
    author_kind: Mapped[str] = mapped_column(String(20), default="editor")  # editor|resident|expert
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    audio_url: Mapped[str] = mapped_column(String(300), default="")  # если нет — синтез речи на устройстве
    rights_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    moderation: Mapped[str] = mapped_column(String(20), default="published")
    listens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ExpertNote(Base):
    """Закрытое рабочее пространство экспертов."""
    __tablename__ = "expert_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    story_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    user: Mapped[User] = relationship()


class FormSubmission(Base):
    """Заявки по форме вертикали (форма настраивается в админке)."""
    __tablename__ = "form_submissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    vertical_id: Mapped[int] = mapped_column(ForeignKey("verticals.id"))
    place_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class CheckIn(Base):
    """«Паспорт путешественника»: гео-отметки в местах."""
    __tablename__ = "checkins"
    __table_args__ = (UniqueConstraint("user_id", "place_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(30), index=True)  # view|favorite|route_build|share|promo|search|booking
    place_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(20), default="web")  # web|app
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    user_name: Mapped[str] = mapped_column(String(200), default="")
    action: Mapped[str] = mapped_column(String(100))
    entity: Mapped[str] = mapped_column(String(100), default="")
    details: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
