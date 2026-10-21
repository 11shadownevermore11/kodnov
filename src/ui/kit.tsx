import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import * as L from "lucide-react";
import { PlaceBrief } from "../api";
import { useStore } from "../store";
import { Scene, sceneFor } from "./Scene";

// Иконки задаются строкой в админке (вертикали, категории) — сопоставляем с набором lucide.
const ICONS: Record<string, any> = {
  landmark: L.Landmark, palette: L.Palette, factory: L.Factory, briefcase: L.Briefcase, anchor: L.Anchor, camera: L.Camera,
  trees: L.Trees, drama: L.Drama, utensils: L.Utensils, coffee: L.Coffee, bed: L.BedDouble, telescope: L.Telescope,
  blocks: L.Blocks, music: L.Music, clapperboard: L.Clapperboard, "gamepad-2": L.Gamepad2, "book-open": L.BookOpen,
  "building-2": L.Building2, megaphone: L.Megaphone, shirt: L.Shirt, "pen-tool": L.PenTool, "shopping-bag": L.ShoppingBag,
  "hard-hat": L.HardHat, handshake: L.Handshake, ship: L.Ship, waves: L.Waves, bike: L.Bike, mountain: L.Mountain,
  "map-pin": L.MapPin, heart: L.Heart, star: L.Star, trophy: L.Trophy, dumbbell: L.Dumbbell, church: L.Church,
  siren: L.Siren, shield: L.Shield, bus: L.Bus, wallet: L.Wallet, droplets: L.Droplets, info: L.Info, tent: L.Tent,
  fish: L.Fish, leaf: L.Leaf, wine: L.Wine, cpu: L.Cpu, microscope: L.Microscope, baby: L.Baby, "graduation-cap": L.GraduationCap,
};
export const ICON_NAMES = Object.keys(ICONS);
export function Icon({ name, size = 18, ...rest }: { name?: string; size?: number; [k: string]: any }) {
  const C = ICONS[name || ""] || L.MapPin;
  return <C size={size} strokeWidth={2} {...rest} />;
}

export function Logo({ size = 38 }: { size?: number }) {
  const { dark } = useStore();
  return <img src={dark ? "/mark-white.png" : "/mark-black.png"} alt="ФСП ДНР" style={{ height: size, width: "auto" }} />;
}

export const plural = (n: number, a: string, b: string, c: string) =>
  n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;

export const fmtDist = (m?: number) => (m == null ? "" : m < 1000 ? `${m} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} км`);
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}` : `${m} мин`);
export const PRICE = ["Бесплатно", "₽", "₽₽", "₽₽₽"];
export const STATUS: Record<string, string> = { open: "Открыто", closed: "Закрыто", temporarily_unavailable: "Временно недоступно" };
export const LABELS: Record<string, string> = { interns: "Принимаем стажёров", excursions: "Проводим экскурсии", orders: "Принимаем заказы" };
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const fmtDate = (iso: string, withTime = true) => {
  const d = new Date(iso);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withTime ? `${s}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : s;
};
export const fmtTime = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
export const MONTHS_N = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const monthShort = (iso: string) => MONTHS[new Date(iso).getMonth()].slice(0, 3);

/** Обложка: фото владельца, если загружено, иначе — рисованный пейзаж по типу места в цветах текущей темы. */
/** Иконка (и рисованная сцена) обложки события по его типу */
const EV_ICON: Record<string, string> = { festival: "drama", exhibition: "landmark", masterclass: "pen-tool", open_day: "factory", concert: "music",
  lecture: "telescope", excursion: "camera", hackathon: "building-2", theatre: "drama" };
export const evIcon = (kind?: string) => EV_ICON[kind || ""] || "star";

