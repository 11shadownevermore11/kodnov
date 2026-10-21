import { Link } from "react-router-dom";
import * as I from "lucide-react";
import { PALETTES, useStore } from "../store";
import { Icon } from "../ui/kit";

function Tile({ to, icon, title, sub, color }: { to: string; icon: any; title: string; sub: string; color?: string }) {
  const C = icon;
  return (
    <Link to={to} className="card row" style={{ padding: 16, gap: 14 }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: color || "var(--surface-2)", color: color ? "#fff" : "var(--ink)", display: "grid", placeItems: "center", flexShrink: 0 }}><C size={22} /></span>
      <div className="grow"><div style={{ fontWeight: 600 }}>{title}</div><div className="small muted">{sub}</div></div>
      <I.ChevronRight size={18} className="muted" />
    </Link>
  );
}

export default function More() {
  const { config, user, proMode, setProMode, palette, setPalette } = useStore();
  const tourist = (config?.verticals || []).filter((v) => !v.is_professional);
  return (
    <div className="container page stack" style={{ maxWidth: 900 }}>
      <h1>Ещё</h1>
      <div className="grid two">
        <Tile to="/events" icon={I.CalendarDays} title="Афиша" sub="События и календарь" />
        <Tile to="/promo" icon={I.Ticket} title="Промокоды партнёров" sub="Скидка 3–5% в заведениях" />
        <Tile to="/passport" icon={I.Stamp} title="Паспорт путешественника" sub="Штампы и достижения" />
        <Tile to="/info" icon={I.ShieldAlert} title="Важно знать" sub="Безопасность, транспорт, связь" />
      </div>
      <h2 style={{ marginTop: 24 }}>Направления</h2>
      <div className="grid two">
        {tourist.map((v) => (
          <Link key={v.slug} to={`/v/${v.slug}`} className="card row" style={{ padding: 16, gap: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", background: v.color, color: "#fff", display: "grid", placeItems: "center" }}><Icon name={v.icon} size={22} /></span>
            <div className="grow"><div style={{ fontWeight: 600 }}>{v.name}</div><div className="small muted">{v.count} объектов</div></div>
          </Link>
        ))}
        <Tile to="/heritage" icon={I.Anchor} title="Истории и аудиогиды" sub="Морское наследие Приазовья" />
      </div>

      <div className="panel row between" style={{ marginTop: 24 }}>
        <div><b>Профессиональный режим</b><div className="small muted">По умолчанию включён туристический режим. Профессиональный добавляет в меню разделы для бизнеса, инвесторов и кадров.</div></div>
        <label className="check"><input type="checkbox" checked={proMode} onChange={(e) => setProMode(e.target.checked)} />Включить</label>
      </div>
      <h2>Для бизнеса и инвесторов</h2>
      <div className="grid two">
        <Tile to="/investors" icon={I.Building2} title="Инвесторам — одно окно" sub="Площадки, подбор, единая заявка" color="#1B4FA3" />
        <Tile to="/careers" icon={I.GraduationCap} title="Кадры и образование" sub="Стажировки, курсы, вакансии, наставники" color="#7B3FE4" />
        <Tile to="/cabinet" icon={I.Store} title="Для бизнеса" sub="Добавить предприятие и управлять карточкой" color="#E3263A" />
        {user && ["admin", "moderator", "curator"].includes(user.role) && <Tile to="/admin" icon={I.LayoutDashboard} title="Панель управления" sub={user.role_title} color="#17191F" />}
      </div>

      <h2>Настройки</h2>
      <div className="panel stack">
        <div><b>Цветовая тема</b>
          <div className="theme-grid">{PALETTES.map((p) => (
            <button key={p.id} className={`theme-card ${palette === p.id ? "on" : ""}`} onClick={() => setPalette(p.id)}>
              <span className="swatch lg" style={{ background: `linear-gradient(135deg, ${p.swatch[0]} 50%, ${p.swatch[1]} 50%)` }} />{p.name}
            </button>))}</div>
        </div>
        <Link to={user ? "/profile" : "/login"} className="row between"><b>{user ? `Профиль: ${user.name}` : "Войти или зарегистрироваться"}</b><I.ChevronRight size={18} /></Link>
      </div>
    </div>
  );
}
