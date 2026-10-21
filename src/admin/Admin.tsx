import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import * as I from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import { Empty, fmtDate, Loading } from "../ui/kit";
import Crud, { FieldDef, modBadge, ModActions } from "./Crud";
import { PlaceEditor } from "../pages/Cabinet";
import { APP_STATUS } from "../pages/Investors";

// ---------- Конструктор полей (типы объектов и формы заявок вертикали) ----------
export function FieldsBuilder({ value, onChange, form }: { value: any[]; onChange: (v: any[]) => void; form?: boolean }) {
  const list = value || [];
  const upd = (i: number, k: string, v: any) => onChange(list.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <div className="col" style={{ gap: 8 }}>
      {list.map((f, i) => (
        <div key={i} className="card" style={{ padding: 10 }}>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            <input className="input" placeholder="Ключ (латиницей)" value={f.key} onChange={(e) => upd(i, "key", e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase())} />
            <input className="input" placeholder="Подпись" value={f.label} onChange={(e) => upd(i, "label", e.target.value)} />
            <select className="select" value={f.type} onChange={(e) => upd(i, "type", e.target.value)}>
              {[["text", "Текст"], ["textarea", "Многострочный"], ["number", "Число"], ["bool", "Да/нет"], ["select", "Список"], ["date", "Дата"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {f.type === "select" && <input className="input" placeholder="Варианты через запятую" value={(f.options || []).join(", ")} onChange={(e) => upd(i, "options", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />}
            {!form && f.type === "number" && <input className="input" placeholder="Ед. изм." value={f.unit || ""} onChange={(e) => upd(i, "unit", e.target.value)} />}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {!form && <label className="check small"><input type="checkbox" checked={!!f.filterable} onChange={(e) => upd(i, "filterable", e.target.checked)} />Фильтр в каталоге</label>}
            <label className="check small"><input type="checkbox" checked={!!f.required} onChange={(e) => upd(i, "required", e.target.checked)} />Обязательное</label>
            <button type="button" className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => onChange(list.filter((_, j) => j !== i))}><I.Trash2 size={14} />Убрать</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn secondary sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...list, { key: `field_${list.length + 1}`, label: "", type: "text" }])}><I.Plus size={15} />Добавить поле</button>
    </div>
  );
}

function StopsEditor({ value, onChange }: { value: any[]; onChange: (v: any[]) => void }) {
  const places = useAsync(() => api<any>("/api/places?limit=500&sort=name"), []);
  const list = value || [];
  const upd = (i: number, k: string, v: any) => onChange(list.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i: number, d: number) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="col" style={{ gap: 6 }}>
      {list.map((s, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <b style={{ width: 22 }}>{i + 1}</b>
          <select className="select grow" value={s.place_id} onChange={(e) => upd(i, "place_id", Number(e.target.value))}>{(places.data?.items || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className="input" type="number" style={{ width: 90 }} title="Минут на месте" value={s.stay_min || ""} onChange={(e) => upd(i, "stay_min", Number(e.target.value))} />
          <select className="select" style={{ width: 130 }} value={s.kind === "pause" ? s.pause_type || "cafe" : "visit"} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, kind: e.target.value === "visit" ? "visit" : "pause", pause_type: e.target.value === "visit" ? null : e.target.value } : x)))}>
            <option value="visit">Посещение</option><option value="cafe">Пауза: кафе</option><option value="rest">Пауза: отдых</option></select>
          <input className="input" style={{ width: 180 }} placeholder="Заметка" value={s.note || ""} onChange={(e) => upd(i, "note", e.target.value)} />
          <button type="button" className="icon-btn" onClick={() => move(i, -1)}><I.ArrowUp size={14} /></button>
          <button type="button" className="icon-btn" onClick={() => onChange(list.filter((_, j) => j !== i))}><I.Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn secondary sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...list, { place_id: places.data?.items?.[0]?.id, stay_min: 45, kind: "visit" }])}><I.Plus size={15} />Добавить точку</button>
    </div>
  );
}

function PolygonEditor({ value, onChange, row }: { value: any[]; onChange: (v: any[]) => void; row: any }) {
  const pts: [number, number][] = value || [];
  return (
    <div className="stack">
      <div style={{ height: 300, borderRadius: 12, overflow: "hidden" }}>
        <MapView center={[row.lat || 48.008, row.lng || 37.804]} zoom={14} polygons={pts.length > 2 ? [{ id: 1, coords: pts, color: "#1B4FA3", name: row.name || "Площадка" }] : []}
                 points={pts.map((p, i) => ({ id: i, lat: p[0], lng: p[1], color: "#1B4FA3", name: `Вершина ${i + 1}`, order: i + 1 }))} numbered
                 onMapClick={(lat, lng) => onChange([...pts, [Number(lat.toFixed(6)), Number(lng.toFixed(6))]])} />
      </div>
      <div className="row"><span className="small muted">Кликайте по карте, чтобы обвести контур площадки ({pts.length} вершин)</span>
        <button type="button" className="btn ghost sm" onClick={() => onChange(pts.slice(0, -1))}>Убрать последнюю</button><button type="button" className="btn ghost sm" onClick={() => onChange([])}>Очистить</button></div>
    </div>
  );
}

