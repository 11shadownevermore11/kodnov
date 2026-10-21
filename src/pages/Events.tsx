import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Empty, fmtTime, Loading, MONTHS_N, monthShort } from "../ui/kit";

const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function EventRow({ e }: { e: any }) {
  const { config } = useStore();
  const d = new Date(e.start);
  const multi = e.end && new Date(e.end).toDateString() !== d.toDateString();
  return (
    <Link to={`/events/${e.slug}`} className="card event-row">
      <div className="datebox"><b>{d.getDate()}</b><span className="tiny muted">{monthShort(e.start)}</span></div>
      <div>
        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
          <span className="badge cat" style={{ ["--c" as any]: e.vertical?.color }}>{config?.dictionaries?.event_kinds?.[e.kind] || e.kind}</span>
          {e.registration && <span className="badge blue">По записи</span>}
          {e.age && e.age !== "0+" && <span className="badge">{e.age}</span>}
        </div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>{e.title}</div>
        <div className="small muted">{fmtTime(e.start)}{multi ? ` — до ${new Date(e.end).toLocaleDateString("ru-RU")}` : e.end ? `–${fmtTime(e.end)}` : ""}{e.place ? ` · ${e.place.name}` : ""}</div>
      </div>
      <div style={{ fontWeight: 600 }}>{e.price ? `${e.price} ₽` : "Бесплатно"}</div>
    </Link>
  );
}

export default function Events() {
  const { config } = useStore();
  const all = useAsync(() => api<any[]>("/api/events"), []);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState<string | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [verts, setVerts] = useState<string[]>([]);
  const [free, setFree] = useState(false);

  const filtered = useMemo(() => (all.data || []).filter((e) =>
    (!kinds.length || kinds.includes(e.kind)) && (!verts.length || verts.includes(e.vertical?.slug)) && (!free || !e.price)), [all.data, kinds, verts, free]);

  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {};
    filtered.forEach((e) => {
      const s = new Date(e.start); const en = e.end ? new Date(e.end) : s;
      for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= en && (d.getTime() - s.getTime()) < 40 * 864e5; d.setDate(d.getDate() + 1)) (m[key(d)] ||= []).push(e);
    });
    return m;
  }, [filtered]);

  const cells = useMemo(() => {
    const first = new Date(month); const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  }, [month]);
  const shown = day ? byDay[day] || [] : filtered;
  const kindsDict: Record<string, string> = config?.dictionaries?.event_kinds || {};
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="container page">
      <div className="page-head"><div><h1>Афиша</h1><p className="lead">Фестивали, выставки, мастер-классы и дни открытых дверей по всему региону</p></div></div>
      <div className="catalog">
        <div className="filters">
          <div className="panel" style={{ padding: 14 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Предыдущий месяц"><ChevronLeft size={16} /></button>
              <b>{MONTHS_N[month.getMonth()]} {month.getFullYear()}</b>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Следующий месяц"><ChevronRight size={16} /></button>
            </div>
            <div className="cal">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="dow">{d}</div>)}
              {cells.map((d) => {
                const k = key(d);
                const cls = [byDay[k] ? "has" : "", day === k ? "sel" : "", key(new Date()) === k ? "today" : "", d.getMonth() !== month.getMonth() ? "out" : ""].join(" ");
                return <button key={k} className={cls} onClick={() => setDay(day === k ? null : k)} aria-label={`${d.getDate()} ${MONTHS_N[d.getMonth()]}`}>{d.getDate()}</button>;
              })}
            </div>
          </div>
          <div><h4>Тип события</h4><div className="chips">{Object.entries(kindsDict).map(([k, l]) => <button key={k} className={`chip ${kinds.includes(k) ? "on" : ""}`} onClick={() => toggle(kinds, setKinds, k)}>{l}</button>)}</div></div>
          <div><h4>Направление</h4><div className="chips">{(config?.verticals || []).map((v) => <button key={v.slug} className={`chip ${verts.includes(v.slug) ? "on" : ""}`} onClick={() => toggle(verts, setVerts, v.slug)}><span className="sw" style={{ background: v.color }} />{v.name}</button>)}</div></div>
          <label className="check"><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />Только бесплатные</label>
        </div>
        <div className="col">
          {day && <div className="row between"><b>События на {cells.find((c) => key(c) === day)?.toLocaleDateString("ru-RU")}</b><button className="btn ghost sm" onClick={() => setDay(null)}>Показать все</button></div>}
          {all.loading ? <Loading h={400} /> : shown.length ? shown.map((e) => <EventRow key={e.id} e={e} />) : <Empty icon="star" title="Событий не найдено">Выберите другую дату или уберите фильтры</Empty>}
        </div>
      </div>
    </div>
  );
}
