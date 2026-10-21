import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, UserRound } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import { ErrorBox, Loading, Modal } from "../ui/kit";
import { ApplicationForm, KIND, SITE_STATUS } from "./Investors";

export default function SitePage() {
  const { slug } = useParams();
  const { user } = useStore();
  const nav = useNavigate();
  const { data: s, error, loading, reload } = useAsync(() => api(`/api/invest/sites/${slug}`), [slug]);
  const [apply, setApply] = useState(false);
  if (loading && !s) return <div className="container page"><Loading h={400} /></div>;
  if (error || !s) return <div className="container page"><ErrorBox text={error || ""} retry={reload} /></div>;
  const yes = (b: boolean) => (b ? "есть" : "нет");
  const rows: [string, any][] = [
    ["Тип", KIND[s.kind]], ["Площадь участка", `${s.area_ha} га`], ["Здания", s.building_m2 ? `${s.building_m2.toLocaleString("ru-RU")} м²` : "нет"],
    ["Электроэнергия", `${s.power_mw} МВт`], ["Газ", yes(s.gas)], ["Водоснабжение", yes(s.water)], ["Канализация", yes(s.sewage)],
    ["Ж/д ветка", yes(s.railway)], ["До трассы", `${s.highway_km} км`], ["Собственность", s.ownership], ["Форма сделки", s.deal], ["Стоимость", s.price],
  ];
  return (
    <div className="container page">
      <div className="small muted"><Link to="/investors">Инвесторам</Link></div>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div><div className="row" style={{ gap: 6, marginBottom: 8 }}><span className={`badge ${SITE_STATUS[s.status][1]}`}>{SITE_STATUS[s.status][0]}</span><span className="badge">{s.city}</span></div>
          <h1>{s.name}</h1><p className="lead">{s.description}</p></div>
        <button className="btn primary lg" disabled={s.status === "occupied"} onClick={() => (user ? setApply(true) : nav(`/login?next=/investors/sites/${s.slug}`))}>Подать заявку на площадку</button>
      </div>
      <div className="two-col" style={{ gridTemplateColumns: "1fr 1.1fr", marginTop: 0 }}>
        <div className="stack">
          <div className="panel"><h2 style={{ marginBottom: 14 }}>Паспорт площадки</h2>
            <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></div>
          <div className="panel stack"><h3>Подходит для отраслей</h3><div className="chips">{s.industries.map((x: string) => <span key={x} className="chip">{x}</span>)}</div>
            <h3>Меры поддержки</h3><ul style={{ margin: 0, paddingLeft: 20 }}>{s.benefits.map((b: string) => <li key={b}>{b}</li>)}</ul></div>
          {s.documents.length > 0 && <div className="panel stack"><h3>Документы</h3>{s.documents.map((d: any) => <a key={d.title} href={d.url} className="row" style={{ gap: 8 }}><FileText size={18} />{d.title}</a>)}</div>}
          {s.curator && <div className="panel row" style={{ gap: 12 }}><UserRound size={28} /><div><b>Куратор: {s.curator.name}</b><div className="small muted">{s.curator.email}</div></div></div>}
          {s.residents?.length > 0 && <div className="panel"><h3 style={{ marginBottom: 8 }}>Резиденты</h3>{s.residents.join(", ")}</div>}
        </div>
        <div className="card" style={{ height: 520, overflow: "hidden", position: "sticky", top: 84 }}>
          <MapView center={[s.lat, s.lng]} zoom={14} polygons={[{ id: s.id, coords: s.polygon, color: "#1B4FA3", name: s.name }]} />
        </div>
      </div>
      {apply && <Modal wide title="Единая заявка инвестора" onClose={() => setApply(false)}><ApplicationForm site={s} prefill={{ area_ha: s.area_ha, power_mw: s.power_mw }} onDone={() => setApply(false)} /></Modal>}
    </div>
  );
}