// ---------- Дашборд ----------
function Dashboard() {
  const { user } = useStore();
  const q = useAsync(() => api("/api/admin/queue"), []);
  const a = useAsync(() => (user?.role === "admin" ? api("/api/admin/analytics") : Promise.resolve(null)), []);
  const nav = useNavigate();
  return (
    <div className="stack">
      <h2>Обзор</h2>
      {q.data && (
        <div className="kpis">
          {[["Жалобы на отзывы", q.data.complaints, q.data.complaints_overdue ? `${q.data.complaints_overdue} близко к сроку 24 ч` : "срок — 24 часа", "complaints"],
            ["Верификация владельцев", q.data.verifications, "срок — 3 рабочих дня", "verifications"],
            ["Сообщения о неточностях", q.data.reports, "", "reports"], ["Авторские права", q.data.copyright, "", "copyright"],
            ["Объекты на модерации", q.data.places, "", "places"], ["События на модерации", q.data.events, "", "events"],
            ["Материалы жителей", q.data.stories, "", "stories"], ["Заявки инвесторов", q.data.applications, "новые и в работе", "applications"]].map(([l, v, sub, to]) => (
            <button key={l as string} className="card kpi" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => nav(`/admin/${to}`)}>
              <span className="small muted">{l}</span><b style={{ color: (v as number) > 0 ? "var(--red)" : undefined }}>{v}</b>{sub && <span className="tiny muted">{sub}</span>}
            </button>
          ))}
        </div>
      )}
      {a.data && (
        <>
          <h2 style={{ marginTop: 16 }}>Аналитика за 30 дней</h2>
          <div className="kpis">{[["Пользователи", a.data.kpi.users], ["Объекты", a.data.kpi.places], ["Отзывы", a.data.kpi.reviews], ["Средняя оценка", a.data.kpi.avg_rating], ["Избранное", a.data.kpi.favorites], ["Записи", a.data.kpi.bookings], ["Промокоды", a.data.kpi.promo_activations], ["Заявки инвесторов", a.data.kpi.applications]].map(([l, v]) => <div key={l} className="card kpi"><span className="small muted">{l}</span><b>{v}</b></div>)}</div>
          <div className="panel" style={{ height: 320 }}>
            <ResponsiveContainer><LineChart data={a.data.timeline} margin={{ left: -20, right: 10, top: 10 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} stroke="var(--ink-3)" fontSize={12} /><YAxis stroke="var(--ink-3)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }} /><Legend />
              <Line dataKey="view" name="Просмотры" stroke="#1B4FA3" strokeWidth={2} dot={false} /><Line dataKey="search" name="Поиски" stroke="#7B3FE4" strokeWidth={2} dot={false} />
              <Line dataKey="favorite" name="Избранное" stroke="#E3263A" strokeWidth={2} dot={false} /><Line dataKey="route_build" name="Маршруты" stroke="#E58A00" strokeWidth={2} dot={false} />
            </LineChart></ResponsiveContainer>
          </div>
          <div className="grid two">
            <div className="panel" style={{ height: 300 }}><b>Просмотры по вертикалям</b>
              <ResponsiveContainer height={250}><BarChart data={a.data.by_vertical} margin={{ left: -20, top: 10 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="name" fontSize={11} stroke="var(--ink-3)" tickFormatter={(s) => s.split(" ")[0]} /><YAxis fontSize={12} stroke="var(--ink-3)" />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }} /><Bar dataKey="views" name="Просмотры" radius={[6, 6, 0, 0]}>{a.data.by_vertical.map((v: any) => <Cell key={v.slug} fill={v.color} />)}</Bar></BarChart></ResponsiveContainer></div>
            <div className="panel stack"><b>Воронка</b>
              {[["Просмотры карточек", a.data.funnel.views], ["Добавления в избранное", a.data.funnel.favorites], ["Построения маршрута", a.data.funnel.route_builds], ["Записи", a.data.funnel.bookings]].map(([l, v]) => (
                <div key={l as string}><div className="row between small"><span>{l}</span><b>{v}</b></div><div className="bar"><i style={{ width: `${((v as number) / Math.max(1, a.data.funnel.views)) * 100}%`, background: "var(--blue)" }} /></div></div>))}
              <div className="small muted">Источник трафика: сайт {a.data.sources.web || 0} · приложение {a.data.sources.app || 0}</div>
            </div>
            <div className="panel stack"><b>Топ мест</b>{a.data.top_places.map((p: any, i: number) => <Link key={p.slug} to={`/place/${p.slug}`} className="row between small"><span>{i + 1}. {p.name}</span><span className="muted">{p.views}</span></Link>)}</div>
            <div className="panel stack"><b>Что ищут</b>{a.data.top_searches.map(([s, n]: any) => <div key={s} className="row between small"><span>{s}</span><span className="muted">{n}</span></div>)}
              <b style={{ marginTop: 10 }}>Ищут, но не находят — точки роста</b>{a.data.zero_searches.map(([s, n]: any) => <div key={s} className="row between small"><span className="badge warn">{s}</span><span className="muted">{n}</span></div>)}</div>
          </div>
          <div className="card" style={{ height: 360, overflow: "hidden" }}>
            <MapView cluster points={a.data.heat.map((h: any, i: number) => ({ id: i, lat: h[0], lng: h[1], color: h[2] > 500 ? "#E3263A" : h[2] > 200 ? "#E58A00" : "#1B4FA3", name: `${h[2]} просмотров` }))} fit />
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Модерация ----------
function Complaints() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api<any[]>("/api/admin/complaints"), []);
  const act = async (id: number, action: string) => { await api(`/api/admin/complaints/${id}`, { body: { action } }); toast(action === "hide" ? "Отзыв скрыт" : "Отзыв оставлен"); reload(); };
  if (!data) return <Loading />;
  return (
    <div className="stack"><h2>Жалобы на отзывы</h2><p className="muted small">Регламент: решение в течение 24 часов с момента жалобы.</p>
      {!data.length && <Empty icon="info" title="Жалоб нет" />}
      {data.map((c) => (
        <div key={c.id} className="card pad stack">
          <div className="row between"><b>{c.place.name}</b>{c.status === "open" ? <span className={`sla ${c.hours_left < 4 ? "late" : ""}`}>{c.hours_left > 0 ? `осталось ${c.hours_left} ч` : `просрочено на ${-c.hours_left} ч`}</span> : <span className="badge">{c.status === "hidden" ? "скрыт" : "оставлен"}</span>}</div>
          <div className="small muted">Причина: {c.reason}</div>
          <div className="reply"><b>{c.review.user_name}</b> ({"★".repeat(c.review.rating)}): {c.review.text}</div>
          {c.status === "open" && <div className="row"><button className="btn primary sm" onClick={() => act(c.id, "hide")}>Скрыть отзыв</button><button className="btn secondary sm" onClick={() => act(c.id, "keep")}>Оставить</button></div>}
        </div>
      ))}
    </div>
  );
}

function Reviews() {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const { data, reload } = useAsync(() => api<any[]>(`/api/admin/reviews?q=${encodeURIComponent(q)}`), [q]);
  return (
    <div className="stack"><div className="row between"><h2>Все отзывы</h2><input className="input" style={{ width: 240 }} placeholder="Поиск по тексту" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card tbl-wrap"><table className="tbl"><thead><tr><th>Место</th><th>Автор</th><th>Оценка</th><th>Текст</th><th>Статус</th><th /></tr></thead><tbody>
        {(data || []).map((r) => <tr key={r.id}><td>{r.place_name}</td><td>{r.user_name}</td><td>{r.rating}</td><td>{r.text}</td><td>{r.status === "published" ? <span className="badge ok">опубликован</span> : <span className="badge warn">скрыт</span>}</td>
          <td><button className="btn ghost sm" onClick={async () => { await api(`/api/admin/reviews/${r.id}/${r.status === "published" ? "hide" : "show"}`, { method: "POST" }); toast("Готово"); reload(); }}>{r.status === "published" ? "Скрыть" : "Вернуть"}</button></td></tr>)}
      </tbody></table></div></div>
  );
}

function Reports() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api<any[]>("/api/admin/reports"), []);
  const act = async (id: number, action: string) => { await api(`/api/admin/reports/${id}`, { body: { action } }); toast(action === "fixed" ? "Отмечено исправленным, дата проверки обновлена" : "Отклонено"); reload(); };
  return (
    <div className="stack"><h2>Сообщения о неточностях</h2>
      {(data || []).map((r) => (
        <div key={r.id} className="card pad row between" style={{ alignItems: "flex-start" }}>
          <div><b>{r.place?.name}</b> <span className="badge">{r.field}</span><div>{r.message}</div><div className="tiny muted">{fmtDate(r.created_at)}{r.contact ? ` · ${r.contact}` : ""}</div></div>
          {r.status === "open" ? <div className="row"><Link to={`/admin/places?edit=${r.place?.id}`} className="btn secondary sm">Исправить карточку</Link><button className="btn primary sm" onClick={() => act(r.id, "fixed")}>Исправлено</button><button className="btn ghost sm" onClick={() => act(r.id, "rejected")}>Отклонить</button></div> : <span className="badge">{r.status}</span>}
        </div>
      ))}
      {data && !data.length && <Empty icon="info" title="Сообщений нет" />}
    </div>
  );
}

