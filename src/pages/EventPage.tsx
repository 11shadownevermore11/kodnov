import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarPlus, MapPin, Ticket, Users } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import { Cover, evIcon, ErrorBox, fmtDate, Loading, Modal } from "../ui/kit";

function ics(e: any) {
  const f = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kod Novorossii//RU", "BEGIN:VEVENT", `UID:${e.slug}@kod`, `DTSTART:${f(e.start)}`,
    `DTEND:${f(e.end || e.start)}`, `SUMMARY:${e.title}`, `LOCATION:${e.place ? `${e.place.name}, ${e.place.address}` : ""}`, `DESCRIPTION:${e.description.replace(/\n/g, " ")}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = `${e.slug}.ics`;
  a.click();
}

export default function EventPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { user, toast, config } = useStore();
  const { data: e, error, loading, reload } = useAsync(() => api(`/api/events/${slug}`), [slug]);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState(1);
  if (loading && !e) return <div className="container page"><Loading h={400} /></div>;
  if (error || !e) return <div className="container page"><ErrorBox text={error || ""} retry={reload} /></div>;
  const left = e.capacity ? e.capacity - e.booked : null;
  const book = async () => {
    try { const r = await api("/api/bookings", { body: { event_id: e.id, people } }); toast(r.message); setOpen(false); reload(); } catch (er: any) { toast(er.message, "err"); }
  };
  return (
    <div className="container page">
      <div className="small muted"><Link to="/events">Афиша</Link></div>
      <div className="place-hero">
        <Cover color={e.vertical?.color || "#E3263A"} icon={evIcon(e.kind)} seed={e.id + 500} height={320} radius={20} iconSize={70} photo={e.place?.photo} />
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 6 }}><span className="badge cat" style={{ ["--c" as any]: e.vertical?.color }}>{config?.dictionaries?.event_kinds?.[e.kind]}</span>{e.vertical && <span className="badge">{e.vertical.name}</span>}<span className="badge">{e.age}</span></div>
          <h1 style={{ fontSize: "clamp(26px, 3.4vw, 40px)" }}>{e.title}</h1>
          <div className="col" style={{ gap: 6 }}>
            <div className="row"><CalendarPlus size={18} /><b>{fmtDate(e.start)}</b>{e.end && <span className="muted">— {fmtDate(e.end)}</span>}</div>
            {e.place && <Link to={`/place/${e.place.slug}`} className="row"><MapPin size={18} />{e.place.name}, {e.place.address}</Link>}
            <div className="row"><Ticket size={18} />{e.price ? `${e.price} ₽` : "Вход свободный"}</div>
            {left != null && <div className="row"><Users size={18} />Осталось мест: {left} из {e.capacity}</div>}
          </div>
          <div className="row">
            {e.registration && <button className="btn primary" disabled={left === 0} onClick={() => { if (!user) { nav(`/login?next=/events/${e.slug}`); return; } setOpen(true); }}>Записаться</button>}
            <button className="btn secondary" onClick={() => ics(e)}><CalendarPlus size={18} />В календарь</button>
          </div>
        </div>
      </div>
      <div className="two-col">
        <div className="panel"><h2 style={{ marginBottom: 12 }}>О событии</h2><p style={{ maxWidth: "70ch" }}>{e.description}</p></div>
        {e.place && <div className="card" style={{ height: 280, overflow: "hidden" }}><MapView center={[e.place.lat, e.place.lng]} zoom={15} points={[{ id: 1, lat: e.place.lat, lng: e.place.lng, color: e.vertical?.color || "#E3263A", name: e.place.name, slug: e.place.slug, icon: "star" }]} /></div>}
      </div>
      {open && (
        <Modal title="Запись на событие" onClose={() => setOpen(false)}>
          <div className="stack">
            <label className="field">Сколько человек<input className="input" type="number" min={1} max={left || 50} value={people} onChange={(ev) => setPeople(Number(ev.target.value))} /></label>
            <button className="btn primary" onClick={book}>Подтвердить запись</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