export function Cover({ color = "#1B4FA3", icon, seed = 1, height = 150, photo, radius = 0, iconSize = 46, badge = true }: {
  color?: string; icon?: string; seed?: number; height?: number | string; photo?: string; radius?: number; iconSize?: number; badge?: boolean;
}) {
  return (
    <div className="cover" style={{ height, borderRadius: radius }}>
      {photo ? <img src={photo} alt="" loading="lazy" /> : <Scene kind={sceneFor(icon)} seed={seed} accent={color} className="scene" />}
      {badge && iconSize >= 24 && (
        <span className="cover-ic" style={{ background: color }}><Icon name={icon} size={Math.min(18, iconSize * 0.4)} /></span>
      )}
    </div>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return <span className="stars"><L.Star size={15} fill="currentColor" />{value ? value.toFixed(1) : "—"}{count != null && <span className="muted tiny" style={{ fontWeight: 400 }}>({count})</span>}</span>;
}

export function Status({ p }: { p: { status: string; open_now?: boolean | null; today_hours?: string } }) {
  if (p.status !== "open") return <span className={`status ${p.status}`}>{STATUS[p.status]}</span>;
  if (p.open_now == null) return <span className="status closed">График уточняйте</span>;
  return <span className={`status ${p.open_now ? "open" : "closed"}`}>{p.open_now ? "Открыто" : "Закрыто"}{p.today_hours && <span className="muted"> · {p.today_hours}</span>}</span>;
}

export function FavButton({ p, big }: { p: PlaceBrief; big?: boolean }) {
  const { isFav, toggleFav } = useStore();
  const on = isFav(p.id);
  if (big) return (
    <button className={`btn ${on ? "active" : "secondary"}`} onClick={() => toggleFav(p)}>
      <L.Heart size={18} fill={on ? "currentColor" : "none"} />{on ? "В избранном" : "В избранное"}
    </button>
  );
  return (
    <button className={`fav-btn ${on ? "on" : ""}`} aria-label={on ? "Убрать из избранного" : "В избранное"}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(p); }}>
      <L.Heart size={18} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

export function PlaceCard({ p }: { p: PlaceBrief }) {
  return (
    <Link to={`/place/${p.slug}`} className="card place-card">
      <div className="fav"><FavButton p={p} /></div>
      <Cover color={p.vertical?.color} icon={p.category?.icon} seed={p.id} photo={p.photos?.[0]} />
      <div className="body">
        <div className="row" style={{ gap: 6 }}>
          <span className="badge cat" style={{ ["--c" as any]: p.vertical?.color }}>{p.category?.name}</span>
          {p.made_in_region && <span className="badge region">Сделано в регионе</span>}
        </div>
        <div className="name">{p.name}</div>
        <div className="small muted" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.short}</div>
        <div className="meta" style={{ marginTop: "auto", paddingTop: 6 }}>
          <Stars value={p.rating} count={p.reviews_count} />
          <Status p={p} />
          {p.distance_m != null && <span>{fmtDist(p.distance_m)}</span>}
          <span>{PRICE[p.price_level]}</span>
        </div>
      </div>
    </Link>
  );
}

export function PlaceRow({ p, onClick, right }: { p: PlaceBrief; onClick?: () => void; right?: React.ReactNode }) {
  const inner = (
    <>
      <div className="thumb"><Cover color={p.vertical?.color} icon={p.category?.icon} seed={p.id} height={84} iconSize={28} photo={p.photos?.[0]} /></div>
      <div className="grow">
        <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
        <div className="tiny muted">{p.category?.name} · {p.address}</div>
        <div className="row tiny" style={{ gap: 10, marginTop: 4 }}><Stars value={p.rating} /><Status p={p} />{p.distance_m != null && <span className="muted">{fmtDist(p.distance_m)}</span>}</div>
      </div>
      {right}
    </>
  );
  return onClick
    ? <div className="card place-row" style={{ cursor: "pointer" }} onClick={onClick}>{inner}</div>
    : <Link to={`/place/${p.slug}`} className="card place-row">{inner}</Link>;
}

export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h2 style={{ fontSize: 20 }}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Закрыть"><L.X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, React.ReactNode][]; value: string; onChange: (v: any) => void }) {
  return <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Empty({ icon = "map-pin", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return <div className="empty"><Icon name={icon} size={40} /><div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 17 }}>{title}</div>{children}</div>;
}

export function Loading({ h = 200 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} aria-label="Загрузка" />;
}

export function ErrorBox({ text, retry }: { text: string; retry?: () => void }) {
  return <Empty icon="info" title="Не удалось загрузить">{text}{retry && <button className="btn secondary sm" onClick={retry}>Повторить</button>}</Empty>;
}

export function VNode({ color, icon, size = 46 }: { color: string; icon: string; size?: number }) {
  return <span className="vnode" style={{ background: color, width: size, height: size, borderRadius: "50%", display: "inline-grid", placeItems: "center", color: "#fff", flexShrink: 0 }}><Icon name={icon} size={size * 0.46} /></span>;
}

export function DynamicField({ f, value, onChange }: { f: any; value: any; onChange: (v: any) => void }) {
  if (f.type === "bool") return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
  if (f.type === "select") return (
    <label className="field">{f.label}{f.required && " *"}
      <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>{(f.options || []).map((o: string) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
  if (f.type === "textarea") return <label className="field" style={{ gridColumn: "1 / -1" }}>{f.label}{f.required && " *"}<textarea className="textarea" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></label>;
  return (
    <label className="field">{f.label}{f.unit ? `, ${f.unit}` : ""}{f.required && " *"}
      <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={value ?? ""}
             onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
    </label>
  );
}
