import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Store, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Empty, fmtDate, Tabs } from "../ui/kit";
import { ApplicationCard } from "./Investors";

export default function Profile() {
  const { user, logout, toast, refreshUser, config } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [tab, setTab] = useState<"reviews" | "bookings" | "applications" | "settings">(loc.hash === "#applications" ? "applications" : "bookings");
  const reviews = useAsync(() => (user ? api<any[]>("/api/me/reviews") : Promise.resolve([])), [user?.id]);
  const bookings = useAsync(() => (user ? api<any[]>("/api/me/bookings") : Promise.resolve([])), [user?.id]);
  const apps = useAsync(() => (user ? api<any[]>("/api/me/applications") : Promise.resolve([])), [user?.id]);
  const [interests, setInterests] = useState<string[]>([]);
  useEffect(() => { if (user) setInterests(user.interests || []); }, [user]);
  if (!user) return <div className="container page"><Empty icon="info" title="Вы не вошли">Войдите, чтобы видеть отзывы, записи и заявки<Link to="/login" className="btn primary">Войти</Link></Empty></div>;
  return (
    <div className="container page" style={{ maxWidth: 1000 }}>
      <div className="page-head">
        <div><h1>{user.name}</h1><p className="muted row" style={{ gap: 8, marginTop: 6 }}>{user.email}<span className="badge blue">{user.role_title}</span>{user.totp_enabled && <span className="badge ok"><ShieldCheck size={13} />2FA</span>}</p></div>
        <div className="row">
          {(user.role === "owner" || user.role === "user") && <Link to="/cabinet" className="btn secondary"><Store size={18} />Кабинет бизнеса</Link>}
          {user.is_service && <Link to="/admin" className="btn dark"><LayoutDashboard size={18} />Панель управления</Link>}
          <button className="btn ghost" onClick={() => { logout(); nav("/"); }}><LogOut size={18} />Выйти</button>
        </div>
      </div>
      {user.stats && (
        <div className="kpis" style={{ marginBottom: 24 }}>
          {[["Избранное", user.stats.favorites, "/favorites"], ["Отзывы", user.stats.reviews], ["Записи", user.stats.bookings], ["Заявки инвестора", user.stats.applications], ["Штампы", user.stats.stamps, "/passport"]].map(([l, v, to]) => (
            <Link key={l as string} to={(to as string) || "#"} className="card kpi"><span className="small muted">{l}</span><b>{v}</b></Link>
          ))}
        </div>
      )}
      <Tabs tabs={[["bookings", "Записи"], ["reviews", "Мои отзывы"], ["applications", "Заявки инвестора"], ["settings", "Интересы"]]} value={tab} onChange={setTab} />
      {tab === "bookings" && (bookings.data?.length ? <div className="col">{bookings.data.map((b) => (
        <div key={b.id} className="card row between" style={{ padding: 14 }}>
          <div><b>{b.title}</b><div className="small muted">{b.start ? fmtDate(b.start) : ""}{b.place ? ` · ${b.place.name}` : ""} · {b.people} чел.</div></div>
          <div className="row"><span className={`badge ${b.status === "confirmed" ? "ok" : b.status === "pending" ? "warn" : ""}`}>{{ confirmed: "Подтверждено", pending: "Ждёт подтверждения", cancelled: "Отменено" }[b.status as string]}</span>
            {b.status !== "cancelled" && <button className="btn ghost sm" onClick={async () => { await api(`/api/me/bookings/${b.id}`, { method: "DELETE" }); toast("Запись отменена"); bookings.reload(); }}>Отменить</button>}</div>
        </div>))}</div> : <Empty icon="star" title="Записей нет">Записывайтесь на экскурсии и мастер-классы в карточках мест и в афише</Empty>)}
      {tab === "reviews" && (reviews.data?.length ? <div className="col">{reviews.data.map((r) => (
        <Link key={r.id} to={`/place/${r.place.slug}#reviews`} className="card" style={{ padding: 14 }}>
          <div className="row between"><b>{r.place.name}</b><span style={{ color: "#F2A900" }}>{"★".repeat(r.rating)}</span></div>
          <div className="small">{r.text}</div>{r.owner_reply && <div className="reply small">Ответ владельца: {r.owner_reply}</div>}
          {r.status === "hidden" && <span className="badge warn">Скрыт модератором</span>}
        </Link>))}</div> : <Empty icon="star" title="Вы ещё не писали отзывов" />)}
      {tab === "applications" && (apps.data?.length ? <div className="col">{apps.data.map((a) => <ApplicationCard key={a.id} a={a} />)}</div>
        : <Empty icon="briefcase" title="Заявок нет"><Link to="/investors" className="btn secondary">Подобрать площадку</Link></Empty>)}
      {tab === "settings" && (
        <div className="panel stack">
          <b>Интересы — для подбора маршрутов и гео-уведомлений в приложении</b>
          <div className="chips">{(config?.verticals || []).map((v) => <button key={v.slug} className={`chip ${interests.includes(v.slug) ? "on" : ""}`} onClick={() => setInterests(interests.includes(v.slug) ? interests.filter((x) => x !== v.slug) : [...interests, v.slug])}><span className="sw" style={{ background: v.color }} />{v.name}</button>)}</div>
          <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={async () => { await api("/api/auth/me", { method: "PATCH", body: { interests } }); toast("Сохранено"); refreshUser(); }}>Сохранить</button>
        </div>
      )}
    </div>
  );
}
