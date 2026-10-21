import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as I from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import { Empty, fmtDate, Loading, Modal } from "../ui/kit";

export const SITE_STATUS: Record<string, [string, string]> = { free: ["Свободна", "ok"], reserved: ["Зарезервирована", "warn"], occupied: ["Занята", ""] };
export const KIND: Record<string, string> = { greenfield: "Гринфилд", brownfield: "Браунфилд", technopark: "Технопарк", office: "Офисы" };
export const APP_STATUS: Record<string, string> = { new: "Новая", in_review: "На рассмотрении", site_proposed: "Предложена площадка", negotiations: "Переговоры", approved: "Одобрена", rejected: "Отклонена" };
const INDUSTRIES = ["машиностроение", "пищевая промышленность", "логистика", "IT", "креативные индустрии", "лёгкая промышленность", "металлургия", "сельское хозяйство", "стройматериалы"];
const NEEDS: [string, string][] = [["gas", "Газ"], ["water", "Вода"], ["sewage", "Канализация"], ["railway", "Ж/д ветка"]];

export function ApplicationForm({ site, prefill, onDone }: { site?: any; prefill?: any; onDone: () => void }) {
  const { user, toast } = useStore();
  const [f, setF] = useState<any>({ project: "", company: user?.investor_profile?.company || "", inn: user?.investor_profile?.inn || "", industry: prefill?.industry || "", investment_mln: "", jobs: "", need_area_ha: prefill?.area_ha || "", need_power_mw: prefill?.power_mw || "", needs: prefill?.needs || [], support: [], contact: user?.email || "", comment: "" });
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const send = async () => {
    try {
      const r = await api("/api/invest/applications", { body: { ...f, site_id: site?.id, investment_mln: Number(f.investment_mln) || 0, jobs: Number(f.jobs) || 0, need_area_ha: Number(f.need_area_ha) || 0, need_power_mw: Number(f.need_power_mw) || 0 } });
      setDone(r);
    } catch (e: any) { toast(e.message, "err"); }
  };
  if (done) return (
    <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 12 }}>
      <I.CircleCheck size={48} color="var(--ok)" />
      <h2>Заявка {done.number} принята</h2>
      <p className="muted">Куратор свяжется с вами в течение 2 рабочих дней. Статус и переписка — в личном кабинете.</p>
      <Link to="/profile#applications" className="btn primary" onClick={onDone}>Открыть мои заявки</Link>
    </div>
  );
  return (
    <div className="stack">
      {site && <div className="badge blue" style={{ height: "auto", padding: "8px 12px" }}>Площадка: {site.name}</div>}
      <div className="form-grid">
        <label className="field" style={{ gridColumn: "1 / -1" }}>Название проекта *<input className="input" value={f.project} onChange={(e) => set("project", e.target.value)} placeholder="Например: завод металлоконструкций" /></label>
        <label className="field">Компания<input className="input" value={f.company} onChange={(e) => set("company", e.target.value)} /></label>
        <label className="field">ИНН<input className="input" value={f.inn} onChange={(e) => set("inn", e.target.value)} /></label>
        <label className="field">Отрасль<select className="select" value={f.industry} onChange={(e) => set("industry", e.target.value)}><option value="">—</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field">Инвестиции, млн ₽<input className="input" type="number" value={f.investment_mln} onChange={(e) => set("investment_mln", e.target.value)} /></label>
        <label className="field">Рабочих мест<input className="input" type="number" value={f.jobs} onChange={(e) => set("jobs", e.target.value)} /></label>
        <label className="field">Нужна площадь, га<input className="input" type="number" value={f.need_area_ha} onChange={(e) => set("need_area_ha", e.target.value)} /></label>
        <label className="field">Нужна мощность, МВт<input className="input" type="number" value={f.need_power_mw} onChange={(e) => set("need_power_mw", e.target.value)} /></label>
        <label className="field">Контакт<input className="input" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></label>
      </div>
      <div><div className="small muted" style={{ marginBottom: 6 }}>Интересующие меры поддержки</div>
        <div className="chips">{["Режим СЭЗ", "Льготный заём", "Субсидия на техприсоединение", "Подбор кадров", "Сопровождение разрешений"].map((s) => <button key={s} className={`chip ${f.support.includes(s) ? "on" : ""}`} onClick={() => set("support", f.support.includes(s) ? f.support.filter((x: string) => x !== s) : [...f.support, s])}>{s}</button>)}</div></div>
      <label className="field">Комментарий<textarea className="textarea" value={f.comment} onChange={(e) => set("comment", e.target.value)} /></label>
      <button className="btn primary lg" onClick={send} disabled={!f.project}>Подать единую заявку</button>
    </div>
  );
}

