// Клиент общего API. Один и тот же бэкенд обслуживает сайт и мобильное приложение.
export const TOKEN_KEY = "kod-token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* приватный режим */ }
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) { super(message); this.status = status; this.data = data; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; token?: string | null; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Client": "web" };
  const token = opts.token !== undefined ? opts.token : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: any;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, "Нет соединения с сервером. Данные из кэша доступны офлайн.");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : Array.isArray(data?.detail) ? "Проверьте заполнение полей" : `Ошибка ${res.status}`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const qs = (o: Record<string, any>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const r = await api<{ url: string }>("/api/upload", { method: "POST", form });
  return r.url;
}

export async function track(type: string, place_id?: number, meta: any = {}) {
  try { await api("/api/analytics/event", { body: { type, place_id, meta } }); } catch { /* офлайн — не критично */ }
}

// ---------- Типы ----------
export type Vertical = {
  photo?: string | null; // своё фото из photos/directions/<slug>.jpg
  id: number; slug: string; name: string; short: string; description: string; icon: string; color: string; stage: number;
  is_professional: boolean; enabled: boolean; map_layer: boolean; sort: number; form_title: string; form_fields: Field[]; count: number;
  categories: Category[];
};
export type Category = { id: number; slug: string; name: string; icon: string; fields: Field[]; default_stay_min: number };
export type Field = { key: string; label: string; type: string; options?: string[]; unit?: string; filterable?: boolean; required?: boolean; value?: any };
export type PlaceBrief = {
  id: number; slug: string; name: string; short: string; address: string; city: string; lat: number; lng: number; photos: string[];
  status: string; rating: number; reviews_count: number; price_level: number; tags: string[]; labels: string[]; formats: string[];
  made_in_region: boolean; accessible: boolean; open_now: boolean | null; today_hours: string; distance_m?: number;
  vertical: { id: number; slug: string; name: string; color: string; icon: string };
  category: { id: number; slug: string; name: string; icon: string };
  views: number; favorites_count: number; moderation?: string;
};
export type Config = { app: any; verticals: Vertical[]; dictionaries: any; version: string };
export type User = {
  id: number; email: string; name: string; role: string; role_title: string; is_expert: boolean; owner_verified: boolean;
  totp_enabled: boolean; interests: string[]; investor_profile: any; settings: any; is_service: boolean; stats?: any;
};
