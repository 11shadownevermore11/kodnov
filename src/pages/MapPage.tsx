import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crosshair, List, Map as MapIcon, X, Building2 } from "lucide-react";
import { api, PlaceBrief, qs } from "../api";
import { useAsync, useStore } from "../store";
import MapView, { MapPoint } from "../ui/MapView";
import { Icon, PlaceRow, Loading } from "../ui/kit";

export default function MapPage() {
  const { config, geo, requestGeo } = useStore();
  const nav = useNavigate();
  const pins = useAsync(() => api<any[]>("/api/places/map"), []);
  const sites = useAsync(() => api<any[]>("/api/invest/sites"), []);
  const [layers, setLayers] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [cluster, setCluster] = useState<MapPoint[] | null>(null);
  const [showSites, setShowSites] = useState(false);
  const [list, setList] = useState<PlaceBrief[]>([]);
  const [center, setCenter] = useState<[number, number] | undefined>();

  const verts = (config?.verticals || []).filter((v) => v.map_layer);
  const active = layers ?? verts.map((v) => v.slug);
  const vmap = Object.fromEntries(verts.map((v) => [v.slug, v]));

  const points: MapPoint[] = useMemo(() => (pins.data || []).filter((p) => active.includes(p.v)).map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, color: vmap[p.v]?.color || "#555", icon: vmap[p.v]?.icon, name: p.name, slug: p.slug, sub: p.c, status: p.s,
  })), [pins.data, active.join(","), config]); // eslint-disable-line

  useEffect(() => {
    api<{ items: PlaceBrief[] }>(`/api/places${qs({ vertical: active, lat: geo?.lat, lng: geo?.lng, sort: geo ? "distance" : "popularity", limit: 200 })}`)
      .then((r) => setList(r.items)).catch(() => {});
  }, [active.join(","), geo]); // eslint-disable-line

  const toggle = (slug: string) => setLayers(active.includes(slug) ? active.filter((s) => s !== slug) : [...active, slug]);
  const locate = async () => { const g = await requestGeo(); if (g) setCenter([g.lat, g.lng]); };

  const polygons = useMemo(() => showSites ? (sites.data || []).map((s) => ({
    id: s.id, coords: s.polygon, color: s.status === "free" ? "#1B4FA3" : s.status === "reserved" ? "#E58A00" : "#7A8292", name: `${s.name} — ${s.area_ha} га`,
    onClick: () => nav(`/investors/sites/${s.slug}`),
  })) : [], [showSites, sites.data]); // eslint-disable-line

  return (
    <div className={`map-shell ${mode === "list" ? "list-mode" : ""}`}>
      <aside className="map-side">
        <div className="head">
          <div className="row between"><h2 style={{ fontSize: 20 }}>Список</h2><span className="small muted">{list.length} объектов</span></div>
          <div className="chips">
            {verts.map((v) => (
              <button key={v.slug} className={`chip ${active.includes(v.slug) ? "on" : ""}`} onClick={() => toggle(v.slug)}>
                <span className="sw" style={{ background: v.color }} />{v.name}
              </button>
            ))}
          </div>
        </div>
        <div className="col" style={{ padding: 12, gap: 8 }}>
          {list.map((p) => <PlaceRow key={p.id} p={p} />)}
        </div>
      </aside>
      <div className="map-wrap">
        {pins.loading ? <Loading h={600} /> : (
          <MapView points={points} cluster user={geo} center={center} zoom={center ? 15 : 12} polygons={polygons}
                   onClusterList={setCluster} onPointClick={(p) => nav(`/place/${p.slug}`)} />
        )}
        <div className="map-layers only-mobile">
          <div className="chips scroll">
            {verts.map((v) => (
              <button key={v.slug} className={`chip ${active.includes(v.slug) ? "on" : ""}`} onClick={() => toggle(v.slug)} style={{ boxShadow: "var(--shadow)" }}>
                <span className="sw" style={{ background: v.color }} />{v.name}
              </button>
            ))}
          </div>
        </div>
        <div className="map-tools">
          <button className="icon-btn" onClick={locate} title="Моё местоположение" aria-label="Моё местоположение"><Crosshair size={18} /></button>
          <button className={`icon-btn ${showSites ? "" : ""}`} style={showSites ? { background: "var(--red)", color: "var(--on-accent)" } : {}} onClick={() => setShowSites(!showSites)}
                  title="Контуры инвестплощадок" aria-label="Контуры инвестплощадок"><Building2 size={18} /></button>
        </div>
        {cluster && (
          <div className="cluster-list card">
            <div className="row between" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
              <b>{cluster.length} объектов в этой точке</b>
              <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setCluster(null)} aria-label="Закрыть"><X size={16} /></button>
            </div>
            {cluster.map((p) => (
              <a key={p.id} onClick={() => nav(`/place/${p.slug}`)} className="row" style={{ padding: "10px 14px", cursor: "pointer", gap: 10 }}>
                <span className="pin" style={{ background: p.color, width: 26, height: 26, borderWidth: 2 }}><Icon name={p.icon} size={13} /></span>
                <div className="grow"><div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div><div className="tiny muted">{p.sub}</div></div>
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="only-mobile" style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 1100 }}>
        <div className="seg" style={{ boxShadow: "var(--shadow)" }}>
          <button className={mode === "map" ? "on" : ""} onClick={() => setMode("map")}><MapIcon size={16} />Карта</button>
          <button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}><List size={16} />Список</button>
        </div>
      </div>
    </div>
  );
}
