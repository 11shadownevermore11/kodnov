import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock, Footprints, MapPin, Navigation, Pencil, Share2 } from "lucide-react";
import { api, track } from "../api";
import { useAsync, useStore } from "../store";
import { ErrorBox, fmtMin, Loading } from "../ui/kit";
import { RouteChain, RouteMap } from "../ui/RouteView";

export default function RoutePage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { geo, toast } = useStore();
  const [start, setStart] = useState("");
  const { data: r, error, loading, reload } = useAsync(() => api(`/api/routes/${slug}${start ? `?start=${start}` : ""}`), [slug, start]);
  if (loading && !r) return <div className="container page"><Loading h={500} /></div>;
  if (error || !r) return <div className="container page"><ErrorBox text={error || ""} retry={reload} /></div>;

  const openNav = () => {
    const pts = r.stops.map((s: any) => `${s.place.lat},${s.place.lng}`).join("~");
    window.open(`https://yandex.ru/maps/?rtext=${geo ? `${geo.lat},${geo.lng}~` : ""}${pts}&rtt=${r.transport === "car" ? "auto" : "pd"}`, "_blank");
    r.stops.forEach((s: any) => track("route_build", s.place.id));
  };
  const edit = () => { try { sessionStorage.setItem("kod-builder", JSON.stringify(r.stops.map((s: any) => s.place.id))); } catch { /* */ } nav("/routes/builder"); };

  return (
    <div className="container page">
      <div className="small muted"><Link to="/routes">Маршруты</Link></div>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>{r.verticals.map((v: any) => <span key={v.slug} className="badge cat" style={{ ["--c" as any]: v.color }}>{v.name}</span>)}</div>
          <h1>{r.title}</h1>
          {r.subtitle && <p className="lead">{r.subtitle}</p>}
        </div>
        <div className="row">
          <button className="btn secondary" onClick={async () => { try { navigator.share ? await navigator.share({ title: r.title, url: location.href }) : (await navigator.clipboard.writeText(location.href), toast("Ссылка скопирована")); } catch { /* */ } }}><Share2 size={18} />Поделиться</button>
          <button className="btn secondary" onClick={edit}><Pencil size={18} />Изменить под себя</button>
          <button className="btn primary" onClick={openNav}><Navigation size={18} />Начать маршрут</button>
        </div>
      </div>
      <div className="row" style={{ gap: 24, marginBottom: 20 }}>
        <span className="row" style={{ gap: 6 }}><MapPin size={18} /><b>{r.stops.length}</b> точек</span>
        <span className="row" style={{ gap: 6 }}><Clock size={18} /><b>{fmtMin(r.duration_min)}</b> ({r.start}–{r.finish})</span>
        <span className="row" style={{ gap: 6 }}><Footprints size={18} /><b>{r.distance_km} км</b> {r.transport === "car" ? "на машине" : "пешком"}</span>
        <label className="row small" style={{ gap: 8 }}>Начало в
          <input type="time" className="input" style={{ width: 120, height: 36 }} value={start || r.start} onChange={(e) => setStart(e.target.value)} /></label>
      </div>
      <div className="two-col" style={{ gridTemplateColumns: "1fr 1.1fr", marginTop: 0 }}>
        <div className="panel">
          {r.description && <p className="muted" style={{ marginBottom: 20 }}>{r.description}</p>}
          <RouteChain tl={r} transport={r.transport} />
        </div>
        <div className="card" style={{ height: 560, overflow: "hidden", position: "sticky", top: 84 }}><RouteMap tl={r} color={r.color} user={geo} /></div>
      </div>
    </div>
  );
}
