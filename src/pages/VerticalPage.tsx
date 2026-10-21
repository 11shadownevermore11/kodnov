import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { DynamicField, Empty, ErrorBox, Icon, LABELS, Loading, Modal, PlaceCard } from "../ui/kit";
import { EventRow } from "./Events";
import { RouteCard } from "./RoutesPage";

/** Страница вертикали строится целиком из конфигурации: категории, поля, форма заявки — всё из админки. */
export default function VerticalPage() {
  const { slug } = useParams();
  const { toast } = useStore();
  const { data: v, error, loading, reload } = useAsync(() => api(`/api/verticals/${slug}`), [slug]);
  const [cat, setCat] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [form, setForm] = useState<any>(null);
  if (loading && !v) return <div className="container page"><Loading h={400} /></div>;
  if (error || !v) return <div className="container page"><ErrorBox text={error || ""} retry={reload} /></div>;
  const places = v.places.filter((p: any) => (!cat || p.category.slug === cat) && (!label || p.labels.includes(label)));
  const creative = v.slug === "creative";
  return (
    <div className="container page">
      <div className="page-head">
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: v.color, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={v.icon} size={30} /></span>
          <div><h1>{v.name}</h1><p className="lead" style={{ marginTop: 8 }}>{v.description}</p></div>
        </div>
        {v.form_fields?.length > 0 && <button className="btn primary" onClick={() => setForm({})}>{v.form_title}</button>}
      </div>

      <div className="chips scroll" style={{ marginBottom: 12 }}>
        <button className={`chip ${!cat ? "on" : ""}`} onClick={() => setCat("")}>Все ({v.places.length})</button>
        {v.categories.map((c: any) => {
          const n = v.places.filter((p: any) => p.category.slug === c.slug).length;
          if (!n) return null; // пустые категории не показываем — появятся, когда добавят место
          return <button key={c.slug} className={`chip ${cat === c.slug ? "on" : ""}`} onClick={() => setCat(c.slug)}><Icon name={c.icon} size={15} />{c.name} ({n})</button>;
        })}
      </div>
      {creative && (
        <div className="chips" style={{ marginBottom: 20 }}>
          {Object.entries(LABELS).map(([k, l]) => <button key={k} className={`chip ${label === k ? "on" : ""}`} onClick={() => setLabel(label === k ? "" : k)}>{l}</button>)}
        </div>
      )}
      {places.length ? <div className="grid">{places.map((p: any) => <PlaceCard key={p.id} p={p} />)}</div> : <Empty icon={v.icon} title="В этой категории пока нет объектов">Владельцы могут добавить своё предприятие через кабинет бизнеса<Link to="/cabinet" className="btn secondary sm">Добавить предприятие</Link></Empty>}

      {v.routes.length > 0 && <section className="section"><h2 style={{ marginBottom: 16 }}>Маршруты</h2><div className="grid">{v.routes.map((r: any) => <RouteCard key={r.id} r={r} />)}</div></section>}
      {v.events.length > 0 && <section className="section"><h2 style={{ marginBottom: 16 }}>Ближайшие события</h2><div className="col">{v.events.map((e: any) => <EventRow key={e.id} e={{ ...e, vertical: { color: v.color } }} />)}</div></section>}
      {v.opportunities.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Стажировки и вакансии</h2><Link to="/careers" className="btn secondary">Все возможности</Link></div>
          <div className="grid">{v.opportunities.map((o: any) => <div key={o.id} className="card pad col"><span className="badge">{o.kind === "internship" ? "Стажировка" : o.kind === "vacancy" ? "Вакансия" : o.kind === "course" ? "Курс" : "Наставник"}</span><b>{o.title}</b><span className="small muted">{o.org}</span></div>)}</div>
        </section>
      )}
      {creative && (
        <section className="section panel">
          <h3>Правила размещения материалов</h3>
          <p className="small muted" style={{ marginTop: 8, maxWidth: "80ch" }}>Загружая работы в портфолио, владелец подтверждает права на материалы. Если вы обнаружили свою работу без разрешения — откройте карточку организации и нажмите «Пожаловаться на нарушение авторских прав». Модератор рассмотрит жалобу в течение 3 рабочих дней.</p>
        </section>
      )}
      {form && (
        <Modal title={v.form_title} onClose={() => setForm(null)}>
          <div className="stack">
            <div className="form-grid">{v.form_fields.map((f: any) => <DynamicField key={f.key} f={f} value={form[f.key]} onChange={(val) => setForm({ ...form, [f.key]: val })} />)}</div>
            <button className="btn primary" onClick={async () => { try { const r = await api(`/api/verticals/${v.slug}/submit`, { body: { data: form } }); toast(r.message); setForm(null); } catch (e: any) { toast(e.message, "err"); } }}>Отправить</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
