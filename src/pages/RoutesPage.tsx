import { Link } from "react-router-dom";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Empty, fmtMin, Loading } from "../ui/kit";
import { RouteSketch } from "../ui/RouteView";

export function RouteCard({ r, onDelete }: { r: any; onDelete?: () => void }) {
  return (
    <Link to={`/routes/${r.slug}`} className="card route-card">
      <div className="mini"><RouteSketch polyline={r.polyline} color={r.color} /></div>
      <div style={{ padding: 16 }} className="col">
        <div className="row" style={{ gap: 6 }}>{r.verticals.map((v: any) => <span key={v.slug} className="badge cat" style={{ ["--c" as any]: v.color }}>{v.name}</span>)}</div>
        <h3 style={{ fontSize: 18 }}>{r.title}</h3>
        {r.subtitle && <p className="small muted">{r.subtitle}</p>}
        <div className="row small" style={{ gap: 14 }}>
          <span><b>{r.stops_count}</b> точек</span><span><b>{fmtMin(r.duration_min)}</b></span><span><b>{r.distance_km}</b> км</span>
          <span className="muted">{r.transport === "car" ? "на машине" : "пешком"}</span>
          {r.pauses > 0 && <span className="muted">{r.pauses} {r.pauses === 1 ? "пауза" : "паузы"}</span>}
        </div>
        {onDelete && <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={(e) => { e.preventDefault(); onDelete(); }}><Trash2 size={15} />Удалить</button>}
      </div>
    </Link>
  );
}

export default function RoutesPage() {
  const { user, toast } = useStore();
  const curated = useAsync(() => api<any[]>("/api/routes"), []);
  const mine = useAsync(() => (user ? api<any[]>("/api/me/routes") : Promise.resolve([])), [user?.id]);
  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Маршруты</h1><p className="lead">Готовые тематические маршруты объединяют места разных направлений: музеи, театры, заводы и кафе — с временем, паузами и длительностью.</p></div>
        <div className="row"><Link to="/routes/builder" className="btn primary"><Sparkles size={18} />Собрать свой маршрут</Link></div>
      </div>
      {curated.loading ? <div className="grid">{[1, 2, 3].map((i) => <Loading key={i} h={300} />)}</div> : <div className="grid">{(curated.data || []).map((r) => <RouteCard key={r.id} r={r} />)}</div>}
      <section className="section">
        <div className="section-head"><div><h2>Мои маршруты</h2><p className="muted">Собирайте из избранного — порядок оптимизируется по расстоянию</p></div></div>
        {!user ? <Empty icon="map-pin" title="Личные маршруты сохраняются в аккаунте"><Link to="/login?next=/routes" className="btn secondary">Войти</Link><span className="small">Без входа конструктор тоже работает — просто без сохранения</span></Empty>
          : mine.data?.length ? <div className="grid">{mine.data.map((r) => <RouteCard key={r.id} r={r} onDelete={async () => { await api(`/api/me/routes/${r.id}`, { method: "DELETE" }); toast("Маршрут удалён"); mine.reload(); }} />)}</div>
            : <Empty icon="map-pin" title="Пока нет своих маршрутов"><Link to="/routes/builder" className="btn secondary"><Plus size={16} />Создать маршрут</Link></Empty>}
      </section>
    </div>
  );
}
