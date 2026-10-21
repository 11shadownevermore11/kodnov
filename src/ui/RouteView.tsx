import { Link } from "react-router-dom";
import { Coffee, Footprints, Car, Armchair } from "lucide-react";
import MapView from "./MapView";
import { fmtMin, fmtDist } from "./kit";

/** Таймлайн маршрута как цепочка узлов: точки, порядок, время, паузы, переходы. */
export function RouteChain({ tl, transport = "walk", actions }: { tl: any; transport?: string; actions?: (s: any, i: number) => React.ReactNode }) {
  return (
    <div className="chain">
      {tl.stops.map((s: any, i: number) => (
        <div key={`${s.place.id}-${i}`}>
          {i > 0 && s.travel_min > 0 && (
            <div className="chain-move">{transport === "car" ? <Car size={14} /> : <Footprints size={14} />}{fmtMin(s.travel_min)} · {fmtDist(s.travel_m)}</div>
          )}
          <div className={`chain-item ${s.kind === "pause" ? "pause" : ""}`}>
            <span className="knot" style={{ background: s.place.vertical?.color }}>{s.kind === "pause" ? (s.pause_type === "rest" ? <Armchair size={14} /> : <Coffee size={14} />) : s.order}</span>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}><span className="time">{s.arrive}–{s.leave}</span>{s.kind === "pause" && <span className="badge">Пауза</span>}</div>
                <Link to={`/place/${s.place.slug}`} style={{ fontWeight: 600, fontSize: 16.5 }}>{s.place.name}</Link>
                <div className="small muted">{s.place.category?.name} · {fmtMin(s.stay_min)}{s.place.open_now === false && s.place.status === "open" ? " · сейчас закрыто" : ""}</div>
                {s.note && <div className="small" style={{ marginTop: 4 }}>{s.note}</div>}
              </div>
              {actions?.(s, i)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RouteMap({ tl, color, user }: { tl: any; color?: string; user?: any }) {
  return (
    <MapView fit numbered user={user} polyline={tl.polyline} polylineColor={color || "#17191F"}
             points={tl.stops.map((s: any) => ({ id: s.place.id * 100 + s.order, lat: s.place.lat, lng: s.place.lng, color: s.kind === "pause" ? "#7A8292" : s.place.vertical?.color, name: `${s.order}. ${s.place.name}`, slug: s.place.slug, order: s.order, sub: `${s.arrive}–${s.leave}` }))} />
  );
}

/** Мини-схема маршрута для карточек: те же узлы и связи. */
export function RouteSketch({ polyline, color }: { polyline: [number, number][]; color: string }) {
  if (!polyline?.length) return null;
  const la = polyline.map((p) => p[0]), ln = polyline.map((p) => p[1]);
  const [a, b, c, d] = [Math.min(...la), Math.max(...la), Math.min(...ln), Math.max(...ln)];
  const xy = polyline.map((p) => [10 + ((p[1] - c) / (d - c || 1)) * 180, 10 + (1 - (p[0] - a) / (b - a || 1)) * 90]);
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <polyline points={xy.map((q) => q.join(",")).join(" ")} fill="none" stroke="var(--ink)" strokeWidth="2" />
      {xy.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={i === 0 || i === xy.length - 1 ? 6 : 4.5} fill={color} stroke="var(--surface-2)" strokeWidth="2" />)}
    </svg>
  );
}
