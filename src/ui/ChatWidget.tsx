import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Send, X } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";
import { fmtDate, Logo, Stars, fmtDist } from "./kit";

type Msg = { me?: boolean; text: string; data?: any };

const START = ["Где поесть рядом?", "Маршрут на 3 часа", "Что на выходных?", "Как добавить свой бизнес?"];

/** Чат-бот «Гид» — помощник по работе с платформой: ищет места, собирает маршруты, отвечает на вопросы. */
export default function ChatWidget() {
  const { geo } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ text: "Здравствуйте! Я Гид «Кода Новороссии». Найду место, соберу маршрут, расскажу об афише и помогу разобраться с платформой.", data: { suggestions: START } }]);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => { body.current?.scrollTo(0, body.current.scrollHeight); }, [msgs, open]);

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    setMsgs((m) => [...m, { me: true, text: t }]);
    setText("");
    setBusy(true);
    try {
      const r = await api("/api/assistant/chat", { body: { message: t, lat: geo?.lat, lng: geo?.lng } });
      setMsgs((m) => [...m, { text: r.reply, data: r }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { text: e.status === 0 ? "Без сети я не могу ответить — но поиск и карточки в каталоге работают офлайн." : e.message }]);
    } finally { setBusy(false); }
  };

  const openRoute = (r: any) => {
    try { sessionStorage.setItem("kod-builder", JSON.stringify(r.stops_raw.map((s: any) => s.place_id))); } catch { /* */ }
    setOpen(false);
    nav("/routes/builder");
  };

  return (
    <>
      {!open && <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Открыть помощника"><MessageCircle size={26} /></button>}
      {open && (
        <div className="chat" role="dialog" aria-label="Помощник">
          <div className="chat-head">
            <Logo size={28} />
            <div className="grow"><b>Гид</b><div className="tiny muted">Помощник по платформе</div></div>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={18} /></button>
          </div>
          <div className="chat-body" ref={body}>
            {msgs.map((m, i) => (
              <div key={i} className="col" style={{ gap: 6, alignItems: m.me ? "flex-end" : "flex-start" }}>
                <div className={`msg ${m.me ? "me" : "bot"}`}>{m.text}</div>
                {m.data?.places?.slice(0, 4).map((p: any) => (
                  <Link key={p.id} to={`/place/${p.slug}`} onClick={() => setOpen(false)} className="card" style={{ padding: "8px 12px", width: "86%" }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                    <div className="row tiny muted" style={{ gap: 8 }}><Stars value={p.rating} />{p.category?.name}{p.distance_m != null && <span>{fmtDist(p.distance_m)}</span>}</div>
                  </Link>
                ))}
                {m.data?.events?.map((e: any) => (
                  <Link key={e.id} to={`/events/${e.slug}`} onClick={() => setOpen(false)} className="card" style={{ padding: "8px 12px", width: "86%" }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{e.title}</div>
                    <div className="tiny muted">{fmtDate(e.start)}{e.place ? ` · ${e.place.name}` : ""}</div>
                  </Link>
                ))}
                {m.data?.route && (
                  <div className="card" style={{ padding: "10px 12px", width: "86%" }}>
                    {m.data.route.stops.map((s: any, k: number) => <div key={k} className="tiny"><b>{s.arrive}</b> {s.kind === "pause" ? "☕ " : ""}{s.name}</div>)}
                    <button className="btn primary sm" style={{ marginTop: 8 }} onClick={() => openRoute(m.data.route)}>Открыть маршрут</button>
                  </div>
                )}
                {m.data?.actions?.map((a: any) => <Link key={a.to} to={a.to} onClick={() => setOpen(false)} className="btn secondary sm">{a.label}</Link>)}
                {m.data?.suggestions && <div className="chips">{m.data.suggestions.map((s: string) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>}
              </div>
            ))}
            {busy && <div className="msg bot muted">Ищу…</div>}
          </div>
          <form className="chat-foot" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Спросите, например: музеи рядом" aria-label="Сообщение" />
            <button className="btn primary" disabled={busy || !text.trim()} aria-label="Отправить"><Send size={18} /></button>
          </form>
        </div>
      )}
    </>
  );
}
