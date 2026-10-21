import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Footprints, Car, Save, Sparkles, Shuffle, Trash2, Heart, Plus } from "lucide-react";
import { api, PlaceBrief, qs } from "../api";
import { useStore } from "../store";
import { Empty, fmtMin, Modal, PlaceRow } from "../ui/kit";
import { RouteChain, RouteMap } from "../ui/RouteView";

/** Конструктор персонального маршрута: из избранного или подбором «маршрут за N часов». */
export default function RouteBuilder() {
  const { favorites, geo, requestGeo, user, toast, config } = useStore();
  const nav = useNavigate();
  const [ids, setIds] = useState<number[]>(() => {
    try { const s = JSON.parse(sessionStorage.getItem("kod-builder") || "null"); if (Array.isArray(s) && s.length) return s; } catch { /* */ }
    return Object.keys(favorites).map(Number);
  });
  const [tl, setTl] = useState<any>(null);
  const [startTime, setStartTime] = useState("10:00");
  const [transport, setTransport] = useState<"walk" | "car">("walk");
  const [fromMe, setFromMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState({ hours: 3, interests: [] as string[], include_food: true });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<PlaceBrief[]>([]);

  useEffect(() => { try { sessionStorage.setItem("kod-builder", JSON.stringify(ids)); } catch { /* */ } }, [ids]);

  const run = async (order: number[], keep: boolean) => {
    if (!order.length) { setTl(null); return; }
    setBusy(true);
    try {
      const r = await api("/api/routes/optimize", { body: { place_ids: order, start_time: startTime, transport, keep_order: keep, lat: fromMe ? geo?.lat : undefined, lng: fromMe ? geo?.lng : undefined } });
      setTl(r);
      if (!keep) {
        setIds(r.stops.map((s: any) => s.place.id));
        if (r.saved_km > 0.05) toast(`Порядок оптимизирован: маршрут короче на ${r.saved_km} км`);
      }
    } catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  useEffect(() => { run(ids, true); }, [startTime, transport]); // eslint-disable-line

  const move = (i: number, d: number) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setIds(n); run(n, true); };
  const remove = (i: number) => { const n = ids.filter((_, k) => k !== i); setIds(n); run(n, true); };
  const generate = async () => {
    setBusy(true);
    try {
      const r = await api("/api/routes/generate", { body: { ...gen, start_time: startTime, transport, lat: geo?.lat, lng: geo?.lng } });
      setTl(r); setIds(r.stops.map((s: any) => s.place.id));
      toast(`Подобрано ${r.stops.length} мест на ${fmtMin(r.duration_min)}`);
    } catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!user) { toast("Войдите, чтобы сохранить маршрут", "err"); nav("/login?next=/routes/builder"); return; }
    const title = prompt("Название маршрута", "Мой маршрут по Донецку");
    if (!title) return;
    try {
      const r = await api("/api/me/routes", { body: { title, start_time: startTime, transport, stops: tl.stops.map((s: any) => ({ place_id: s.place.id, stay_min: s.stay_min, kind: s.kind, pause_type: s.pause_type })) } });
      toast("Маршрут сохранён"); nav(`/routes/${r.slug}`);
    } catch (e: any) { toast(e.message, "err"); }
  };
  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => api(`/api/places${qs({ q: search, limit: 12, sort: search ? "relevance" : "popularity" })}`).then((r) => setFound(r.items)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [search, adding]);

  const verts = (config?.verticals || []).filter((v) => v.slug !== "investment");

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Конструктор маршрута</h1><p className="lead">Добавьте места из избранного или подберите маршрут под интересы и время — порядок посещения оптимизируется по расстоянию.</p></div>
      </div>
      <div className="two-col" style={{ gridTemplateColumns: "1fr 1.1fr", marginTop: 0 }}>
        <div className="stack">
          <div className="panel stack">
            <h3 className="row" style={{ gap: 8 }}><Sparkles size={18} color="var(--red)" />Подобрать за меня</h3>
            <label className="field">Сколько у вас времени: <b style={{ color: "var(--ink)" }}>{gen.hours} ч</b>
              <input type="range" min={1} max={8} step={0.5} value={gen.hours} onChange={(e) => setGen({ ...gen, hours: Number(e.target.value) })} style={{ accentColor: "var(--red)" }} /></label>
            <div className="chips">{verts.map((v) => (
              <button key={v.slug} className={`chip ${gen.interests.includes(v.slug) ? "on" : ""}`}
                      onClick={() => setGen({ ...gen, interests: gen.interests.includes(v.slug) ? gen.interests.filter((x) => x !== v.slug) : [...gen.interests, v.slug] })}>
                <span className="sw" style={{ background: v.color }} />{v.name}</button>))}</div>
            <label className="check"><input type="checkbox" checked={gen.include_food} onChange={(e) => setGen({ ...gen, include_food: e.target.checked })} />Добавить паузу на обед или кофе</label>
            <button className="btn dark" onClick={generate} disabled={busy}><Sparkles size={18} />Подобрать маршрут</button>
          </div>

          <div className="panel stack">
            <div className="row between">
              <h3>Точки маршрута ({ids.length})</h3>
              <div className="row">
                <button className="btn secondary sm" onClick={() => { const f = Object.keys(favorites).map(Number); setIds(f); run(f, false); }}><Heart size={15} />Из избранного</button>
                <button className="btn secondary sm" onClick={() => { setAdding(true); setSearch(""); }}><Plus size={15} />Добавить</button>
              </div>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <label className="row small" style={{ gap: 8 }}>Старт<input type="time" className="input" style={{ width: 110, height: 36 }} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
              <div className="seg">
                <button className={transport === "walk" ? "on" : ""} onClick={() => setTransport("walk")}><Footprints size={15} />Пешком</button>
                <button className={transport === "car" ? "on" : ""} onClick={() => setTransport("car")}><Car size={15} />На машине</button>
              </div>
              <label className="check small"><input type="checkbox" checked={fromMe} onChange={async (e) => { if (e.target.checked && !geo) await requestGeo(); setFromMe(e.target.checked); }} />От моего местоположения</label>
            </div>
            {!ids.length ? (
              <Empty icon="map-pin" title="Маршрут пока пуст">Добавьте места в избранное ♥ или воспользуйтесь подбором выше<Link to="/catalog" className="btn secondary sm">Открыть каталог</Link></Empty>
            ) : tl ? (
              <>
                <div className="row small" style={{ gap: 16 }}><b>{fmtMin(tl.duration_min)}</b><span>{tl.distance_km} км</span><span className="muted">{tl.start}–{tl.finish}</span></div>
                <RouteChain tl={tl} transport={transport} actions={(_, i) => (
                  <div className="row" style={{ gap: 2 }}>
                    <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, -1)} aria-label="Выше"><ArrowUp size={15} /></button>
                    <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, 1)} aria-label="Ниже"><ArrowDown size={15} /></button>
                    <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => remove(i)} aria-label="Убрать"><Trash2 size={15} /></button>
                  </div>
                )} />
                <div className="row">
                  <button className="btn secondary" onClick={() => run(ids, false)} disabled={busy}><Shuffle size={17} />Оптимизировать порядок</button>
                  <button className="btn primary" onClick={save}><Save size={17} />Сохранить маршрут</button>
                </div>
              </>
            ) : <button className="btn primary" onClick={() => run(ids, false)} disabled={busy}>Построить</button>}
          </div>
        </div>
        <div className="card" style={{ height: 600, overflow: "hidden", position: "sticky", top: 84 }}>
          {tl ? <RouteMap tl={tl} user={geo} /> : <Empty icon="map-pin" title="Здесь появится карта маршрута" />}
        </div>
      </div>
      {adding && (
        <Modal title="Добавить место" onClose={() => setAdding(false)}>
          <input className="input" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию, адресу, тегам" />
          <div className="col" style={{ marginTop: 12 }}>
            {found.map((p) => <PlaceRow key={p.id} p={p} onClick={() => { if (!ids.includes(p.id)) { const n = [...ids, p.id]; setIds(n); run(n, true); } setAdding(false); }} />)}
          </div>
        </Modal>
      )}
    </div>
  );
}
