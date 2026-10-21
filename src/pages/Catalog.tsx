import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LayoutGrid, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { api, PlaceBrief, qs } from "../api";
import { useStore } from "../store";
import { SearchBox } from "./Home";
import MapView from "../ui/MapView";
import { Empty, Loading, PlaceCard, plural, PRICE, LABELS } from "../ui/kit";

const FORMATS = ["индивидуально", "группой", "по записи", "с детьми", "онлайн"];

export default function Catalog() {
  const { config, geo, requestGeo } = useStore();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState<{ items: PlaceBrief[]; total: number; hints: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "map">("grid");
  const [showFilters, setShowFilters] = useState(false);

  const get = (k: string) => sp.get(k) || "";
  const list = (k: string) => (sp.get(k) || "").split(",").filter(Boolean);
  const set = (k: string, v: any) => {
    const n = new URLSearchParams(sp);
    if (v === "" || v === false || v == null || (Array.isArray(v) && !v.length)) n.delete(k);
    else n.set(k, Array.isArray(v) ? v.join(",") : String(v));
    setSp(n, { replace: true });
  };
  const toggleIn = (k: string, v: string) => { const l = list(k); set(k, l.includes(v) ? l.filter((x) => x !== v) : [...l, v]); };

  const verts = config?.verticals || [];
  const selV = list("vertical");
  const cats = verts.filter((v) => !selV.length || selV.includes(v.slug)).flatMap((v) => v.categories);
  const selC = list("category");
  const dynFields = useMemo(() => {
    const src = selC.length ? cats.filter((c) => selC.includes(c.slug)) : selV.length ? cats : [];
    const seen = new Set<string>();
    return src.flatMap((c) => c.fields).filter((f) => f.filterable && !seen.has(f.key) && seen.add(f.key));
  }, [sp, config]); // eslint-disable-line

  const sort = get("sort") || (get("q") ? "relevance" : "popularity");

  useEffect(() => {
    setLoading(true);
    const params: any = Object.fromEntries(sp.entries());
    if (geo) { params.lat = geo.lat; params.lng = geo.lng; }
    params.sort = sort;
    params.limit = 120;
    api(`/api/places${qs(params)}`).then(setData).catch(() => setData({ items: [], total: 0, hints: [] })).finally(() => setLoading(false));
  }, [sp, geo]); // eslint-disable-line

  const active = Array.from(sp.keys()).filter((k) => !["q", "sort"].includes(k)).length;

  const Filters = (
    <div className="filters">
      <div>
        <h4>Направление</h4>
        <div className="chips">{verts.map((v) => (
          <button key={v.slug} className={`chip ${selV.includes(v.slug) ? "on" : ""}`} onClick={() => { toggleIn("vertical", v.slug); }}>
            <span className="sw" style={{ background: v.color }} />{v.name}
          </button>))}
        </div>
      </div>
      {cats.length > 0 && selV.length > 0 && (
        <div><h4>Категория</h4><div className="chips">{cats.map((c) => <button key={c.slug} className={`chip ${selC.includes(c.slug) ? "on" : ""}`} onClick={() => toggleIn("category", c.slug)}>{c.name}</button>)}</div></div>
      )}
      <div>
        <h4>Рейтинг</h4>
        <div className="seg">{[["", "Любой"], ["4", "4+"], ["4.5", "4.5+"]].map(([v, l]) => <button key={v} className={get("min_rating") === v ? "on" : ""} onClick={() => set("min_rating", v)}>{l}</button>)}</div>
      </div>
      <div>
        <h4>Стоимость</h4>
        <div className="seg">{[["", "Любая"], ["0", "Бесплатно"], ["1", PRICE[1]], ["2", "до " + PRICE[2]]].map(([v, l]) => <button key={v} className={get("price_max") === v ? "on" : ""} onClick={() => set("price_max", v)}>{l}</button>)}</div>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <label className="check"><input type="checkbox" checked={!!get("open_now")} onChange={(e) => set("open_now", e.target.checked)} />Открыто сейчас</label>
        <label className="check"><input type="checkbox" checked={!!get("made_in_region")} onChange={(e) => set("made_in_region", e.target.checked)} />Сделано в регионе</label>
        <label className="check"><input type="checkbox" checked={!!get("accessible")} onChange={(e) => set("accessible", e.target.checked)} />Доступная среда</label>
      </div>
      <div><h4>Формат посещения</h4><div className="chips">{FORMATS.map((f) => <button key={f} className={`chip ${list("formats").includes(f) ? "on" : ""}`} onClick={() => toggleIn("formats", f)}>{f}</button>)}</div></div>
      <div><h4>Метки организаций</h4><div className="chips">{Object.entries(LABELS).map(([k, l]) => <button key={k} className={`chip ${list("label").includes(k) ? "on" : ""}`} onClick={() => toggleIn("label", k)}>{l}</button>)}</div></div>
      {dynFields.length > 0 && (
        <div className="col" style={{ gap: 10 }}>
          <h4 style={{ margin: 0 }}>Параметры типа объекта</h4>
          {dynFields.map((f) => f.type === "bool"
            ? <label key={f.key} className="check"><input type="checkbox" checked={get(`attr_${f.key}`) === "true"} onChange={(e) => set(`attr_${f.key}`, e.target.checked ? "true" : "")} />{f.label}</label>
            : <label key={f.key} className="field">{f.label}<select className="select" value={get(`attr_${f.key}`)} onChange={(e) => set(`attr_${f.key}`, e.target.value)}><option value="">Любой</option>{(f.options || []).map((o) => <option key={o}>{o}</option>)}</select></label>)}
        </div>
      )}
      {active > 0 && <button className="btn ghost" onClick={() => setSp(get("q") ? { q: get("q") } : {}, { replace: true })}><X size={16} />Сбросить фильтры</button>}
    </div>
  );

  return (
    <div className="container page">
      <div className="page-head" style={{ alignItems: "center" }}>
        <h1>Каталог</h1>
        <div className="grow" style={{ maxWidth: 640 }}><SearchBox key={get("q")} initial={get("q")} /></div>
      </div>
      <div className="catalog">
        <div className="hide-mobile">{Filters}</div>
        <div>
          <div className="row between" style={{ marginBottom: 16 }}>
            <div className="small muted">{data ? `${data.total} ${plural(data.total, "объект", "объекта", "объектов")}` : "…"}
              {data?.hints?.length ? <> · Возможно, вы искали: <a style={{ color: "var(--blue)", cursor: "pointer", fontWeight: 600 }} onClick={() => set("q", data.hints[0])}>{data.hints[0]}</a></> : null}
            </div>
            <div className="row">
              <button className="btn secondary sm only-mobile" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={16} />Фильтры{active ? ` (${active})` : ""}</button>
              <select className="select" style={{ width: "auto", height: 36 }} value={sort} aria-label="Сортировка"
                      onChange={async (e) => { if (e.target.value === "distance" && !geo) await requestGeo(); set("sort", e.target.value); }}>
                {get("q") && <option value="relevance">По релевантности</option>}
                <option value="popularity">По популярности</option>
                <option value="rating">По рейтингу</option>
                <option value="distance">По расстоянию</option>
                <option value="name">По названию</option>
              </select>
              <div className="seg">
                <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} aria-label="Список"><LayoutGrid size={16} /><span className="hide-mobile">Список</span></button>
                <button className={view === "map" ? "on" : ""} onClick={() => setView("map")} aria-label="Карта"><MapIcon size={16} /><span className="hide-mobile">Карта</span></button>
              </div>
            </div>
          </div>
          {showFilters && <div className="only-mobile panel" style={{ display: "block", marginBottom: 16 }}>{Filters}</div>}
          {loading && !data ? <div className="grid">{[1, 2, 3, 4, 5, 6].map((i) => <Loading key={i} h={300} />)}</div>
            : !data?.items.length ? <Empty icon="map-pin" title="Ничего не нашлось">Попробуйте убрать часть фильтров или изменить запрос</Empty>
              : view === "map" ? (
                <div className="card" style={{ height: 620, overflow: "hidden" }}>
                  <MapView cluster fit user={geo} onPointClick={(p) => nav(`/place/${p.slug}`)}
                           points={data.items.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: p.vertical.color, icon: p.category?.icon, name: p.name, slug: p.slug, sub: p.category?.name, status: p.status }))} />
                </div>
              ) : <div className="grid">{data.items.map((p) => <PlaceCard key={p.id} p={p} />)}</div>}
        </div>
      </div>
    </div>
  );
}