function Copyright() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api<any[]>("/api/admin/copyright"), []);
  return (
    <div className="stack"><h2>Жалобы на нарушение авторских прав</h2>
      {(data || []).map((c) => (
        <div key={c.id} className="card pad stack">
          <div className="row between"><b>{c.material}</b><span className={`badge ${c.status === "open" ? "warn" : ""}`}>{{ open: "на рассмотрении", removed: "материал удалён", rejected: "отклонена" }[c.status as string]}</span></div>
          <div className="small">Заявитель: {c.claimant_name}, {c.claimant_contact}</div><div className="small muted">{c.description} · Доказательства: {c.proof}</div>
          {c.status === "open" && <div className="row"><button className="btn primary sm" onClick={async () => { await api(`/api/admin/copyright/${c.id}`, { body: { action: "removed" } }); toast("Материал снят с публикации"); reload(); }}>Снять материал</button><button className="btn ghost sm" onClick={async () => { await api(`/api/admin/copyright/${c.id}`, { body: { action: "rejected" } }); reload(); }}>Отклонить</button></div>}
        </div>
      ))}
    </div>
  );
}

function Verifications() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api<any[]>("/api/admin/verifications"), []);
  const act = async (id: number, action: string) => {
    const comment = action === "reject" ? prompt("Причина отказа") || "" : "";
    try { await api(`/api/admin/verifications/${id}`, { body: { action, comment } }); toast(action === "approve" ? "Владелец верифицирован" : "Заявка отклонена"); reload(); } catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <div className="stack"><h2>Верификация владельцев</h2><p className="small muted">Документ (ЕГРЮЛ/ЕГРИП/ИНН) + подтверждение кода по контактам из карточки → решение до 3 рабочих дней.</p>
      {(data || []).map((v) => (
        <div key={v.id} className="card pad stack">
          <div className="row between"><b>{v.org_name}</b>{v.status === "pending" ? <span className={`sla ${v.days_left < 1 ? "late" : ""}`}>до решения {v.days_left} дн.</span> : <span className={`badge ${v.status === "approved" ? "ok" : "err"}`}>{v.status}</span>}</div>
          <div className="small">{v.user.name} ({v.user.email}) · {v.doc_type}: <b>{v.doc_number}</b>{v.doc_file && <> · <a href={v.doc_file} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>скан</a></>}</div>
          <div className="small">{v.place ? <>Объект: <Link to={`/place/${v.place.slug}`} style={{ color: "var(--blue)" }}>{v.place.name}</Link> (контакты: {v.place.phone}, {v.place.email})</> : <>Новый объект: <b>{v.new_place?.name}</b>, {v.new_place?.address}</>}</div>
          <div className="small">{v.contact_confirmed ? <span className="badge ok">Контакт подтверждён кодом</span> : <span className="badge warn">Контакт не подтверждён</span>}</div>
          {v.status === "pending" && <div className="row"><button className="btn primary sm" disabled={!v.contact_confirmed} onClick={() => act(v.id, "approve")}>Одобрить</button><button className="btn ghost sm" onClick={() => act(v.id, "reject")}>Отклонить</button></div>}
        </div>
      ))}
    </div>
  );
}