function BeforeAfter({ s }: { s: any }) {
  const [v, setV] = useState(50);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="ba">
        <div style={{ background: "linear-gradient(135deg,#4b5563,#1f2937)" }}><span className="badge" style={{ alignSelf: "flex-start" }}>Было, {s.before.year}</span><p style={{ marginTop: 10, maxWidth: "36ch" }}>{s.before.text}</p></div>
        <div style={{ background: "linear-gradient(135deg,#1B4FA3,#7B3FE4)", clipPath: `inset(0 0 0 ${v}%)`, alignItems: "flex-end", textAlign: "right" }}><span className="badge ok" style={{ background: "#fff" }}>Стало, {s.after.year}</span><p style={{ marginTop: 10, maxWidth: "36ch" }}>{s.after.text}</p></div>
        <input type="range" min={0} max={100} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Сравнить было и стало" />
      </div>
      <div style={{ padding: 16 }}><b>{s.name}</b><div className="small muted">Резиденты: {s.residents.join(", ")}</div></div>
    </div>
  );
}

export default function Investors() {
  const { user } = useStore();
  const nav = useNavigate();
  const sites = useAsync(() => api<any[]>("/api/invest/sites"), []);
  const mine = useAsync(() => (user ? api<any[]>("/api/me/applications") : Promise.resolve([])), [user?.id]);
  const [crit, setCrit] = useState<any>({ industry: "", area_ha: 5, power_mw: 2, needs: [] as string[], kind: "" });
  const [results, setResults] = useState<any[] | null>(null);
  const [apply, setApply] = useState<{ site?: any } | null>(null);
  const match = async () => setResults(await api("/api/invest/match", { body: crit }));
  const openApply = (site?: any) => { if (!user) { nav("/login?next=/investors"); return; } setApply({ site }); };

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Инвесторам: одно окно</h1><p className="lead">Подберите площадку под проект, подайте единую заявку — куратор проведёт через все согласования. Инвестор — это профиль обычного пользователя, отдельная регистрация не нужна.</p></div>
        <button className="btn primary lg" onClick={() => openApply()}>Подать заявку</button>
      </div>
      <div className="panel">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[["Подбор площадки", "Мастер сравнит площадки с требованиями проекта"], ["Единая заявка", "Одна форма вместо обращений в разные ведомства"], ["Куратор", "Персональный сопровождающий и статус онлайн"], ["Запуск", "Меры поддержки: СЭЗ, льготные займы, субсидии"]].map(([t, d], i) => (
            <div key={t} className="row" style={{ alignItems: "flex-start", gap: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--red)", color: "var(--on-accent)", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              <div><b>{t}</b><div className="small muted">{d}</div></div>
            </div>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><h2>Каталог площадок</h2><p className="muted">Контуры на карте, паспорт с инфраструктурой, статусом и документами</p></div></div>
        <div className="two-col" style={{ gridTemplateColumns: "1fr 1.2fr", marginTop: 0 }}>
          <div className="col" style={{ maxHeight: 520, overflow: "auto" }}>
            {sites.loading && <Loading h={400} />}
            {(sites.data || []).map((s) => (
              <Link key={s.id} to={`/investors/sites/${s.slug}`} className="card" style={{ padding: 14 }}>
                <div className="row between"><b>{s.name}</b><span className={`badge ${SITE_STATUS[s.status][1]}`}>{SITE_STATUS[s.status][0]}</span></div>
                <div className="small muted">{KIND[s.kind]} · {s.city}</div>
                <div className="row small" style={{ gap: 14, marginTop: 6 }}><span><b>{s.area_ha}</b> га</span><span><b>{s.power_mw}</b> МВт</span>{s.gas && <span>газ</span>}{s.railway && <span>ж/д</span>}{s.building_m2 > 0 && <span>{s.building_m2.toLocaleString("ru-RU")} м²</span>}</div>
              </Link>
            ))}
          </div>
          <div className="card" style={{ height: 520, overflow: "hidden" }}>
            {sites.data && <MapView fit center={[47.95, 37.85]} zoom={9}
              polygons={sites.data.map((s) => ({ id: s.id, coords: s.polygon, color: s.status === "free" ? "#1B4FA3" : s.status === "reserved" ? "#E58A00" : "#7A8292", name: `${s.name}: ${s.area_ha} га`, onClick: () => nav(`/investors/sites/${s.slug}`) }))}
              points={sites.data.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, color: s.status === "free" ? "#1B4FA3" : "#E58A00", icon: "briefcase", name: s.name, sub: `${s.area_ha} га`, slug: undefined }))}
              onPointClick={(p) => { const s = sites.data!.find((x) => x.id === p.id); if (s) nav(`/investors/sites/${s.slug}`); }} />}
          </div>
        </div>
      </section>

      <section className="section panel" id="wizard">
        <h2>Мастер подбора площадки</h2>
        <p className="muted" style={{ marginTop: 6 }}>Укажите требования проекта — сравним все площадки и объясним, почему подходит или нет.</p>
        <div className="form-grid" style={{ marginTop: 18 }}>
          <label className="field">Отрасль<select className="select" value={crit.industry} onChange={(e) => setCrit({ ...crit, industry: e.target.value })}><option value="">Любая</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field">Тип площадки<select className="select" value={crit.kind} onChange={(e) => setCrit({ ...crit, kind: e.target.value })}><option value="">Любой</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">Площадь: {crit.area_ha} га<input type="range" min={0} max={60} step={0.5} value={crit.area_ha} onChange={(e) => setCrit({ ...crit, area_ha: Number(e.target.value) })} style={{ accentColor: "var(--blue)" }} /></label>
          <label className="field">Мощность: {crit.power_mw} МВт<input type="range" min={0} max={30} step={0.5} value={crit.power_mw} onChange={(e) => setCrit({ ...crit, power_mw: Number(e.target.value) })} style={{ accentColor: "var(--blue)" }} /></label>
        </div>
        <div className="chips" style={{ marginTop: 14 }}>{NEEDS.map(([k, l]) => <button key={k} className={`chip ${crit.needs.includes(k) ? "on" : ""}`} onClick={() => setCrit({ ...crit, needs: crit.needs.includes(k) ? crit.needs.filter((x: string) => x !== k) : [...crit.needs, k] })}>{l}</button>)}</div>
        <button className="btn blue lg" style={{ marginTop: 18 }} onClick={match}><I.Search size={18} />Подобрать</button>
        {results && (
          <div className="col" style={{ marginTop: 20 }}>
            {results.map((r) => (
              <div key={r.site.id} className="card row" style={{ padding: 16, gap: 18, alignItems: "flex-start" }}>
                <div style={{ textAlign: "center", minWidth: 64 }}>
                  <div style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 600, color: r.score >= 70 ? "var(--ok)" : r.score >= 40 ? "var(--warn)" : "var(--ink-3)" }}>{r.score}%</div>
                  <div className="tiny muted">совпадение</div>
                </div>
                <div className="grow">
                  <Link to={`/investors/sites/${r.site.slug}`} style={{ fontWeight: 600, fontSize: 17 }}>{r.site.name}</Link>
                  <div className="small muted">{KIND[r.site.kind]} · {r.site.city} · {r.site.area_ha} га · {r.site.power_mw} МВт</div>
                  <div className="chips" style={{ marginTop: 8 }}>
                    {r.reasons.map((x: string) => <span key={x} className="badge ok">✓ {x}</span>)}
                    {r.misses.map((x: string) => <span key={x} className="badge warn">{x}</span>)}
                  </div>
                </div>
                <button className="btn secondary sm" onClick={() => openApply(r.site)}>Заявка на площадку</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><div><h2>Новая жизнь площадок</h2><p className="muted">Как пустующие промышленные территории становятся кластерами и производствами. Двигайте ползунок.</p></div></div>
        <div className="grid two">{(sites.data || []).filter((s) => s.before?.text).map((s) => <BeforeAfter key={s.id} s={s} />)}</div>
      </section>

      {user && (
        <section className="section" id="applications">
          <h2 style={{ marginBottom: 16 }}>Мои заявки</h2>
          {mine.data?.length ? <div className="col">{mine.data.map((a) => <ApplicationCard key={a.id} a={a} />)}</div> : <Empty icon="briefcase" title="Заявок пока нет" />}
        </section>
      )}

      {apply && <Modal wide title="Единая заявка инвестора" onClose={() => { setApply(null); mine.reload(); }}><ApplicationForm site={apply.site} prefill={crit} onDone={() => setApply(null)} /></Modal>}
    </div>
  );
}

export function ApplicationCard({ a }: { a: any }) {
  const order = ["new", "in_review", "site_proposed", "negotiations", "approved"];
  const idx = order.indexOf(a.status);
  return (
    <div className="card pad stack">
      <div className="row between"><div><b>{a.number}: {a.project}</b><div className="small muted">{a.site ? `Площадка: ${a.site.name}` : "Площадка подбирается"}{a.curator ? ` · куратор ${a.curator.name}` : ""}</div></div>
        <span className={`badge ${a.status === "approved" ? "ok" : a.status === "rejected" ? "err" : "blue"}`}>{APP_STATUS[a.status]}</span></div>
      {a.status !== "rejected" && (
        <div className="row" style={{ gap: 0 }}>
          {order.map((s, i) => (
            <div key={s} className="grow" style={{ display: "flex", alignItems: "center" }}>
              <span title={APP_STATUS[s]} style={{ width: 14, height: 14, borderRadius: "50%", background: i <= idx ? "var(--blue)" : "var(--line)", flexShrink: 0 }} />
              {i < order.length - 1 && <span style={{ height: 2, flex: 1, background: i < idx ? "var(--blue)" : "var(--line)" }} />}
            </div>
          ))}
        </div>
      )}
      <div className="col" style={{ gap: 4 }}>
        {[...(a.history || [])].reverse().map((h: any, i: number) => <div key={i} className="small"><span className="muted">{fmtDate(h.at)} · {h.by}:</span> {h.comment}</div>)}
      </div>
    </div>
  );
}
