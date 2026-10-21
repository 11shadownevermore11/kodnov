import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, Config, getToken, PlaceBrief, setToken, User } from "./api";

type Toast = { id: number; text: string; kind?: "ok" | "err" };
export type Palette = "night" | "rose" | "sea" | "sunset" | "steppe" | "classic" | "azure";
export const PALETTES: { id: Palette; name: string; dark: boolean; swatch: [string, string] }[] = [
  { id: "night", name: "Ночной Донбасс", dark: true, swatch: ["#0A1A2F", "#F5C451"] },
  { id: "rose", name: "Донецкая роза", dark: true, swatch: ["#1A0F1F", "#FF5C8A"] },
  { id: "sea", name: "Азовское море", dark: true, swatch: ["#04232A", "#3FD1C2"] },
  { id: "sunset", name: "Закат над терриконами", dark: true, swatch: ["#170F2E", "#FF8A3D"] },
  { id: "steppe", name: "Степь", dark: false, swatch: ["#EDF1E4", "#C8641E"] },
  { id: "classic", name: "Классика", dark: false, swatch: ["#F3F5F9", "#E3263A"] },
  { id: "azure", name: "Классика · синяя", dark: false, swatch: ["#F2F6FB", "#1E7BE0"] },
];

type Store = {
  config: Config | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  favorites: Record<number, PlaceBrief>;
  isFav: (id: number) => boolean;
  toggleFav: (p: PlaceBrief) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
  dark: boolean;
  proMode: boolean;
  setProMode: (v: boolean) => void;
  geo: { lat: number; lng: number } | null;
  requestGeo: () => Promise<{ lat: number; lng: number } | null>;
  toast: (text: string, kind?: "ok" | "err") => void;
  toasts: Toast[];
  online: boolean;
  reloadConfig: () => void;
};

const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(() => LS.get("kod-config", null));
  const [user, setUser] = useState<User | null>(null);
  // Избранное хранится на устройстве: работает без входа и без сети; после входа — синхронизируется.
  const [favorites, setFavorites] = useState<Record<number, PlaceBrief>>(() => LS.get("kod-favs", {}));
  const [removedFavs, setRemovedFavs] = useState<number[]>(() => LS.get("kod-favs-removed", []));
  const [palette, setPaletteState] = useState<Palette>(() => {
    try { const v = localStorage.getItem("kod-palette") as Palette; if (v && PALETTES.some((p) => p.id === v)) return v; } catch { /* */ }
    return "night";
  });
  const [proMode, setPro] = useState<boolean>(() => LS.get("kod-pro", false));
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(navigator.onLine);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const reloadConfig = useCallback(() => {
    api<Config>("/api/config").then((c) => { setConfig(c); LS.set("kod-config", c); }).catch(() => {});
  }, []);

  useEffect(() => {
    reloadConfig();
    const t = setInterval(reloadConfig, 60000); // новые вертикали подхватываются без перезагрузки
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [reloadConfig]);

  const syncFavs = useCallback(async (favs: Record<number, PlaceBrief>, removed: number[]) => {
    if (!getToken()) return;
    try {
      const r = await api<{ ids: number[] }>("/api/me/favorites/sync", { body: { ids: Object.keys(favs).map(Number), removed } });
      setRemovedFavs([]); LS.set("kod-favs-removed", []);
      const missing = r.ids.filter((id) => !favs[id]);
      if (missing.length) {
        const list = await api<PlaceBrief[]>("/api/me/favorites");
        const next = { ...favs };
        list.forEach((p) => (next[p.id] = p));
        setFavorites(next); LS.set("kod-favs", next);
      }
    } catch { /* офлайн — синхронизируем позже */ }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try { setUser(await api<User>("/api/auth/me")); } catch (e: any) { if (e.status === 401) { setToken(null); setUser(null); } }
  }, []);

  useEffect(() => { refreshUser().then(() => syncFavs(LS.get("kod-favs", {}), LS.get("kod-favs-removed", []))); }, [refreshUser, syncFavs]);
  useEffect(() => { if (online) syncFavs(favorites, removedFavs); }, [online]); // eslint-disable-line

  const setAuth = (token: string, u: User) => { setToken(token); setUser(u); syncFavs(favorites, removedFavs); };
  const logout = () => { setToken(null); setUser(null); };

  const toggleFav = (p: PlaceBrief) => {
    const next = { ...favorites };
    let removed = removedFavs;
    if (next[p.id]) {
      delete next[p.id];
      removed = [...removedFavs, p.id];
      toast("Убрано из избранного");
      if (getToken()) api(`/api/me/favorites/${p.id}`, { method: "DELETE" }).then(() => { removed = removed.filter((x) => x !== p.id); setRemovedFavs(removed); LS.set("kod-favs-removed", removed); }).catch(() => {});
    } else {
      next[p.id] = p;
      removed = removedFavs.filter((x) => x !== p.id);
      toast(online ? "Добавлено в избранное" : "Добавлено в избранное (офлайн, синхронизируем позже)");
      if (getToken()) api(`/api/me/favorites/${p.id}`, { method: "POST" }).catch(() => {});
    }
    setFavorites(next); LS.set("kod-favs", next);
    setRemovedFavs(removed); LS.set("kod-favs-removed", removed);
  };

  const setPalette = (p: Palette) => {
    setPaletteState(p);
    try { localStorage.setItem("kod-palette", p); } catch { /* */ }
  };
  const dark = PALETTES.find((p) => p.id === palette)?.dark ?? true;
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0A1A2F");
  }, [palette]);

  const setProMode = (v: boolean) => { setPro(v); LS.set("kod-pro", v); };

  const requestGeo = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { const g = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setGeo(g); resolve(g); },
      () => { toast("Не удалось определить местоположение — разрешите доступ к геолокации", "err"); resolve(null); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

  const value = useMemo<Store>(() => ({
    config, user, setAuth, logout, refreshUser, favorites, isFav: (id) => !!favorites[id], toggleFav, palette, setPalette, dark,
    proMode, setProMode, geo, requestGeo, toast, toasts, online, reloadConfig,
  }), [config, user, favorites, palette, dark, proMode, geo, toasts, online]); // eslint-disable-line

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true); setError(null);
    return fn().then((d) => { setData(d); return d; }).catch((e) => { setError(e.message); return null; }).finally(() => setLoading(false));
  }, deps); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}