function PlacesAdmin() {
  const { toast } = useStore();
  const [edit, setEdit] = useState<any>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { const id = new URLSearchParams(location.search).get("edit"); if (id) api(`/api/admin/r/places/${id}`).then(setEdit); }, []);
  return (
    <>
      <Crud key={key} res="places" title="Объекты" moderation canWrite={false}
        columns={[{ key: "name", label: "Название", render: (v, r) => <Link to={`/place/${r.slug}`} style={{ fontWeight: 600 }}>{v}</Link> }, { key: "address", label: "Адрес" },
          { key: "status", label: "Статус" }, { key: "rating", label: "★", render: (v) => v.toFixed(1) }, { key: "moderation", label: "Модерация", render: modBadge }, { key: "last_checked", label: "Проверено" }]}
        fields={[]}
        extraActions={(r, reload) => <><ModActions res="places" row={r} reload={reload} /><button className="btn ghost sm" onClick={() => api(`/api/admin/r/places/${r.id}`).then(setEdit)}><I.Pencil size={15} /></button>
          <button className="btn ghost sm" onClick={async () => { if (confirm(`Удалить «${r.name}»?`)) { await api(`/api/admin/r/places/${r.id}`, { method: "DELETE" }); toast("Удалено"); reload(); } }}><I.Trash2 size={15} /></button></>} />
      <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setEdit({ name: "", lat: 48.008, lng: 37.804, hours: {}, labels: [], formats: [], tags: [], attrs: {}, services: [], portfolio: [], photos: [], moderation: "published" })}><I.Plus size={16} />Новый объект</button>
      {edit && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setEdit(null)}><div className="modal wide">
          <div className="modal-head"><h2 style={{ fontSize: 20 }}>{edit.id ? edit.name : "Новый объект"}</h2><button className="icon-btn" onClick={() => setEdit(null)}><I.X size={18} /></button></div>
          <PlaceEditor categories={[]} place={{ ...edit, category_id: edit.category_id || edit.category?.id }} onSave={async (d) => {
            const body = { ...d }; delete body.vertical; delete body.category; delete body.fields; delete body.open_now; delete body.today_hours;
            try { if (edit.id) await api(`/api/admin/r/places/${edit.id}`, { method: "PATCH", body }); else await api("/api/admin/r/places", { body }); toast("Сохранено"); setEdit(null); setKey((k) => k + 1); } catch (e: any) { toast(e.message, "err"); }
          }} />
        </div></div>
      )}
    </>
  );
}

