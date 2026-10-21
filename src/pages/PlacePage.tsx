import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as I from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, track, upload } from "../api";
import { useAsync, useStore } from "../store";
import MapView from "../ui/MapView";
import {
  Cover, DynamicField, Empty, ErrorBox, FavButton, fmtDate, fmtDist, LABELS, Loading, Modal, PlaceRow, PRICE, Stars, Status, STATUS,
} from "../ui/kit";

const DAYS: [string, string][] = [["mon", "Понедельник"], ["tue", "Вторник"], ["wed", "Среда"], ["thu", "Четверг"], ["fri", "Пятница"], ["sat", "Суббота"], ["sun", "Воскресенье"]];

export function speak(text: string, onEnd?: () => void) {
  const s = window.speechSynthesis;
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  u.rate = 0.98;
  const v = s.getVoices().find((x) => x.lang.startsWith("ru"));
  if (v) u.voice = v;
  u.onend = () => onEnd?.();
  s.speak(u);
  return true;
}

export function AudioGuide({ story }: { story: any }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const toggle = () => {
    if (playing) { window.speechSynthesis?.cancel(); setPlaying(false); return; }
    if (story.audio_url) { new Audio(story.audio_url).play(); return; }
    if (speak(`${story.title}. ${story.text}`, () => setPlaying(false))) { setPlaying(true); api(`/api/heritage/stories/${story.id}/listen`, { method: "POST" }).catch(() => {}); }
  };
  return <button className={`btn ${playing ? "active" : "secondary"} sm`} onClick={toggle}>{playing ? <I.Square size={14} /> : <I.Play size={14} />}{playing ? "Остановить" : "Слушать аудиогид"}</button>;
}

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} из 5`} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: n <= value ? "#F2A900" : "var(--line)" }}>
          <I.Star size={30} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export default function PlacePage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { user, toast, geo, requestGeo, config } = useStore();
  const { data: p, error, loading, reload } = useAsync(() => api(`/api/places/${slug}`), [slug, user?.id]);
  const [modal, setModal] = useState<null | "report" | "review" | "book" | "promo" | "copyright" | "form" | "route">(null);
  const [form, setForm] = useState<any>({});
  const [slot, setSlot] = useState<any>(null);
  const [promo, setPromo] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  if (loading && !p) return <div className="container page"><Loading h={420} /></div>;
  if (error || !p) return <div className="container page"><ErrorBox text={error || ""} retry={reload} /></div>;

  const vertical = config?.verticals.find((v) => v.slug === p.vertical.slug);
  const needLogin = () => { toast("Войдите, чтобы продолжить", "err"); nav(`/login?next=/place/${p.slug}`); };

  const share = async () => {
    const url = window.location.href;
    track("share", p.id);
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: p.short, url });
      else { await navigator.clipboard.writeText(url); toast("Ссылка скопирована"); }
    } catch { /* отменено */ }
  };
  const buildRoute = (kind: "yandex" | "osm" | "mine") => {
    track("route_build", p.id);
    if (kind === "yandex") window.open(`https://yandex.ru/maps/?rtext=${geo ? `${geo.lat},${geo.lng}` : ""}~${p.lat},${p.lng}&rtt=pd`, "_blank");
    if (kind === "osm") window.open(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${geo ? `${geo.lat},${geo.lng}` : ""};${p.lat},${p.lng}`, "_blank");
    if (kind === "mine") {
      let ids: number[] = [];
      try { ids = JSON.parse(sessionStorage.getItem("kod-builder") || "[]"); } catch { /* */ }
      if (!ids.includes(p.id)) ids.push(p.id);
      try { sessionStorage.setItem("kod-builder", JSON.stringify(ids)); } catch { /* */ }
      nav("/routes/builder");
    }
    setModal(null);
  };
  const checkin = async () => {
    if (!user) return needLogin();
    const g = await requestGeo();
    try {
      await api("/api/checkins", { body: { place_id: p.id, lat: g?.lat, lng: g?.lng } });
      toast("Штамп получен! Он уже в вашем паспорте путешественника");
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  const submit = async (fn: () => Promise<any>, ok: string) => {
    try { const r = await fn(); toast(r?.message || ok); setModal(null); setForm({}); reload(); } catch (e: any) { toast(e.message, "err"); }
  };
  const activatePromo = async (pr: any) => {
    try { const r = await api(`/api/promos/${pr.id}/activate`, { method: "POST" }); setPromo({ ...pr, ...r }); setModal("promo"); } catch (e: any) { toast(e.message, "err"); }
  };
  const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const isIndustry = p.vertical.slug === "industry";

  return (
    <div className="container page">
      <div className="crumbs">
        <Link to="/catalog">Каталог</Link><I.ChevronRight size={14} />
        <Link to={`/v/${p.vertical.slug}`}>{p.vertical.name}</Link><I.ChevronRight size={14} />
        <Link to={`/catalog?vertical=${p.vertical.slug}&category=${p.category.slug}`}>{p.category.name}</Link>
      </div>

      <div className="place-hero">
        <div>
          <Cover color={p.vertical.color} icon={p.category.icon} seed={p.id} height={360} radius={20} iconSize={84} photo={p.photos?.[0]} />
          {p.photos?.length > 1 && <div className="row" style={{ marginTop: 8 }}>{p.photos.slice(1, 6).map((ph: string) => <img key={ph} src={ph} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />)}</div>}
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge cat" style={{ ["--c" as any]: p.vertical.color }}>{p.category.name}</span>
            {p.made_in_region && <span className="badge region">Сделано в регионе</span>}
            {p.accessible && <span className="badge blue"><I.Accessibility size={13} />Доступная среда</span>}
            {p.labels.map((l: string) => <span key={l} className="badge ok">{LABELS[l]}</span>)}
          </div>
          <h1 style={{ fontSize: "clamp(26px, 3.4vw, 40px)" }}>{p.name}</h1>
          <p className="lead" style={{ fontSize: 17 }}>{p.short}</p>
          <div className="row" style={{ gap: 16 }}>
            <Stars value={p.rating} count={p.reviews_count} />
            <Status p={p} />
            <span className="muted">{PRICE[p.price_level]}{p.avg_check ? ` · средний чек ${p.avg_check} ₽` : ""}</span>
          </div>
          {p.status === "temporarily_unavailable" && <div className="badge warn" style={{ height: "auto", padding: "8px 12px", whiteSpace: "normal" }}>Объект временно недоступен для посещения — проверьте информацию перед поездкой</div>}
          <div className="place-actions">
            <button className="btn primary" onClick={() => setModal("route")}><I.Navigation size={18} />Построить маршрут</button>
            <FavButton p={p} big />
            <button className="btn secondary" onClick={share}><I.Share2 size={18} />Поделиться</button>
            <button className="btn ghost" onClick={() => setModal("report")}><I.Flag size={18} />Сообщить о неточности</button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary sm" onClick={checkin}><I.Stamp size={16} />Отметиться здесь</button>
            {vertical?.form_fields?.length ? <button className="btn secondary sm" onClick={() => { setForm({}); setModal("form"); }}><I.Send size={16} />{vertical.form_title}</button> : null}
            {p.is_owner && <Link to="/cabinet" className="btn dark sm"><I.Settings size={16} />Управлять карточкой</Link>}
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="stack">
          <section className="panel stack">
            <h2>О месте</h2>
            <p style={{ whiteSpace: "pre-line", maxWidth: "70ch" }}>{p.description}</p>
            {p.fields.length > 0 && (
              <dl className="kv">
                {p.fields.map((f: any) => (
                  <Fragment key={f.key}><dt>{f.label}</dt><dd>{f.type === "bool" ? (f.value ? "Да" : "Нет") : `${f.value}${f.unit ? ` ${f.unit}` : ""}`}</dd></Fragment>
                ))}
              </dl>
            )}
            {p.tags.length > 0 && <div className="chips">{p.tags.map((t: string) => <Link key={t} to={`/catalog?q=${encodeURIComponent(t)}`} className="chip">#{t}</Link>)}</div>}
            {p.formats.length > 0 && <div className="small muted">Формат посещения: {p.formats.join(", ")}</div>}
          </section>

          {isIndustry && p.attrs?.access_status && (
            <section className="panel stack">
              <h2>Посещение предприятия</h2>
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${p.attrs.access_status === "свободный" ? "ok" : "warn"}`}>Допуск: {p.attrs.access_status}</span>
                {p.attrs.group_min ? <span className="badge">Группа {p.attrs.group_min}–{p.attrs.group_max} чел.</span> : null}
                {p.attrs.min_age ? <span className="badge">{p.attrs.min_age}+</span> : null}
                {p.attrs.tasting && <span className="badge ok">Дегустация</span>}
              </div>
              {p.attrs.safety && <div className="row" style={{ alignItems: "flex-start", gap: 10 }}><I.HardHat size={20} color="var(--warn)" /><div><b>Требования безопасности</b><div className="small">{p.attrs.safety}</div></div></div>}
            </section>
          )}

          {p.slots.length > 0 && (
            <section className="panel stack">
              <h2>Расписание экскурсий</h2>
              <div className="col" style={{ gap: 8 }}>
                {p.slots.map((s: any) => (
                  <div key={s.id} className="card row between" style={{ padding: "12px 14px" }}>
                    <div><b>{fmtDate(s.start)}</b><div className="small muted">{s.title} · {s.duration_min} мин · {s.price ? `${s.price} ₽` : "бесплатно"}{s.group_only ? " · только группы" : ""}</div></div>
                    <div className="row"><span className="small muted">свободно {s.capacity - s.booked}</span>
                      <button className="btn primary sm" disabled={s.capacity <= s.booked} onClick={() => { if (!user) return needLogin(); setSlot(s); setForm({ people: s.group_only ? Math.max(5, p.attrs?.group_min || 5) : 1, contact: user.email }); setModal("book"); }}>Записаться</button></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {p.services.length > 0 && (
            <section className="panel stack">
              <h2>Услуги</h2>
              <table className="tbl"><tbody>{p.services.map((s: any, i: number) => <tr key={i}><td>{s.name}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{s.price}</td></tr>)}</tbody></table>
            </section>
          )}

          {p.portfolio.length > 0 && (
            <section className="panel stack">
              <h2>Портфолио</h2>
              <div className="grid">{p.portfolio.map((w: any, i: number) => (
                <div key={i} className="card" style={{ overflow: "hidden" }}>
                  <Cover color={p.vertical.color} icon={p.category.icon} seed={p.id * 10 + i} height={110} photo={w.image} />
                  <div style={{ padding: 12 }}><b>{w.title}</b><div className="tiny muted">{w.year} · {w.description}</div>
                    {w.rights_confirmed && <div className="tiny" style={{ color: "var(--ok)", marginTop: 6 }}>✓ Права на материал подтверждены владельцем</div>}</div>
                </div>))}
              </div>
              <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => { setForm({ material: "" }); setModal("copyright"); }}><I.Copyright size={15} />Пожаловаться на нарушение авторских прав</button>
            </section>
          )}

          {p.stories.length > 0 && (
            <section className="panel stack">
              <h2>Истории и аудиогид</h2>
              {p.stories.map((s: any) => (
                <div key={s.id} className="card pad stack">
                  <div className="row between"><b>{s.title}</b><span className="badge">{s.period}</span></div>
                  <p className="small" style={{ maxWidth: "70ch" }}>{s.text}</p>
                  <div className="row between"><span className="tiny muted">{s.author}</span><AudioGuide story={s} /></div>
                </div>
              ))}
            </section>
          )}

          {p.opportunities.length > 0 && (
            <section className="panel stack">
              <h2>Стажировки, вакансии и курсы</h2>
              {p.opportunities.map((o: any) => (
                <div key={o.id} className="row between card" style={{ padding: "12px 14px" }}>
                  <div><b>{o.title}</b><div className="small muted">{config?.dictionaries?.opportunity_kinds?.[o.kind]} · {o.format}{o.salary ? ` · ${o.salary}` : ""}</div></div>
                  <Link className="btn secondary sm" to="/careers">Подробнее</Link>
                </div>
              ))}
            </section>
          )}

          {p.events.length > 0 && (
            <section className="panel stack">
              <h2>События здесь</h2>
              {p.events.map((e: any) => <Link key={e.id} to={`/events/${e.slug}`} className="row between card" style={{ padding: "12px 14px" }}><b>{e.title}</b><span className="small muted">{fmtDate(e.start)}</span></Link>)}
            </section>
          )}

          <section className="panel stack" id="reviews">
            <div className="row between">
              <h2>Отзывы</h2>
              {!p.is_owner && !p.my_review && <button className="btn primary sm" onClick={() => { if (!user) return needLogin(); setForm({ rating: 5, text: "", photos: [] }); setModal("review"); }}><I.PenLine size={16} />Написать отзыв</button>}
            </div>
            {p.is_owner && <div className="small muted">Вы владелец — можете отвечать на отзывы, но не оценивать свой объект.</div>}
            {p.reviews_count > 0 && (
              <div className="row" style={{ gap: 28, alignItems: "flex-start" }}>
                <div style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--display)", fontSize: 44, fontWeight: 600, lineHeight: 1 }}>{p.rating.toFixed(1)}</div><div className="small muted">{p.reviews_count} отзывов</div></div>
                <div className="col grow" style={{ gap: 4, maxWidth: 320 }}>
                  {[5, 4, 3, 2, 1].map((n) => <div key={n} className="row small" style={{ gap: 8 }}><span style={{ width: 10 }}>{n}</span><div className="bar"><i style={{ width: `${(p.rating_distribution[n] / Math.max(1, p.reviews_count)) * 100}%` }} /></div></div>)}
                </div>
              </div>
            )}
            {p.reviews.length === 0 && <Empty icon="star" title="Отзывов пока нет">Будьте первым, кто поделится впечатлением</Empty>}
            <div>
              {p.reviews.map((r: any) => (
                <div key={r.id} className="review">
                  <div className="row between"><div className="row" style={{ gap: 10 }}><b>{r.user_name}</b><span style={{ color: "#F2A900" }}>{"★".repeat(r.rating)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - r.rating)}</span></span></div>
                    <span className="tiny muted">{fmtDate(r.created_at, false)}{r.updated_at ? " · изменён" : ""}</span></div>
                  {r.text && <p style={{ marginTop: 6 }}>{r.text}</p>}
                  {r.photos?.length > 0 && <div className="row" style={{ marginTop: 8 }}>{r.photos.map((ph: string) => <img key={ph} src={ph} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />)}</div>}
                  {r.owner_reply && <div className="reply"><b>Ответ владельца:</b> {r.owner_reply}</div>}
                  <div className="row" style={{ gap: 4, marginTop: 6 }}>
                    {user?.id === r.user_id && <>
                      <button className="btn ghost sm" onClick={() => { setForm({ id: r.id, rating: r.rating, text: r.text, photos: r.photos || [] }); setModal("review"); }}>Изменить</button>
                      <button className="btn ghost sm" onClick={() => submit(() => api(`/api/reviews/${r.id}`, { method: "DELETE" }), "Отзыв удалён")}>Удалить</button>
                    </>}
                    {p.is_owner && !r.owner_reply && <button className="btn ghost sm" onClick={() => { setReplyTo(r.id); setReplyText(""); }}>Ответить</button>}
                    {user?.id !== r.user_id && <button className="btn ghost sm" onClick={() => { const reason = prompt("Причина жалобы (модератор рассмотрит её в течение 24 часов):"); if (reason) submit(() => api(`/api/reviews/${r.id}/complaint`, { body: { reason } }), "Жалоба отправлена"); }}>Пожаловаться</button>}
                  </div>
                  {replyTo === r.id && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <input className="input grow" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Ваш ответ от лица организации" />
                      <button className="btn primary" onClick={() => submit(() => api(`/api/owner/reviews/${r.id}/reply`, { body: { text: replyText } }), "Ответ опубликован").then(() => setReplyTo(null))}>Ответить</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack">
          <div className="panel stack">
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}><I.MapPin size={20} /><div><b>{p.address}</b><div className="small muted">{p.city}{geo ? ` · ${fmtDist(Math.round(dist(geo, p)))} от вас` : ""}</div></div></div>
            <div style={{ height: 200, borderRadius: 12, overflow: "hidden" }}>
              <MapView center={[p.lat, p.lng]} zoom={15} points={[{ id: p.id, lat: p.lat, lng: p.lng, color: p.vertical.color, icon: p.category.icon, name: p.name }]} user={geo} />
            </div>
            <div>
              <div className="row between"><b>Время работы</b><span className={`badge ${p.status === "open" ? (p.open_now ? "ok" : "") : "warn"}`}>{p.status === "open" ? (p.open_now == null ? "Уточняйте" : p.open_now ? "Открыто" : "Закрыто") : STATUS[p.status]}</span></div>
              {p.hours?.always ? <div className="small" style={{ marginTop: 6 }}>Круглосуточно</div> : !Object.keys(p.hours || {}).length ? <div className="small muted" style={{ marginTop: 6 }}>График не указан — уточняйте по телефону или на сайте организации</div> : (
                <table className="hours-table" style={{ marginTop: 6 }}><tbody>
                  {DAYS.map(([k, n]) => <tr key={k} className={k === today ? "today" : ""}><td>{n}</td><td style={{ textAlign: "right" }}>{p.hours?.[k] || "выходной"}</td></tr>)}
                </tbody></table>
              )}
            </div>
            <div className="col" style={{ gap: 8 }}>
              {p.phone && <a href={`tel:${p.phone}`} onClick={() => track("call", p.id)} className="row" style={{ gap: 10 }}><I.Phone size={18} />{p.phone}</a>}
              {p.email && <a href={`mailto:${p.email}`} className="row" style={{ gap: 10 }}><I.Mail size={18} />{p.email}</a>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="row" style={{ gap: 10 }}><I.Globe size={18} />Сайт</a>}
              {p.social?.vk && <span className="row small muted" style={{ gap: 10 }}><I.AtSign size={18} />{p.social.vk}</span>}
              {p.social?.telegram && <span className="row small muted" style={{ gap: 10 }}><I.Send size={18} />{p.social.telegram}</span>}
            </div>
            <div className="tiny muted row" style={{ gap: 6 }}><I.BadgeCheck size={14} />Информация проверена {p.last_checked ? new Date(p.last_checked).toLocaleDateString("ru-RU") : "—"}</div>
          </div>

          {p.promos.map((pr: any) => (
            <div key={pr.id} className="promo-box">
              <I.Ticket size={32} color="var(--red)" />
              <div className="grow"><b>Скидка {pr.discount}% по промокоду</b><div className="small muted">{pr.description}</div></div>
              <button className="btn primary sm" onClick={() => activatePromo(pr)}>Показать</button>
            </div>
          ))}

          {p.nearby.length > 0 && (
            <div className="stack">
              <h3>Рядом</h3>
              {p.nearby.slice(0, 4).map((n: any) => <PlaceRow key={n.id} p={n} />)}
            </div>
          )}
        </aside>
      </div>

      {modal === "route" && (
        <Modal title="Построить маршрут" onClose={() => setModal(null)}>
          <div className="col">
            <button className="btn secondary lg" onClick={() => buildRoute("yandex")}><I.Navigation size={18} />Открыть в Яндекс Картах</button>
            <button className="btn secondary lg" onClick={() => buildRoute("osm")}><I.Map size={18} />Открыть в OpenStreetMap</button>
            <button className="btn primary lg" onClick={() => buildRoute("mine")}><I.Route size={18} />Добавить в мой маршрут</button>
            <p className="small muted">В приложении маршрут строится во встроенной карте и работает без сети.</p>
          </div>
        </Modal>
      )}
      {modal === "report" && (
        <Modal title="Сообщить о неточности" onClose={() => setModal(null)}>
          <div className="stack">
            <label className="field">Что не так?
              <select className="select" value={form.field || "other"} onChange={(e) => setForm({ ...form, field: e.target.value })}>
                <option value="hours">Время работы</option><option value="status">Объект закрыт / не работает</option><option value="address">Адрес или точка на карте</option>
                <option value="contacts">Контакты</option><option value="description">Описание или фото</option><option value="other">Другое</option>
              </select></label>
            <label className="field">Подробнее<textarea className="textarea" value={form.message || ""} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Например: по воскресеньям теперь работают до 21:00" /></label>
            <label className="field">Контакт для уточнения (необязательно)<input className="input" value={form.contact || ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
            <button className="btn primary" onClick={() => submit(() => api(`/api/places/${p.id}/report`, { body: { field: form.field || "other", message: form.message || "", contact: form.contact || "" } }), "Спасибо!")}>Отправить модератору</button>
          </div>
        </Modal>
      )}
      {modal === "review" && (
        <Modal title={form.id ? "Изменить отзыв" : "Ваш отзыв"} onClose={() => setModal(null)}>
          <div className="stack">
            <StarInput value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
            <textarea className="textarea" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Что понравилось, что можно улучшить?" />
            <div className="row">
              {(form.photos || []).map((ph: string) => <img key={ph} src={ph} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />)}
              <label className="btn secondary sm"><I.ImagePlus size={16} />Фото
                <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const url = await upload(f); setForm((x: any) => ({ ...x, photos: [...(x.photos || []), url] })); } catch (er: any) { toast(er.message, "err"); } }} />
              </label>
            </div>
            <button className="btn primary" onClick={() => submit(() => form.id
              ? api(`/api/reviews/${form.id}`, { method: "PATCH", body: { rating: form.rating, text: form.text, photos: form.photos } })
              : api(`/api/places/${p.id}/reviews`, { body: { rating: form.rating, text: form.text, photos: form.photos } }), "Отзыв опубликован")}>Опубликовать</button>
          </div>
        </Modal>
      )}
      {modal === "book" && slot && (
        <Modal title="Запись на экскурсию" onClose={() => setModal(null)}>
          <div className="stack">
            <div><b>{slot.title}</b><div className="small muted">{fmtDate(slot.start)} · свободно мест: {slot.capacity - slot.booked}</div></div>
            {p.attrs?.access_status === "по заявке" && <div className="badge warn">Допуск по заявке — владелец подтвердит запись</div>}
            {p.attrs?.safety && <div className="small"><b>Безопасность:</b> {p.attrs.safety}</div>}
            <div className="form-grid">
              <label className="field">Количество человек<input className="input" type="number" min={1} value={form.people} onChange={(e) => setForm({ ...form, people: Number(e.target.value) })} /></label>
              <label className="field">Контакт<input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
            </div>
            <label className="field">Комментарий<textarea className="textarea" value={form.comment || ""} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={!!form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} />Ознакомлен(а) с требованиями безопасности</label>
            <button className="btn primary" disabled={!form.agree} onClick={() => submit(() => api("/api/bookings", { body: { slot_id: slot.id, people: form.people, contact: form.contact, comment: form.comment } }), "Вы записаны!")}>Записаться</button>
          </div>
        </Modal>
      )}
      {modal === "promo" && promo && (
        <Modal title={`Скидка ${promo.discount}% в «${p.name}»`} onClose={() => setModal(null)}>
          <div className="col" style={{ alignItems: "center", gap: 16, textAlign: "center" }}>
            <div style={{ background: "#fff", padding: 14, borderRadius: 14 }}><QRCodeSVG value={promo.qr} size={180} /></div>
            <div className="promo-code">{promo.code}</div>
            <p className="small muted">Назовите промокод или покажите QR-код на кассе. Скидка {promo.discount}% {promo.description}.{promo.valid_until ? ` Действует до ${new Date(promo.valid_until).toLocaleDateString("ru-RU")}.` : ""}</p>
            <button className="btn secondary" onClick={() => { navigator.clipboard?.writeText(promo.code); toast("Промокод скопирован"); }}><I.Copy size={16} />Скопировать</button>
          </div>
        </Modal>
      )}
      {modal === "copyright" && (
        <Modal title="Жалоба на нарушение авторских прав" onClose={() => setModal(null)}>
          <div className="stack">
            <p className="small muted">Опишите, какой материал нарушает ваши права. Мы скроем материал на время проверки, если нарушение очевидно, и ответим в течение 3 рабочих дней.</p>
            <label className="field">Материал<select className="select" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}><option value="">Выберите</option>{p.portfolio.map((w: any) => <option key={w.title}>{w.title}</option>)}</select></label>
            <label className="field">Правообладатель<input className="input" value={form.claimant_name || ""} onChange={(e) => setForm({ ...form, claimant_name: e.target.value })} /></label>
            <label className="field">Контакт<input className="input" value={form.claimant_contact || ""} onChange={(e) => setForm({ ...form, claimant_contact: e.target.value })} /></label>
            <label className="field">Подтверждение прав (ссылка, номер свидетельства)<input className="input" value={form.proof || ""} onChange={(e) => setForm({ ...form, proof: e.target.value })} /></label>
            <label className="field">Описание<textarea className="textarea" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <button className="btn primary" disabled={!form.material || !form.claimant_name || !form.claimant_contact}
                    onClick={() => submit(() => api("/api/copyright", { body: { place_id: p.id, ...form } }), "Жалоба отправлена")}>Отправить жалобу</button>
          </div>
        </Modal>
      )}
      {modal === "form" && vertical && (
        <Modal title={vertical.form_title} onClose={() => setModal(null)}>
          <div className="stack">
            <div className="form-grid">{vertical.form_fields.map((f) => <DynamicField key={f.key} f={f} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} />)}</div>
            <button className="btn primary" onClick={() => submit(() => api(`/api/verticals/${vertical.slug}/submit`, { body: { data: form, place_id: p.id } }), "Заявка отправлена")}>Отправить</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
