import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import { Icon } from "./kit";
import { useStore } from "../store";

export type MapPoint = { id: number; lat: number; lng: number; color: string; icon?: string; name: string; slug?: string; sub?: string; status?: string; order?: number };

const iconCache: Record<string, string> = {};
const svgFor = (name?: string) => (iconCache[name || ""] ??= renderToStaticMarkup(<Icon name={name} size={15} />));

type Props = {
  points?: MapPoint[];
  center?: [number, number];
  zoom?: number;
  cluster?: boolean;
  polyline?: [number, number][];
  polylineColor?: string;
  polygons?: { id: number; coords: [number, number][]; color: string; name: string; onClick?: () => void }[];
  user?: { lat: number; lng: number } | null;
  fit?: boolean;
  onPointClick?: (p: MapPoint) => void;
  onClusterList?: (pts: MapPoint[]) => void;
  onMapClick?: (lat: number, lng: number) => void;
  marker?: [number, number] | null;
  style?: React.CSSProperties;
  numbered?: boolean;
};

/** Карта на Leaflet: слои по вертикалям, кластеризация с числом объектов,
 *  клик по кластеру — приближение, а на крупном масштабе — список объектов кластера. */
export default function MapView(props: Props) {
  const { dark } = useStore();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const extra = useRef<L.LayerGroup | null>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(props.center || [48.008, 37.804], props.zoom || 12);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    m.on("click", (e: L.LeafletMouseEvent) => cb.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    extra.current = L.layerGroup().addTo(m);
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tiles.current?.remove();
    const url = dark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    tiles.current = L.tileLayer(url, { maxZoom: 19, subdomains: "abcd", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO' }).addTo(m);
    tiles.current.bringToBack();
  }, [dark]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current?.remove();
    const pts = props.points || [];
    const group: L.LayerGroup = props.cluster
      ? (L as any).markerClusterGroup({
          zoomToBoundsOnClick: false, showCoverageOnHover: false, spiderfyOnMaxZoom: false, maxClusterRadius: 52,
          iconCreateFunction: (c: any) => {
            const kids = c.getAllChildMarkers();
            const counts: Record<string, number> = {};
            kids.forEach((k: any) => (counts[k.options.pt.color] = (counts[k.options.pt.color] || 0) + 1));
            const color = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
            const n = kids.length;
            const size = n < 10 ? 40 : n < 30 ? 48 : 56;
            const ring = Object.keys(counts).length > 1 ? `box-shadow:0 0 0 4px ${Object.keys(counts).filter((x) => x !== color)[0]}55, 0 3px 12px rgba(0,0,0,.3)` : "";
            return L.divIcon({ html: `<div class="cluster" style="width:${size}px;height:${size}px;background:${color};${ring}">${n}</div>`, className: "", iconSize: [size, size] });
          },
        })
      : L.layerGroup();
    pts.forEach((p) => {
      const inner = props.numbered && p.order ? `<b style="font-size:13px">${p.order}</b>` : svgFor(p.icon);
      const mk = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ html: `<div class="pin ${p.status && p.status !== "open" ? "closed" : ""}" style="background:${p.color}">${inner}</div>`, className: "", iconSize: [30, 30], iconAnchor: [15, 15] }),
        title: p.name, keyboard: true, pt: p,
      } as any);
      mk.on("click", () => cb.current.onPointClick?.(p));
      if (!cb.current.onPointClick) {
        mk.bindPopup(`<b>${escapeHtml(p.name)}</b>${p.sub ? `<div style="color:var(--ink-3);font-size:13px">${escapeHtml(p.sub)}</div>` : ""}${p.slug ? `<div style="margin-top:6px"><a href="/place/${p.slug}" style="color:var(--blue);font-weight:600">Открыть карточку</a></div>` : ""}`);
      }
      group.addLayer(mk);
    });
    if (props.cluster) {
      (group as any).on("clusterclick", (e: any) => {
        const c = e.layer;
        const b = c.getBounds();
        const tight = m.getZoom() >= 16 || b.getNorthEast().distanceTo(b.getSouthWest()) < 60;
        if (tight && cb.current.onClusterList) cb.current.onClusterList(c.getAllChildMarkers().map((k: any) => k.options.pt));
        else c.zoomToBounds({ padding: [40, 40] });
      });
    }
    group.addTo(m);
    layer.current = group;
    if (props.fit && pts.length) m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [50, 50], maxZoom: 15 });
  }, [props.points, props.cluster]); // eslint-disable-line

  useEffect(() => {
    const m = map.current;
    const g = extra.current;
    if (!m || !g) return;
    g.clearLayers();
    if (props.polyline && props.polyline.length > 1) {
      L.polyline(props.polyline, { color: props.polylineColor || "#17191F", weight: 4, opacity: .85, dashArray: undefined }).addTo(g);
    }
    (props.polygons || []).forEach((pg) => {
      const poly = L.polygon(pg.coords, { color: pg.color, weight: 2, fillOpacity: .22 }).addTo(g);
      poly.bindTooltip(pg.name, { sticky: true });
      if (pg.onClick) poly.on("click", pg.onClick);
    });
    if (props.polygons?.length && props.fit && !(props.points || []).length) {
      m.fitBounds(L.latLngBounds(props.polygons.flatMap((p) => p.coords)), { padding: [40, 40] });
    }
    if (props.user) {
      L.marker([props.user.lat, props.user.lng], { icon: L.divIcon({ html: '<div class="me-dot"></div>', className: "", iconSize: [18, 18], iconAnchor: [9, 9] }), title: "Вы здесь" }).addTo(g);
    }
    if (props.marker) {
      L.marker(props.marker, { icon: L.divIcon({ html: '<div class="pin" style="background:#E3263A"></div>', className: "", iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(g);
    }
  }, [props.polyline, props.polygons, props.user, props.marker]); // eslint-disable-line

  useEffect(() => {
    if (map.current && props.center) map.current.setView(props.center, props.zoom || map.current.getZoom());
  }, [props.center?.[0], props.center?.[1]]); // eslint-disable-line

  return <div ref={el} style={{ width: "100%", height: "100%", ...props.style }} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