function Verticals() {
  const { config, reloadConfig } = useStore();
  const verts = useAsync(() => api<any[]>("/api/admin/r/verticals"), []);
  const vopts: [number, string][] = (verts.data || []).map((v) => [v.id, v.name]);
  return (
    <div className="stack">
      <div className="panel small"><b>Вертикали без выпуска новой версии.</b> Создайте вертикаль, добавьте типы объектов с полями — она сразу появится на сайте (слой карты, фильтры, страница, форма заявки) и в мобильном приложении при следующей синхронизации.</div>
      <Crud key="verticals" res="verticals" title="Вертикали" defaults={{ name: "", color: "#16A34A", icon: "bike", stage: 2, enabled: true, map_layer: true, sort: 10, form_fields: [] }}
        columns={[{ key: "name", label: "Название", render: (v, r) => <span className="row" style={{ gap: 8 }}><span className="sw" style={{ width: 12, height: 12, borderRadius: "50%", background: r.color, display: "inline-block" }} />{v}</span> },
          { key: "stage", label: "Этап" }, { key: "enabled", label: "Включена" }, { key: "map_layer", label: "Слой карты" }, { key: "is_professional", label: "Проф. раздел" }]}
        fields={[{ key: "name", label: "Название" }, { key: "slug", label: "Адрес (slug, можно пусто)" }, { key: "short", label: "Кратко", full: true }, { key: "description", label: "Описание", type: "textarea" },
          { key: "color", label: "Цвет слоя", type: "color" }, { key: "stage", label: "Этап", type: "number" }, { key: "sort", label: "Порядок", type: "number" },
          { key: "enabled", label: "Включена", type: "bool" }, { key: "map_layer", label: "Слой на карте", type: "bool" }, { key: "is_professional", label: "Профессиональный раздел", type: "bool" },
          { key: "icon", label: "Иконка", type: "icon" }, { key: "form_title", label: "Название формы заявки" },
          { key: "form_fields", label: "Поля формы заявки", custom: (v, set) => <FieldsBuilder value={v} onChange={set} form /> }]} />
      <Crud key="categories" res="categories" title="Типы объектов и их поля" defaults={{ name: "", icon: "map-pin", fields: [], default_stay_min: 45 }}
        columns={[{ key: "name", label: "Тип" }, { key: "vertical_id", label: "Вертикаль", render: (v) => vopts.find(([k]) => k === v)?.[1] }, { key: "fields", label: "Полей", render: (v) => (v || []).length }, { key: "default_stay_min", label: "Мин. на месте" }]}
        fields={[{ key: "name", label: "Название" }, { key: "vertical_id", label: "Вертикаль", type: "select", options: vopts }, { key: "default_stay_min", label: "Время посещения по умолчанию, мин", type: "number" },
          { key: "icon", label: "Иконка", type: "icon" }, { key: "fields", label: "Поля карточки", custom: (v, set) => <FieldsBuilder value={v} onChange={set} /> }]} />
      <button className="btn secondary" style={{ alignSelf: "flex-start" }} onClick={reloadConfig}><I.RefreshCw size={16} />Обновить конфигурацию сайта ({config?.version})</button>
    </div>
  );
}

