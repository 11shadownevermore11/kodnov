import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Anchor, Lock, Upload } from "lucide-react";
import { api, upload } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import { fmtDate, Loading, Modal, PlaceRow } from "../ui/kit";
import { AudioGuide } from "./PlacePage";

export default function Heritage() {
  const { user, toast } = useStore();
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api("/api/heritage"), []);
  const expert = useAsync(() => (user && (user.is_expert || ["admin", "moderator"].includes(user.role)) ? api("/api/heritage/expert") : Promise.resolve(null)), [user?.id]);
  const [form, setForm] = useState<any>(null);
  const [note, setNote] = useState("");
  if (loading || !data) return <div className="container page"><Loading h={400} /></div>;
  const send = async () => {
    try { const r = await api("/api/heritage/stories", { body: form }); toast(r.message); setForm(null); } catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <div className="container page">
      <div className="page-head">
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: "#0E9AB0", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Anchor size={30} /></span>
          <div><h1>Морское наследие Приазовья</h1><p className="lead" style={{ marginTop: 8 }}>Маяки, порты и косы Азовского побережья — истории, которые рассказывают жители и эксперты. Каждую можно прослушать как аудиогид.</p></div>
        </div>
        <button className="btn primary" onClick={() => (user ? setForm({ title: "", text: "", period: "", photos: [], rights_confirmed: false }) : nav("/login?next=/heritage"))}><Upload size={18} />Поделиться историей</button>
      </div>
      <div className="two-col" style={{ gridTemplateColumns: "1.2fr 1fr", marginTop: 0 }}>
        <div className="stack">
          {data.stories.map((s: any) => (
            <article key={s.id} className="panel stack">
              <div className="row between"><h3 style={{ fontSize: 19 }}>{s.title}</h3>{s.period && <span className="badge">{s.period}</span>}</div>
              <p style={{ maxWidth: "68ch" }}>{s.text}</p>
              <div className="row between">
                <span className="small muted">{s.author}{s.author_kind === "resident" ? " — житель" : s.author_kind === "expert" ? " — эксперт" : ""}{s.place ? <> · <Link to={`/place/${s.place.slug}`} style={{ color: "var(--blue)" }}>{s.place.name}</Link></> : null}</span>
                <div className="row"><span className="tiny muted">{s.listens} прослушиваний</span><AudioGuide story={s} /></div>
              </div>
            </article>
          ))}
        </div>
        <div className="stack" style={{ position: "sticky", top: 84, alignSelf: "start" }}>
          <div className="card" style={{ height: 320, overflow: "hidden" }}>
            <MapView fit onPointClick={(p) => nav(`/place/${p.slug}`)} points={data.places.map((p: any) => ({ id: p.id, lat: p.lat, lng: p.lng, color: "#0E9AB0", icon: p.category.icon, name: p.name, slug: p.slug }))} />
          </div>
          {data.places.map((p: any) => <PlaceRow key={p.id} p={p} />)}
          {expert.data && (
            <div className="panel stack">
              <h3 className="row" style={{ gap: 8 }}><Lock size={18} />Рабочее пространство экспертов</h3>
              <div className="small muted">Закрытый раздел: проверка материалов жителей и заметки исследователей.</div>
              {expert.data.pending.map((s: any) => <div key={s.id} className="card" style={{ padding: 12 }}><b>{s.title}</b><div className="small">{s.text}</div><div className="tiny muted">{s.author} · ждёт модерации</div></div>)}
              {expert.data.notes.map((n: any) => <div key={n.id} className="small"><b>{n.user_name}</b> <span className="muted">{fmtDate(n.created_at)}</span><div>{n.text}</div></div>)}
              <div className="row"><input className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка для коллег" />
                <button className="btn secondary" onClick={async () => { if (!note) return; await api("/api/heritage/expert/notes", { body: { text: note } }); setNote(""); expert.reload(); }}>Добавить</button></div>
            </div>
          )}
        </div>
      </div>
      {form && (
        <Modal title="Ваша история о море" onClose={() => setForm(null)}>
          <div className="stack">
            <label className="field">Заголовок<input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="field">Место<select className="select" value={form.place_id || ""} onChange={(e) => setForm({ ...form, place_id: e.target.value ? Number(e.target.value) : null })}><option value="">Не привязано</option>{data.places.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="field">Период (например, 1970-е)<input className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} /></label>
            <label className="field">История<textarea className="textarea" style={{ minHeight: 140 }} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></label>
            <label className="btn secondary sm" style={{ alignSelf: "flex-start" }}><Upload size={15} />Прикрепить фото ({form.photos.length})
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await upload(f); setForm((x: any) => ({ ...x, photos: [...x.photos, url] })); } }} /></label>
            <label className="check"><input type="checkbox" checked={form.rights_confirmed} onChange={(e) => setForm({ ...form, rights_confirmed: e.target.checked })} />Я автор текста и фото или имею право их публиковать</label>
            <button className="btn primary" disabled={!form.title || !form.text || !form.rights_confirmed} onClick={send}>Отправить на модерацию</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
