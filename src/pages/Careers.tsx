import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Empty, Loading, Modal } from "../ui/kit";

const KINDS: [string, string][] = [["", "Все"], ["internship", "Стажировки"], ["course", "Курсы"], ["vacancy", "Вакансии"], ["mentor", "Наставники"]];

const ONE: Record<string, string> = { internship: "Стажировка", course: "Курс", vacancy: "Вакансия", mentor: "Наставник" };

export default function Careers() {
  const { toast } = useStore();
  const [kind, setKind] = useState("");
  const { data, loading } = useAsync(() => api<any[]>(`/api/opportunities${kind ? `?kind=${kind}` : ""}`), [kind]);
  const [open, setOpen] = useState<any>(null);
  return (
    <div className="container page">
      <div className="page-head"><div><h1>Кадры и образование</h1><p className="lead">Стажировки, курсы, вакансии и наставники в креативных индустриях и на предприятиях региона. Записывайтесь на экскурсии в студии и мастер-классы.</p></div></div>
      <div className="seg" style={{ marginBottom: 20 }}>{KINDS.map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
      {loading ? <Loading h={300} /> : !data?.length ? <Empty icon="graduation-cap" title="Пока ничего нет" /> : (
        <div className="grid">
          {data.map((o) => (
            <div key={o.id} className="card pad col" style={{ gap: 8 }}>
              <div className="row between"><span className="badge blue">{ONE[o.kind]}</span><span className="tiny muted">{o.format}</span></div>
              <b style={{ fontSize: 17 }}>{o.title}</b>
              {o.place ? <Link to={`/place/${o.place.slug}`} className="small" style={{ color: "var(--blue)" }}>{o.org}</Link> : <span className="small">{o.org}</span>}
              <p className="small muted">{o.description}</p>
              <div className="row small" style={{ marginTop: "auto", gap: 12 }}>{o.salary && <b>{o.salary}</b>}{o.deadline && <span className="muted">до {new Date(o.deadline).toLocaleDateString("ru-RU")}</span>}</div>
              <button className="btn secondary sm" onClick={async () => { const r = await api(`/api/opportunities/${o.id}/apply`, { method: "POST" }); setOpen({ ...o, contact: r.contact }); }}>Откликнуться</button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          <div className="stack"><p>Напишите организации «{open.org}», укажите, что нашли предложение на платформе «Код Новороссии».</p>
            <div className="promo-code" style={{ fontSize: 18 }}>{open.contact}</div>
            <button className="btn primary" onClick={() => { navigator.clipboard?.writeText(open.contact); toast("Контакт скопирован"); setOpen(null); }}>Скопировать контакт</button></div>
        </Modal>
      )}
    </div>
  );
}