function Users() {
  const { toast, user: me } = useStore();
  const [q, setQ] = useState("");
  const { data, reload } = useAsync(() => api<any[]>(`/api/admin/users?q=${encodeURIComponent(q)}`), [q]);
  const patch = async (id: number, body: any) => { try { await api(`/api/admin/users/${id}`, { method: "PATCH", body }); toast("Сохранено"); reload(); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <div className="stack"><div className="row between"><h2>Пользователи и роли</h2><input className="input" style={{ width: 240 }} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="small muted">Инвестор — не отдельная роль, а профиль пользователя. Для куратора, модератора и администратора обязательна 2FA — при назначении роли пользователь настроит её при следующем входе.</p>
      <div className="card tbl-wrap"><table className="tbl"><thead><tr><th>Имя</th><th>E-mail</th><th>Роль</th><th>2FA</th><th>Эксперт</th><th>Блок</th></tr></thead><tbody>
        {(data || []).map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
          <td><select className="select" style={{ height: 34 }} value={u.role} disabled={u.id === me?.id} onChange={(e) => patch(u.id, { role: e.target.value })}>{[["user", "Пользователь"], ["owner", "Владелец бизнеса"], ["curator", "Куратор"], ["moderator", "Модератор"], ["admin", "Администратор"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
          <td>{u.totp_enabled ? <span className="badge ok">вкл</span> : ["curator", "moderator", "admin"].includes(u.role) ? <span className="badge warn">нужна</span> : "—"}</td>
          <td><input type="checkbox" checked={u.is_expert} onChange={(e) => patch(u.id, { is_expert: e.target.checked })} /></td>
          <td><input type="checkbox" checked={u.blocked} disabled={u.id === me?.id} onChange={(e) => patch(u.id, { blocked: e.target.checked })} /></td></tr>)}
      </tbody></table></div></div>
  );
}

function Applications() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api("/api/curator/applications"), []);
  const sites = useAsync(() => api<any[]>("/api/invest/sites"), []);
  const [open, setOpen] = useState<any>(null);
  const [comment, setComment] = useState("");
  if (!data) return <Loading />;
  const upd = async (id: number, body: any) => { try { const r = await api(`/api/curator/applications/${id}`, { method: "PATCH", body }); toast("Заявка обновлена"); setComment(""); reload(); setOpen((o: any) => (o ? { ...o, ...r } : o)); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <div className="stack"><h2>Заявки инвесторов: «одно окно»</h2>
      <div className="kanban">
        {Object.entries(data.statuses as Record<string, string>).map(([k, l]) => (
          <div key={k} className="colk"><div className="row between" style={{ marginBottom: 8 }}><b className="small">{l}</b><span className="badge">{data.items.filter((a: any) => a.status === k).length}</span></div>
            <div className="col" style={{ gap: 8 }}>{data.items.filter((a: any) => a.status === k).map((a: any) => (
              <button key={a.id} className="card" style={{ padding: 10, textAlign: "left", cursor: "pointer" }} onClick={() => setOpen(a)}>
                <b className="small">{a.number}</b><div style={{ fontWeight: 600, fontSize: 14 }}>{a.project}</div><div className="tiny muted">{a.company} · {a.investment_mln} млн ₽ · {a.jobs} раб. мест</div>
                <div className="tiny muted">{a.curator ? `Куратор: ${a.curator.name}` : "Куратор не назначен"}</div>
              </button>))}</div>
          </div>
        ))}
      </div>
      {open && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}><div className="modal wide">
          <div className="modal-head"><h2 style={{ fontSize: 20 }}>{open.number}: {open.project}</h2><button className="icon-btn" onClick={() => setOpen(null)}><I.X size={18} /></button></div>
          <div className="stack">
            <div className="small">Инвестор: {open.investor?.name} ({open.investor?.email}) · {open.company}, ИНН {open.inn} · {open.contact}</div>
            <div className="small">Отрасль: {open.industry} · {open.investment_mln} млн ₽ · {open.jobs} мест · нужно {open.need_area_ha} га, {open.need_power_mw} МВт · {(open.needs || []).join(", ")}</div>
            {open.support?.length > 0 && <div className="small">Меры поддержки: {open.support.join(", ")}</div>}
            <div className="form-grid">
              <label className="field">Статус<select className="select" value={open.status} onChange={(e) => upd(open.id, { status: e.target.value, comment })}>{Object.entries(APP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field">Куратор<select className="select" value={open.curator_id || ""} onChange={(e) => upd(open.id, { curator_id: Number(e.target.value) })}><option value="">—</option>{data.curators.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field">Площадка<select className="select" value={open.site_id || ""} onChange={(e) => upd(open.id, { site_id: Number(e.target.value), status: "site_proposed" })}><option value="">—</option>{(sites.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            </div>
            <div className="row"><input className="input grow" placeholder="Комментарий для инвестора" value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn primary" onClick={() => upd(open.id, { comment })}>Отправить</button></div>
            <div className="col" style={{ gap: 4 }}>{[...(open.history || [])].reverse().map((h: any, i: number) => <div key={i} className="small"><span className="muted">{fmtDate(h.at)} · {h.by} · {APP_STATUS[h.status]}:</span> {h.comment}</div>)}</div>
          </div>
        </div></div>
      )}
    </div>
  );
}

function Audit() {
  const { data } = useAsync(() => api<any[]>("/api/admin/audit"), []);
  const sys = useAsync(() => api("/api/admin/system"), []);
  const { toast } = useStore();
  return (
    <div className="stack">
      <h2>Техническая часть</h2>
      {sys.data && <div className="kpis">{[["База данных", sys.data.database], ["Демо-режим", sys.data.demo_mode ? "вкл" : "выкл"], ["LLM для бота", sys.data.llm ? "подключена" : "встроенный NLU"], ["Документов в индексе", sys.data.search_index_docs], ["Словарь поиска", sys.data.search_vocab], ["Версия", sys.data.version]].map(([l, v]) => <div key={l} className="card kpi"><span className="small muted">{l}</span><b style={{ fontSize: 18 }}>{String(v)}</b></div>)}</div>}
      <div className="row"><button className="btn secondary" onClick={async () => { await api("/api/admin/system/reindex", { method: "POST" }); toast("Поисковый индекс пересобран"); sys.reload(); }}><I.RefreshCw size={16} />Пересобрать поисковый индекс</button>
        <a href="/docs" target="_blank" rel="noreferrer" className="btn secondary"><I.BookOpen size={16} />Документация API (OpenAPI)</a></div>
      <h3>Журнал действий</h3>
      <div className="card tbl-wrap"><table className="tbl"><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead>
        <tbody>{(data || []).map((a) => <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDate(a.created_at)}</td><td>{a.user_name}</td><td>{a.action}</td><td>{a.entity}</td><td className="small">{a.details}</td></tr>)}</tbody></table></div>
    </div>
  );
}

// ---------- Каркас панели ----------
export default function Admin() {
  const { user } = useStore();
  const queue = useAsync(() => (user?.is_service ? api("/api/admin/queue") : Promise.resolve(null)), [user?.id]);
  if (!user) return <div className="container page"><Empty icon="shield" title="Панель управления">Вход только для модераторов, кураторов и администраторов (с двухфакторной защитой)<Link to="/login?next=/admin" className="btn primary">Войти</Link></Empty></div>;
  if (!user.is_service) return <div className="container page"><Empty icon="shield" title="Нет доступа">Раздел доступен служебным ролям</Empty></div>;
  const r = user.role;
  const isMod = r === "moderator" || r === "admin", isCur = r === "curator" || r === "admin", isAdm = r === "admin";
  const q = queue.data || {};
  const L = (to: string, icon: any, label: string, cnt?: number) => { const C = icon; return <NavLink to={`/admin/${to}`} end={to === ""}><C size={17} />{label}{cnt ? <span className="cnt">{cnt}</span> : null}</NavLink>; };
  return (
    <div className="container page">
      <div className="page-head"><div><h1>Панель управления</h1><p className="muted row" style={{ gap: 8, marginTop: 6 }}>{user.name}<span className="badge blue">{user.role_title}</span><span className="badge ok"><I.ShieldCheck size={13} />2FA</span></p></div></div>
      <div className="admin">
        <nav className="admin-nav">
          {L("", I.LayoutDashboard, "Обзор")}
          {isMod && <><div className="grp">Модерация</div>
            {L("complaints", I.MessageSquareWarning, "Жалобы на отзывы", q.complaints)}{L("reviews", I.Star, "Все отзывы")}{L("reports", I.Flag, "Неточности", q.reports)}
            {L("copyright", I.Copyright, "Авторские права", q.copyright)}{L("verifications", I.BadgeCheck, "Верификация", q.verifications)}
            <div className="grp">Контент</div>
            {L("places", I.MapPin, "Объекты", q.places)}{L("events", I.CalendarDays, "События", q.events)}{L("routes", I.Route, "Маршруты")}
            {L("stories", I.Anchor, "Морское наследие", q.stories)}{L("opportunities", I.GraduationCap, "Кадры", q.opportunities)}{L("promos", I.Ticket, "Промокоды")}{L("submissions", I.Inbox, "Заявки по формам", q.submissions)}</>}
          {isCur && <><div className="grp">Одно окно</div>{L("applications", I.Briefcase, "Заявки инвесторов", q.applications)}{L("sites", I.Building2, "Площадки")}</>}
          {isAdm && <><div className="grp">Администрирование</div>{L("verticals", I.Layers, "Вертикали и поля")}{L("users", I.Users, "Пользователи и роли")}{L("system", I.Settings, "Система и журнал")}</>}
        </nav>
        <div>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="reports" element={<Reports />} />
            <Route path="copyright" element={<Copyright />} />
            <Route path="verifications" element={<Verifications />} />
            <Route path="places" element={<PlacesAdmin />} />
            <Route path="events" element={<Crud key="events" res="events" title="События" moderation defaults={{ kind: "festival", price: 0, registration: false, capacity: 0, age: "0+" }}
              columns={[{ key: "title", label: "Название" }, { key: "kind", label: "Тип" }, { key: "start", label: "Начало", render: (v) => fmtDate(v) }, { key: "price", label: "Цена" }, { key: "moderation", label: "Модерация", render: modBadge }]}
              extraActions={(r, reload) => <ModActions res="events" row={r} reload={reload} />}
              fields={[{ key: "title", label: "Название" }, { key: "kind", label: "Тип", type: "select", options: [["festival", "Фестиваль"], ["exhibition", "Выставка"], ["masterclass", "Мастер-класс"], ["open_day", "День открытых дверей"], ["concert", "Концерт"], ["lecture", "Лекция"], ["excursion", "Экскурсия"], ["theatre", "Спектакль"], ["hackathon", "Хакатон"]] },
                { key: "start", label: "Начало", type: "datetime" }, { key: "end", label: "Окончание", type: "datetime" }, { key: "place_id", label: "ID места", type: "number" }, { key: "vertical_id", label: "ID вертикали", type: "number" },
                { key: "price", label: "Цена, ₽", type: "number" }, { key: "age", label: "Возраст" }, { key: "capacity", label: "Мест (0 — без ограничений)", type: "number" }, { key: "registration", label: "Нужна запись", type: "bool" },
                { key: "description", label: "Описание", type: "textarea" }, { key: "moderation", label: "Модерация", type: "select", options: [["published", "Опубликовано"], ["pending", "На модерации"], ["rejected", "Отклонено"]] }]} />} />
            <Route path="routes" element={<Crud key="routes" res="routes" title="Тематические маршруты" defaults={{ title: "", is_curated: true, published: true, transport: "walk", start_time: "10:00", color: "#E3263A", stops: [] }}
              filter={(r) => r.is_curated}
              columns={[{ key: "title", label: "Название", render: (v, r) => <Link to={`/routes/${r.slug}`} style={{ fontWeight: 600 }}>{v}</Link> }, { key: "theme", label: "Тема" }, { key: "stops", label: "Точек", render: (v) => v.length }, { key: "published", label: "Опубликован" }]}
              fields={[{ key: "title", label: "Название" }, { key: "subtitle", label: "Подзаголовок" }, { key: "theme", label: "Вертикаль (slug)" }, { key: "color", label: "Цвет", type: "color" },
                { key: "transport", label: "Способ", type: "select", options: [["walk", "Пешком"], ["car", "На машине"]] }, { key: "start_time", label: "Старт (ЧЧ:ММ)" }, { key: "published", label: "Опубликован", type: "bool" },
                { key: "description", label: "Описание", type: "textarea" }, { key: "stops", label: "Точки, порядок, паузы", custom: (v, set) => <StopsEditor value={v} onChange={set} /> }]} />} />
            <Route path="stories" element={<Crud key="stories" res="stories" title="Морское наследие: истории и материалы жителей" moderation defaults={{ title: "", text: "", author: "Редакция платформы", author_kind: "editor", rights_confirmed: true, moderation: "published" }}
              columns={[{ key: "title", label: "Название" }, { key: "author", label: "Автор" }, { key: "author_kind", label: "Тип" }, { key: "listens", label: "Прослушиваний" }, { key: "moderation", label: "Модерация", render: modBadge }]}
              extraActions={(r, reload) => <ModActions res="stories" row={r} reload={reload} />}
              fields={[{ key: "title", label: "Название" }, { key: "period", label: "Период" }, { key: "author", label: "Автор" }, { key: "place_id", label: "ID места", type: "number" }, { key: "audio_url", label: "Ссылка на аудио (иначе — синтез речи)" }, { key: "text", label: "Текст", type: "textarea" }, { key: "rights_confirmed", label: "Права подтверждены", type: "bool" }]} />} />
            <Route path="opportunities" element={<Crud key="opportunities" res="opportunities" title="Кадры и образование" moderation defaults={{ kind: "internship", format: "очно" }}
              columns={[{ key: "title", label: "Название" }, { key: "kind", label: "Тип" }, { key: "org", label: "Организация" }, { key: "applications", label: "Откликов" }, { key: "moderation", label: "Модерация", render: modBadge }]}
              extraActions={(r, reload) => <ModActions res="opportunities" row={r} reload={reload} />}
              fields={[{ key: "title", label: "Название" }, { key: "kind", label: "Тип", type: "select", options: [["internship", "Стажировка"], ["course", "Курс"], ["vacancy", "Вакансия"], ["mentor", "Наставник"]] }, { key: "org", label: "Организация" }, { key: "industry", label: "Отрасль" }, { key: "format", label: "Формат" }, { key: "salary", label: "Оплата" }, { key: "deadline", label: "До", type: "date" }, { key: "contact", label: "Контакт" }, { key: "description", label: "Описание", type: "textarea" }]} />} />
            <Route path="promos" element={<Crud key="promos" res="promos" title="Промокоды партнёров" defaults={{ discount: 5, active: true, description: "на весь ассортимент" }}
              columns={[{ key: "code", label: "Код" }, { key: "place_id", label: "ID места" }, { key: "discount", label: "Скидка, %" }, { key: "activations", label: "Активаций" }, { key: "active", label: "Активен" }]}
              fields={[{ key: "code", label: "Код" }, { key: "place_id", label: "ID места", type: "number" }, { key: "discount", label: "Скидка", type: "select", options: [[3, "3%"], [4, "4%"], [5, "5%"]] }, { key: "description", label: "Условия" }, { key: "valid_until", label: "Действует до", type: "date" }, { key: "active", label: "Активен", type: "bool" }]} />} />
            <Route path="submissions" element={<Crud key="submissions" res="submissions" title="Заявки по формам вертикалей" canWrite={false}
              columns={[{ key: "created_at", label: "Дата", render: (v) => fmtDate(v) }, { key: "vertical_id", label: "Вертикаль" }, { key: "data", label: "Данные", render: (v) => Object.entries(v || {}).map(([k, x]) => `${k}: ${x}`).join("; ") }, { key: "status", label: "Статус" }]}
              fields={[]} extraActions={(r, reload) => r.status === "new" ? <button className="btn secondary sm" onClick={async () => { await api(`/api/admin/r/submissions/${r.id}`, { method: "PATCH", body: { status: "done" } }); reload(); }}>Обработано</button> : null} />} />
            <Route path="applications" element={<Applications />} />
            <Route path="sites" element={<Crud key="sites" res="sites" title="Инвестиционные площадки" canWrite={isCur} defaults={{ name: "", kind: "greenfield", city: "Донецк", lat: 48.0, lng: 37.85, area_ha: 1, status: "free", polygon: [], industries: [], benefits: [], documents: [], before: {}, after: {}, residents: [], published: true }}
              columns={[{ key: "name", label: "Название", render: (v, r) => <Link to={`/investors/sites/${r.slug}`} style={{ fontWeight: 600 }}>{v}</Link> }, { key: "city", label: "Город" }, { key: "area_ha", label: "га" }, { key: "power_mw", label: "МВт" }, { key: "status", label: "Статус" }]}
              fields={[{ key: "name", label: "Название" }, { key: "kind", label: "Тип", type: "select", options: [["greenfield", "Гринфилд"], ["brownfield", "Браунфилд"], ["technopark", "Технопарк"], ["office", "Офисы"]] }, { key: "status", label: "Статус", type: "select", options: [["free", "Свободна"], ["reserved", "Зарезервирована"], ["occupied", "Занята"]] },
                { key: "city", label: "Город" }, { key: "address", label: "Адрес" }, { key: "lat", label: "Широта", type: "number" }, { key: "lng", label: "Долгота", type: "number" }, { key: "area_ha", label: "Площадь, га", type: "number" }, { key: "building_m2", label: "Здания, м²", type: "number" },
                { key: "power_mw", label: "Мощность, МВт", type: "number" }, { key: "highway_km", label: "До трассы, км", type: "number" }, { key: "gas", label: "Газ", type: "bool" }, { key: "water", label: "Вода", type: "bool" }, { key: "sewage", label: "Канализация", type: "bool" }, { key: "railway", label: "Ж/д", type: "bool" },
                { key: "ownership", label: "Собственность" }, { key: "deal", label: "Форма сделки" }, { key: "price", label: "Стоимость" }, { key: "industries", label: "Отрасли", type: "list" }, { key: "benefits", label: "Меры поддержки", type: "list" }, { key: "residents", label: "Резиденты", type: "list" },
                { key: "description", label: "Описание", type: "textarea" }, { key: "documents", label: "Документы", type: "json" }, { key: "before", label: "Было (Новая жизнь)", type: "json" }, { key: "after", label: "Стало", type: "json" },
                { key: "polygon", label: "Контур на карте", custom: (v, set, row) => <PolygonEditor value={v} onChange={set} row={row} /> }, { key: "published", label: "Опубликована", type: "bool" }]} />} />
            <Route path="verticals" element={<Verticals />} />
            <Route path="users" element={<Users />} />
            <Route path="system" element={<Audit />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
