import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as I from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { api, upload } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import { DynamicField, Empty, fmtDate, LABELS, Loading, Modal, Tabs } from "../ui/kit";

const DAYS: [string, string][] = [["mon", "Пн"], ["tue", "Вт"], ["wed", "Ср"], ["thu", "Чт"], ["fri", "Пт"], ["sat", "Сб"], ["sun", "Вс"]];
const FORMATS = ["индивидуально", "группой", "по записи", "с детьми", "онлайн"];

export function HoursEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const v = value || {};
  return (
    <div className="col" style={{ gap: 6 }}>
      <label className="check"><input type="checkbox" checked={!!v.always} onChange={(e) => onChange(e.target.checked ? { always: true } : {})} />Круглосуточно / без ограничений</label>
      {!v.always && DAYS.map(([k, l]) => (
        <div key={k} className="row" style={{ gap: 8 }}>
          <span style={{ width: 26 }}>{l}</span>
          <input className="input" style={{ width: 160, height: 36 }} placeholder="выходной" value={v[k] || ""} onChange={(e) => onChange({ ...v, [k]: e.target.value || null })} />
        </div>
      ))}
      <span className="tiny muted">Формат: 09:00-18:00</span>
    </div>
  );
}

export function PlaceEditor({ place, onSave, categories }: { place: any; onSave: (d: any) => Promise<void>; categories?: any[] }) {
  const { config } = useStore();
  const [d, setD] = useState<any>(() => ({ ...place }));
  const set = (k: string, v: any) => setD((x: any) => ({ ...x, [k]: v }));
  const cat = (config?.verticals || []).flatMap((v) => v.categories).find((c) => c.id === (d.category_id || d.category?.id));
  return (
    <div className="stack">
      {categories && (
        <label className="field">Тип объекта<select className="select" value={d.category_id || ""} onChange={(e) => set("category_id", Number(e.target.value))}>
          <option value="">Выберите</option>{(config?.verticals || []).map((v) => <optgroup key={v.slug} label={v.name}>{v.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
        </select></label>
      )}
      <div className="form-grid">
        <label className="field">Название<input className="input" value={d.name || ""} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="field">Статус<select className="select" value={d.status || "open"} onChange={(e) => set("status", e.target.value)}><option value="open">Открыто</option><option value="closed">Закрыто</option><option value="temporarily_unavailable">Временно недоступно</option></select></label>
        <label className="field">Телефон<input className="input" value={d.phone || ""} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="field">E-mail<input className="input" value={d.email || ""} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="field">Сайт<input className="input" value={d.website || ""} onChange={(e) => set("website", e.target.value)} /></label>
        <label className="field">Уровень цен<select className="select" value={d.price_level ?? 1} onChange={(e) => set("price_level", Number(e.target.value))}><option value={0}>Бесплатно</option><option value={1}>₽</option><option value={2}>₽₽</option><option value={3}>₽₽₽</option></select></label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>Кратко<input className="input" value={d.short || ""} onChange={(e) => set("short", e.target.value)} /></label>
        <label className="field" style={{ gridColumn: "1 / -1" }}>Адрес<input className="input" value={d.address || ""} onChange={(e) => set("address", e.target.value)} /></label>
      </div>
      <div style={{ height: 220, borderRadius: 12, overflow: "hidden" }}>
        <MapView center={[d.lat || 48.008, d.lng || 37.804]} zoom={14} marker={d.lat ? [d.lat, d.lng] : null} onMapClick={(lat, lng) => setD((x: any) => ({ ...x, lat, lng }))} />
      </div>
      <span className="tiny muted">Нажмите на карту, чтобы уточнить точку</span>
      <label className="field">Описание<textarea className="textarea" style={{ minHeight: 120 }} value={d.description || ""} onChange={(e) => set("description", e.target.value)} /></label>
      {cat?.fields?.length > 0 && (
        <div className="panel stack" style={{ padding: 16 }}>
          <b>Поля типа «{cat.name}» (настраиваются в админке)</b>
          <div className="form-grid">{cat.fields.map((f: any) => <DynamicField key={f.key} f={f} value={d.attrs?.[f.key]} onChange={(v) => set("attrs", { ...(d.attrs || {}), [f.key]: v })} />)}</div>
        </div>
      )}
      <div className="form-grid">
        <div><b className="small">Время работы</b><HoursEditor value={d.hours} onChange={(v) => set("hours", v)} /></div>
        <div className="col">
          <b className="small">Метки</b>
          {Object.entries(LABELS).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={(d.labels || []).includes(k)} onChange={(e) => set("labels", e.target.checked ? [...(d.labels || []), k] : d.labels.filter((x: string) => x !== k))} />{l}</label>)}
          <label className="check"><input type="checkbox" checked={!!d.accessible} onChange={(e) => set("accessible", e.target.checked)} />Доступная среда</label>
          <b className="small" style={{ marginTop: 8 }}>Формат посещения</b>
          <div className="chips">{FORMATS.map((f) => <button key={f} type="button" className={`chip ${(d.formats || []).includes(f) ? "on" : ""}`} onClick={() => set("formats", (d.formats || []).includes(f) ? d.formats.filter((x: string) => x !== f) : [...(d.formats || []), f])}>{f}</button>)}</div>
          <label className="field">Теги через запятую<input className="input" value={(d.tags || []).join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></label>
        </div>
      </div>
      <div className="stack">
        <b className="small">Фото</b>
        <div className="row">{(d.photos || []).map((ph: string) => <div key={ph} style={{ position: "relative" }}><img src={ph} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} /><button className="fav-btn" style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24 }} onClick={() => set("photos", d.photos.filter((x: string) => x !== ph))}><I.X size={12} /></button></div>)}
          <label className="btn secondary sm"><I.ImagePlus size={16} />Загрузить<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await upload(f); setD((x: any) => ({ ...x, photos: [...(x.photos || []), url] })); } }} /></label></div>
      </div>
      <div className="stack">
        <div className="row between"><b className="small">Услуги</b><button type="button" className="btn ghost sm" onClick={() => set("services", [...(d.services || []), { name: "", price: "" }])}><I.Plus size={15} />Добавить</button></div>
        {(d.services || []).map((s: any, i: number) => (
          <div key={i} className="row"><input className="input grow" placeholder="Услуга" value={s.name} onChange={(e) => set("services", d.services.map((x: any, k: number) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <input className="input" style={{ width: 160 }} placeholder="Цена" value={s.price} onChange={(e) => set("services", d.services.map((x: any, k: number) => (k === i ? { ...x, price: e.target.value } : x)))} />
            <button className="icon-btn" onClick={() => set("services", d.services.filter((_: any, k: number) => k !== i))}><I.Trash2 size={15} /></button></div>
        ))}
      </div>
      <div className="stack">
        <div className="row between"><b className="small">Портфолио</b><button type="button" className="btn ghost sm" onClick={() => set("portfolio", [...(d.portfolio || []), { title: "", year: new Date().getFullYear(), description: "", rights_confirmed: false }])}><I.Plus size={15} />Добавить работу</button></div>
        {(d.portfolio || []).map((w: any, i: number) => {
          const upd = (k: string, v: any) => set("portfolio", d.portfolio.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)));
          return (
            <div key={i} className="card" style={{ padding: 12 }}>
              <div className="form-grid"><input className="input" placeholder="Название" value={w.title} onChange={(e) => upd("title", e.target.value)} /><input className="input" type="number" placeholder="Год" value={w.year} onChange={(e) => upd("year", Number(e.target.value))} /><input className="input" placeholder="Описание" value={w.description} onChange={(e) => upd("description", e.target.value)} /></div>
              <div className="row between" style={{ marginTop: 8 }}>
                <label className="check small"><input type="checkbox" checked={!!w.rights_confirmed} onChange={(e) => upd("rights_confirmed", e.target.checked)} />Подтверждаю, что обладаю правами на этот материал</label>
                <button className="btn ghost sm" onClick={() => set("portfolio", d.portfolio.filter((_: any, j: number) => j !== i))}>Удалить</button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn primary lg" style={{ alignSelf: "flex-start" }} onClick={() => onSave(d)}><I.Save size={18} />Сохранить карточку</button>
    </div>
  );
}

function Verification() {
  const { toast, refreshUser, config } = useStore();
  const mine = useAsync(() => api<any[]>("/api/owner/verification"), []);
  const [q, setQ] = useState("");
  const claim = useAsync(() => api<any[]>(`/api/owner/claimable?q=${encodeURIComponent(q)}`), [q]);
  const [f, setF] = useState<any>({ mode: "existing", place_id: "", org_name: "", doc_type: "ИНН", doc_number: "", doc_file: "", new_place: { name: "", category_id: "", address: "", lat: 48.008, lng: 37.804 } });
  const [code, setCode] = useState<{ id: number; demo?: string } | null>(null);
  const [c, setC] = useState("");
  const send = async () => {
    try {
      const r = await api("/api/owner/verification", { body: { place_id: f.mode === "existing" ? Number(f.place_id) : null, new_place: f.mode === "new" ? f.new_place : {}, org_name: f.org_name, doc_type: f.doc_type, doc_number: f.doc_number, doc_file: f.doc_file } });
      setCode({ id: r.id, demo: r.demo_code }); toast(r.message); mine.reload();
    } catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <div className="stack">
      <div className="panel stack">
        <h2>Верификация владельца</h2>
        <div className="row small" style={{ gap: 18 }}>
          {["Заявка и документ (ЕГРЮЛ/ЕГРИП/ИНН)", "Подтверждение по контактам из карточки", "Решение модератора — до 3 рабочих дней"].map((s, i) => <span key={s} className="row" style={{ gap: 8 }}><b style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--ink)", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 12 }}>{i + 1}</b>{s}</span>)}
        </div>
        <div className="seg"><button className={f.mode === "existing" ? "on" : ""} onClick={() => setF({ ...f, mode: "existing" })}>Мой объект уже есть на карте</button><button className={f.mode === "new" ? "on" : ""} onClick={() => setF({ ...f, mode: "new" })}>Добавить новый</button></div>
        {f.mode === "existing" ? (
          <div className="stack">
            <input className="input" placeholder="Найдите свой объект" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" value={f.place_id} onChange={(e) => setF({ ...f, place_id: e.target.value })} size={5} style={{ height: "auto" }}>
              {(claim.data || []).map((p) => <option key={p.id} value={p.id}>{p.name} — {p.address}</option>)}
            </select>
          </div>
        ) : (
          <div className="stack">
            <div className="form-grid">
              <label className="field">Название<input className="input" value={f.new_place.name} onChange={(e) => setF({ ...f, new_place: { ...f.new_place, name: e.target.value } })} /></label>
              <label className="field">Тип<select className="select" value={f.new_place.category_id} onChange={(e) => setF({ ...f, new_place: { ...f.new_place, category_id: Number(e.target.value) } })}><option value="">—</option>{(config?.verticals || []).map((v) => <optgroup key={v.slug} label={v.name}>{v.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select></label>
              <label className="field">Адрес<input className="input" value={f.new_place.address} onChange={(e) => setF({ ...f, new_place: { ...f.new_place, address: e.target.value } })} /></label>
            </div>
            <div style={{ height: 200, borderRadius: 12, overflow: "hidden" }}><MapView marker={[f.new_place.lat, f.new_place.lng]} onMapClick={(lat, lng) => setF((x: any) => ({ ...x, new_place: { ...x.new_place, lat, lng } }))} /></div>
          </div>
        )}
        <div className="form-grid">
          <label className="field">Организация / ИП<input className="input" value={f.org_name} onChange={(e) => setF({ ...f, org_name: e.target.value })} /></label>
          <label className="field">Документ<select className="select" value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value })}><option>ИНН</option><option>ЕГРЮЛ</option><option>ЕГРИП</option></select></label>
          <label className="field">{f.doc_type === "ИНН" ? "ИНН" : f.doc_type === "ЕГРЮЛ" ? "ОГРН" : "ОГРНИП"}<input className="input" value={f.doc_number} onChange={(e) => setF({ ...f, doc_number: e.target.value })} /></label>
          <label className="field">Скан выписки<label className="btn secondary sm">{f.doc_file ? "Файл загружен" : "Загрузить PDF/фото"}<input type="file" hidden accept=".pdf,image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, doc_file: await upload(file) }); }} /></label></label>
        </div>
        <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={send}>Отправить заявку</button>
      </div>
      {code && (
        <Modal title="Подтвердите контакт" onClose={() => setCode(null)}>
          <div className="stack">
            <p>Мы отправили 4-значный код на телефон или e-mail, указанный в карточке объекта.</p>
            {code.demo && <div className="badge blue">Демо-режим: код {code.demo}</div>}
            <input className="input" style={{ fontSize: 24, letterSpacing: ".3em", textAlign: "center" }} maxLength={4} value={c} onChange={(e) => setC(e.target.value)} />
            <button className="btn primary" onClick={async () => { try { await api(`/api/owner/verification/${code.id}/confirm`, { body: { code: c } }); toast("Контакт подтверждён. Заявка передана модератору"); setCode(null); mine.reload(); refreshUser(); } catch (e: any) { toast(e.message, "err"); } }}>Подтвердить</button>
          </div>
        </Modal>
      )}
      {mine.data?.length ? (
        <div className="panel stack"><h3>Мои заявки на верификацию</h3>
          {mine.data.map((v) => (
            <div key={v.id} className="row between card" style={{ padding: 12 }}>
              <div><b>{v.org_name}</b><div className="small muted">{v.doc_type} {v.doc_number} · {v.contact_confirmed ? "контакт подтверждён" : "контакт не подтверждён"} · решение до {v.deadline ? new Date(v.deadline).toLocaleDateString("ru-RU") : "—"}</div>{v.comment && <div className="small">Комментарий: {v.comment}</div>}</div>
              <div className="row">{!v.contact_confirmed && v.status === "pending" && <button className="btn secondary sm" onClick={() => setCode({ id: v.id })}>Ввести код</button>}
                <span className={`badge ${v.status === "approved" ? "ok" : v.status === "rejected" ? "err" : "warn"}`}>{{ pending: "На проверке", approved: "Одобрено", rejected: "Отклонено" }[v.status as string]}</span></div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stats() {
  const { data } = useAsync(() => api("/api/owner/stats"), []);
  if (!data) return <Loading h={300} />;
  const t = data.totals;
  return (
    <div className="stack">
      <div className="kpis">
        {[["Просмотры", t.view], ["В избранное", t.favorite], ["Построили маршрут", t.route_build], ["Поделились", t.share], ["Промокоды", t.promo], ["Записи", t.booking]].map(([l, v]) => <div key={l} className="card kpi"><span className="small muted">{l}</span><b>{v || 0}</b></div>)}
      </div>
      <div className="panel" style={{ height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data.timeline} margin={{ left: -20, right: 10, top: 10 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} stroke="var(--ink-3)" fontSize={12} /><YAxis stroke="var(--ink-3)" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10 }} /><Legend />
            <Line dataKey="view" name="Просмотры" stroke="#1B4FA3" strokeWidth={2} dot={false} />
            <Line dataKey="favorite" name="Избранное" stroke="#E3263A" strokeWidth={2} dot={false} />
            <Line dataKey="route_build" name="Маршруты" stroke="#E58A00" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="small muted">Источники просмотров: сайт — {data.sources.web || 0}, приложение — {data.sources.app || 0}</div>
      <table className="tbl"><thead><tr><th>Объект</th><th>Просмотры</th><th>Избранное</th><th>Рейтинг</th><th>Отзывы</th><th>Маршруты</th></tr></thead>
        <tbody>{data.places.map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{p.views}</td><td>{p.favorites}</td><td>{p.rating}</td><td>{p.reviews}</td><td>{p.route_builds}</td></tr>)}</tbody></table>
    </div>
  );
}

function Reviews() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api<any[]>("/api/owner/reviews"), []);
  const [text, setText] = useState<Record<number, string>>({});
  if (!data) return <Loading />;
  const sorted = [...data].sort((a, b) => Number(!!a.owner_reply) - Number(!!b.owner_reply));
  return (
    <div className="col">
      {sorted.map((r) => (
        <div key={r.id} className="card pad stack">
          <div className="row between"><b>{r.user_name} о «{r.place_name}»</b><span style={{ color: "#F2A900" }}>{"★".repeat(r.rating)}</span></div>
          <div>{r.text}</div>
          {r.owner_reply ? <div className="reply small">Ваш ответ: {r.owner_reply}</div> : (
            <div className="row"><input className="input grow" placeholder="Ответить от лица организации" value={text[r.id] || ""} onChange={(e) => setText({ ...text, [r.id]: e.target.value })} />
              <button className="btn primary" onClick={async () => { await api(`/api/owner/reviews/${r.id}/reply`, { body: { text: text[r.id] } }); toast("Ответ опубликован"); reload(); }}>Ответить</button>
              <button className="btn ghost" onClick={async () => { const reason = prompt("Причина жалобы"); if (reason) { await api(`/api/reviews/${r.id}/complaint`, { body: { reason } }); toast("Жалоба передана модератору (до 24 часов)"); } }}>Пожаловаться</button></div>
          )}
        </div>
      ))}
    </div>
  );
}

function Extras({ places }: { places: any[] }) {
  const { toast } = useStore();
  const [pid, setPid] = useState<number>(places[0]?.id);
  const slots = useAsync(() => (pid ? api<any[]>(`/api/owner/places/${pid}/slots`) : Promise.resolve([])), [pid]);
  const [slot, setSlot] = useState<any>({ title: "Экскурсия", start: "", duration_min: 60, capacity: 15, price: 0, group_only: false });
  const [promo, setPromo] = useState<any>({ code: "", discount: 5, description: "на весь ассортимент" });
  const [opp, setOpp] = useState<any>({ kind: "internship", title: "", description: "" });
  const [ev, setEv] = useState<any>({ title: "", kind: "masterclass", start: "", price: 0, registration: true, capacity: 10, description: "" });
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); slots.reload(); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <div className="stack">
      <label className="field" style={{ maxWidth: 420 }}>Объект<select className="select" value={pid} onChange={(e) => setPid(Number(e.target.value))}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="panel stack">
        <h3>Расписание экскурсий и мастер-классов</h3>
        <div className="form-grid">
          <input className="input" value={slot.title} onChange={(e) => setSlot({ ...slot, title: e.target.value })} placeholder="Название" />
          <input className="input" type="datetime-local" value={slot.start} onChange={(e) => setSlot({ ...slot, start: e.target.value })} />
          <label className="field">Мест<input className="input" type="number" value={slot.capacity} onChange={(e) => setSlot({ ...slot, capacity: Number(e.target.value) })} /></label>
          <label className="field">Цена, ₽<input className="input" type="number" value={slot.price} onChange={(e) => setSlot({ ...slot, price: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={slot.group_only} onChange={(e) => setSlot({ ...slot, group_only: e.target.checked })} />Только группы</label>
        </div>
        <button className="btn secondary" style={{ alignSelf: "flex-start" }} disabled={!slot.start} onClick={() => act(() => api(`/api/owner/places/${pid}/slots`, { body: slot }), "Слот добавлен")}><I.Plus size={16} />Добавить слот</button>
        {(slots.data || []).map((s) => (
          <div key={s.id} className="card" style={{ padding: 12 }}>
            <div className="row between"><div><b>{fmtDate(s.start)}</b> · {s.title} · {s.booked}/{s.capacity}</div><button className="btn ghost sm" onClick={() => act(() => api(`/api/owner/slots/${s.id}`, { method: "DELETE" }), "Слот удалён")}>Удалить</button></div>
            {s.bookings.map((b: any) => (
              <div key={b.id} className="row between small" style={{ marginTop: 6 }}>
                <span>{b.contact} · {b.people} чел. {b.comment && `· ${b.comment}`}</span>
                <div className="row"><span className={`badge ${b.status === "confirmed" ? "ok" : b.status === "pending" ? "warn" : ""}`}>{b.status}</span>
                  {b.status === "pending" && <><button className="btn secondary sm" onClick={() => act(() => api(`/api/owner/bookings/${b.id}/confirm`, { method: "POST" }), "Подтверждено")}>Подтвердить</button><button className="btn ghost sm" onClick={() => act(() => api(`/api/owner/bookings/${b.id}/reject`, { method: "POST" }), "Отклонено")}>Отклонить</button></>}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="panel stack">
        <h3>Промокод партнёра (скидка 3–5%)</h3>
        <div className="form-grid">
          <input className="input" placeholder="КОД" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} />
          <select className="select" value={promo.discount} onChange={(e) => setPromo({ ...promo, discount: Number(e.target.value) })}>{[3, 4, 5].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
          <input className="input" value={promo.description} onChange={(e) => setPromo({ ...promo, description: e.target.value })} />
        </div>
        <button className="btn secondary" style={{ alignSelf: "flex-start" }} disabled={!promo.code} onClick={() => act(() => api(`/api/owner/places/${pid}/promo`, { body: promo }), "Промокод активирован")}>Сохранить промокод</button>
      </div>
      <div className="panel stack">
        <h3>Стажировка, вакансия, курс</h3>
        <div className="form-grid">
          <select className="select" value={opp.kind} onChange={(e) => setOpp({ ...opp, kind: e.target.value })}><option value="internship">Стажировка</option><option value="vacancy">Вакансия</option><option value="course">Курс</option><option value="mentor">Наставник</option></select>
          <input className="input" placeholder="Название" value={opp.title} onChange={(e) => setOpp({ ...opp, title: e.target.value })} />
          <input className="input" placeholder="Описание" value={opp.description} onChange={(e) => setOpp({ ...opp, description: e.target.value })} />
        </div>
        <button className="btn secondary" style={{ alignSelf: "flex-start" }} disabled={!opp.title} onClick={() => act(() => api(`/api/owner/places/${pid}/opportunities`, { body: opp }), "Опубликовано")}>Опубликовать</button>
      </div>
      <div className="panel stack">
        <h3>Событие в афишу (после модерации)</h3>
        <div className="form-grid">
          <input className="input" placeholder="Название" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} />
          <select className="select" value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })}><option value="masterclass">Мастер-класс</option><option value="exhibition">Выставка</option><option value="open_day">День открытых дверей</option><option value="festival">Фестиваль</option><option value="concert">Концерт</option></select>
          <input className="input" type="datetime-local" value={ev.start} onChange={(e) => setEv({ ...ev, start: e.target.value })} />
          <input className="input" type="number" placeholder="Цена" value={ev.price} onChange={(e) => setEv({ ...ev, price: Number(e.target.value) })} />
        </div>
        <button className="btn secondary" style={{ alignSelf: "flex-start" }} disabled={!ev.title || !ev.start} onClick={() => act(() => api(`/api/owner/places/${pid}/events`, { body: ev }), "Отправлено на модерацию")}>Отправить</button>
      </div>
    </div>
  );
}

export default function Cabinet() {
  const { user, toast } = useStore();
  const [tab, setTab] = useState<"places" | "reviews" | "stats" | "extras" | "new">("places");
  const places = useAsync(() => (user?.owner_verified || user?.role === "admin" ? api<any[]>("/api/owner/places") : Promise.resolve([])), [user?.id, user?.owner_verified]);
  const [edit, setEdit] = useState<any>(null);
  useEffect(() => { setEdit(null); }, [tab]);
  if (!user) return <div className="container page"><Empty icon="briefcase" title="Кабинет бизнеса">Войдите, чтобы добавить своё предприятие и управлять карточкой<Link to="/login?next=/cabinet" className="btn primary">Войти</Link></Empty></div>;
  const verified = user.owner_verified || user.role === "admin";
  return (
    <div className="container page">
      <div className="page-head"><div><h1>Кабинет бизнеса</h1><p className="lead">Управляйте карточкой, отвечайте на отзывы, ведите расписание экскурсий, промокоды и смотрите статистику.</p></div></div>
      {!verified ? <Verification /> : (
        <>
          <Tabs tabs={[["places", "Мои объекты"], ["reviews", "Отзывы"], ["stats", "Статистика"], ["extras", "Экскурсии и предложения"], ["new", "Добавить объект"]]} value={tab} onChange={setTab} />
          {tab === "places" && (edit ? (
            <div className="panel"><button className="btn ghost sm" onClick={() => setEdit(null)}><I.ArrowLeft size={16} />Назад</button>
              <PlaceEditor place={edit} onSave={async (d) => { try { await api(`/api/owner/places/${edit.id}`, { method: "PATCH", body: d }); toast("Карточка обновлена, дата проверки — сегодня"); setEdit(null); places.reload(); } catch (e: any) { toast(e.message, "err"); } }} />
            </div>
          ) : (
            <div className="col">
              {(places.data || []).map((p) => (
                <div key={p.id} className="card row between" style={{ padding: 16 }}>
                  <div><b>{p.name}</b><div className="small muted">{p.category.name} · ★ {p.rating.toFixed(1)} · {p.views} просмотров{p.unanswered ? ` · ${p.unanswered} без ответа` : ""}</div></div>
                  <div className="row"><span className={`badge ${p.moderation === "published" ? "ok" : "warn"}`}>{p.moderation === "published" ? "Опубликован" : "На модерации"}</span>
                    <Link to={`/place/${p.slug}`} className="btn ghost sm">Открыть</Link><button className="btn secondary sm" onClick={() => setEdit(p)}><I.Pencil size={15} />Редактировать</button></div>
                </div>
              ))}
              {!places.data?.length && <Empty icon="briefcase" title="Объектов пока нет"><button className="btn primary" onClick={() => setTab("new")}>Добавить объект</button></Empty>}
            </div>
          ))}
          {tab === "reviews" && <Reviews />}
          {tab === "stats" && <Stats />}
          {tab === "extras" && (places.data?.length ? <Extras places={places.data} /> : <Loading />)}
          {tab === "new" && <div className="panel"><PlaceEditor categories={[]} place={{ name: "", lat: 48.008, lng: 37.804, hours: {}, labels: [], formats: [], tags: [], attrs: {}, services: [], portfolio: [], photos: [] }}
            onSave={async (d) => { try { await api("/api/owner/places", { body: d }); toast("Объект отправлен на модерацию"); setTab("places"); places.reload(); } catch (e: any) { toast(e.message, "err"); } }} /></div>}
        </>
      )}
    </div>
  );
}
