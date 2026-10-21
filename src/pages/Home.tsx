import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Ticket, Sparkles, Building2, WifiOff, ChevronLeft, ChevronRight, MapPin, CalendarDays, Route as RouteIcon, ShieldCheck, Store, ArrowRight } from "lucide-react";
import { api, PlaceBrief, qs } from "../api";
import { useAsync, useStore } from "../store";
import { Cover, evIcon, fmtDate, fmtMin, Icon, Loading, Logo, monthShort, PlaceCard, plural, Stars } from "../ui/kit";
import { Scene, sceneFor, TerrikonDeco } from "../ui/Scene";

export function SearchBox({ autoFocus, initial = "" }: { autoFocus?: boolean; initial?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [sug, setSug] = useState<any>(null);
  const [hl, setHl] = useState(-1);
  const t = useRef<any>();
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setSug(null); return; }
    t.current = setTimeout(() => api(`/api/search/suggest${qs({ q })}`).then(setSug).catch(() => setSug(null)), 180);
  }, [q]);
  const items: { to: string; label: string; sub: string; icon: string }[] = sug ? [
    ...sug.places.map((p: PlaceBrief) => ({ to: `/place/${p.slug}`, label: p.name, sub: p.category?.name, icon: p.category?.icon })),
    ...sug.events.map((e: any) => ({ to: `/events/${e.slug}`, label: e.title, sub: fmtDate(e.start), icon: "star" })),
  ] : [];
  const go = () => nav(`/catalog${qs({ q })}`);
  return (
    <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); hl >= 0 && items[hl] ? nav(items[hl].to) : go(); }}>
      <Search size={22} style={{ margin: "auto 4px auto 10px", color: "var(--ink-3)" }} />
      <input value={q} onChange={(e) => { setQ(e.target.value); setHl(-1); }} autoFocus={autoFocus} aria-label="Поиск"
             placeholder="Музей, кофейня, студия, экскурсия на завод…"
             onKeyDown={(e) => { if (e.key === "ArrowDown") setHl((h) => Math.min(items.length - 1, h + 1)); if (e.key === "ArrowUp") setHl((h) => Math.max(-1, h - 1)); }} />
      <button className="btn primary lg">Найти</button>
      {sug && q.length >= 2 && (
        <div className="suggest">
          {sug.hints?.length > 0 && <div className="small" style={{ padding: "10px 14px" }}>Возможно, вы искали: <a style={{ color: "var(--blue)", cursor: "pointer", fontWeight: 600 }} onClick={() => setQ(sug.hints[0])}>{sug.hints[0]}</a></div>}
          {items.map((it, i) => (
            <Link key={it.to} to={it.to} className={i === hl ? "hl" : ""}>
              <Icon name={it.icon} size={18} /><div className="grow"><div style={{ fontWeight: 500 }}>{it.label}</div><div className="tiny muted">{it.sub}</div></div>
            </Link>
          ))}
          {!items.length && <div className="small muted" style={{ padding: 14 }}>Ничего не нашлось — попробуйте другое слово</div>}
        </div>
      )}
    </form>
  );
}


const REASONS: Record<number, string> = { 1: "Одна причина", 2: "Две причины", 3: "Три причины", 4: "Четыре причины", 5: "Пять причин" };
const CITY_IN: Record<string, string> = { "Донецк": "Донецк", "Макеевка": "Макеевку", "Мариуполь": "Мариуполь", "Приазовье": "Приазовье" };

/** Карусель «стеклянных» карточек мест в первом экране. */
function HeroCarousel({ places }: { places: PlaceBrief[] }) {
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const n = places.length;
  useEffect(() => {
    if (!n || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5500);
    return () => clearInterval(t);
  }, [n]);
  if (!n) return <div className="hero-cards" />;
  const cur = places[i % n], next = places[(i + 1) % n];
  return (
    <div className="hero-cards">
      <button className="glass-card main" key={cur.id} onClick={() => nav(`/place/${cur.slug}`)} aria-label={cur.name}>
        <div className="gc-img"><Cover color={cur.vertical.color} icon={cur.category.icon} seed={cur.id} height="100%" photo={cur.photos?.[0]} badge={false} /></div>
        <span className="gc-rate">{cur.rating.toFixed(1)} ★</span>
        <div className="gc-text">
          <span className="gc-meta">{cur.city} · {cur.category.name}</span>
          <span className="gc-name">{cur.name}</span>
        </div>
      </button>
      <button className="glass-card side" onClick={() => setI((i + 1) % n)} aria-label={`Следующее: ${next.name}`}>
        <div className="gc-img"><Cover color={next.vertical.color} icon={next.category.icon} seed={next.id} height="100%" photo={next.photos?.[0]} badge={false} /></div>
        <div className="gc-text"><span className="gc-meta">{next.city}</span><span className="gc-name sm">{next.name}</span></div>
      </button>
      <div className="gc-nav">
        <button onClick={() => setI((i - 1 + n) % n)} aria-label="Назад"><ChevronLeft size={18} /></button>
        <span>{(i % n) + 1} / {n}</span>
        <button onClick={() => setI((i + 1) % n)} aria-label="Вперёд"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

function Wave({ flip }: { flip?: boolean }) {
  return (
    <svg className={`wave ${flip ? "flip" : ""}`} viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden>
      <path d="M0 64 C 180 120 360 120 540 78 C 720 36 860 10 1040 40 C 1200 66 1320 96 1440 70 L1440 120 L0 120 Z" />
    </svg>
  );
}

export default function Home() {
  const { config } = useStore();
  const stats = useAsync(() => api("/api/stats/public"), []);
  const all = useAsync(() => api<{ items: PlaceBrief[] }>(`/api/places${qs({ sort: "popularity", limit: 200 })}`), []);
  const events = useAsync(() => api<any[]>("/api/events"), []);
  const route = useAsync(() => api("/api/routes/kreativnyy-donetsk"), []);
  const places = all.data?.items || [];
  // Сначала места с настоящими фотографиями, затем остальные
  const withPhoto = useMemo(() => places.filter((p) => p.photos?.length), [places]);
  const heroPlaces = useMemo(() => [...withPhoto, ...places.filter((p) => p.status === "open" && !p.photos?.length)].slice(0, 8), [places, withPhoto]);
  const stack = useMemo(() => {
    const pick = withPhoto.filter((p) => p.slug !== "donbass-arena").slice(0, 3);
    for (const v of ["maritime", "creative", "tourism"]) { if (pick.length >= 3) break; const p = places.find((x) => x.vertical.slug === v && !pick.includes(x)); if (p) pick.push(p); }
    return pick;
  }, [places, withPhoto]);
  const cities = useMemo(() => {
    const m = new Map<string, PlaceBrief[]>();
    places.forEach((p) => { if (!m.has(p.city)) m.set(p.city, []); m.get(p.city)!.push(p); });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [places]);
  const [city, setCity] = useState<string | null>(null);
  const curCity = city || cities[0]?.[0];
  const cityPlaces = (cities.find(([c]) => c === curCity)?.[1] || [])
    // «Причины посетить» — достопримечательности, а не кафе и гостиницы; места с фото — первыми
    .filter((p) => p.vertical.slug !== "investment" && !["cafe", "coffee", "hotel"].includes(p.category.slug))
    .sort((a, b) => (b.photos?.length ? 1 : 0) - (a.photos?.length ? 1 : 0) || b.rating - a.rating).slice(0, 5);
  const verts = config?.verticals || [];

  return (
    <div className="home">
      <section className="hero2 photo">
        {/* Фон первого экрана. Своё фото — положите photos/hero.jpg (без пересборки) или замените web/public/img/hero-main.jpg */}
        <div className="hero-photo" aria-hidden><img src={(config as any)?.photos?.hero || "/img/hero-main.jpg"} alt="" /></div>
        <div className="hero-tint" aria-hidden />
        <div className="hero2-shade" />
        <div className="container hero2-in">
          <div className="hero2-text">
            <span className="hand">Добро пожаловать в Донбасс</span>
            <h1>Донбасс, собранный в&nbsp;маршрут</h1>
            <p>Музеи и кофейни, студии и заводы с экскурсиями, морское побережье и площадки для инвесторов — на одной карте, с отзывами, афишей и готовыми маршрутами. Работает и без интернета.</p>
            <div className="row" style={{ gap: 12, marginTop: 22 }}>
              <Link to={`/routes/${route.data?.slug || "kreativnyy-donetsk"}`} className="btn outline lg">Пройти маршрут</Link>
              <Link to="/map" className="btn glass lg"><MapPin size={18} />Открыть карту</Link>
            </div>
            <SearchBox />
          </div>
          <HeroCarousel places={heroPlaces} />
        </div>
        <Wave />
      </section>

      <section className="intro">
        <TerrikonDeco className="deco deco-left" />
        <div className="container intro-in">
          <div>
            <div className="stats3">
              {[[MapPin, "Мест на карте", stats.data?.places], [CalendarDays, "Событий в афише", stats.data?.events], [RouteIcon, "Готовых маршрутов", stats.data?.routes], [Building2, "Инвестплощадок", stats.data?.sites]].map(([I, l, v]: any) => (
                <div key={l}><I size={24} /><span>{l}</span><b>{v ?? "—"}</b></div>
              ))}
            </div>
            <p className="intro-text">Платформа объединяет классический туризм, креативные индустрии, промышленные экскурсии, морское наследие Приазовья и инвестиционные площадки. Владельцы сами ведут карточки, а модераторы проверяют информацию — у каждого места указана дата проверки.</p>
            <p className="intro-text">Назовите промокод «Код Новороссии» в заведениях-партнёрах и получите скидку 3–5%.</p>
            <div className="row between" style={{ marginTop: 22 }}>
              <div className="partners"><Logo size={34} /><span className="badge region">Сделано в регионе</span><span className="badge">Мой бизнес</span></div>
              <Link to="/catalog" className="more-link">Весь каталог <ArrowRight size={16} /></Link>
            </div>
          </div>
          <div className="stack3">
            {stack.map((p, k) => (
              <Link key={p.id} to={`/place/${p.slug}`} className={`stack-card s${k}`} aria-label={p.name}>
                <Cover color={p.vertical.color} icon={p.category.icon} seed={p.id} height="100%" photo={p.photos?.[0]} badge={false} />
                <span className="stack-name">{p.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="about container">
        <div className="about-img"><img src="/img/night-fountain.jpg" alt="Фонтан у «Донбасс Арены» вечером" loading="lazy" /><span className="about-tag hand">Донецк вечером</span></div>
        <div>
          <h2 className="big">О платформе</h2>
          <p className="intro-text">Одно ядро — карта, каталог, поиск, отзывы, избранное, маршруты, афиша — и тематические вертикали, которые администратор настраивает без выпуска новой версии. Туристу — куда пойти, предпринимателю — как привлечь гостей, инвестору — «одно окно».</p>
          <div className="features">
            <div><ShieldCheck size={30} /><span>Проверенные данные</span></div>
            <div><WifiOff size={30} /><span>Работает офлайн</span></div>
            <div><Store size={30} /><span>Кабинет для бизнеса</span></div>
          </div>
        </div>
        <svg className="dash-path" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
          <path id="dp" d="M0 120 C 200 20 380 150 600 80 S 1000 10 1200 90" />
          <circle r="7" className="dash-dot"><animateMotion dur="9s" repeatCount="indefinite"><mpath href="#dp" /></animateMotion></circle>
        </svg>
      </section>

      <section className="dest">
        <h2 className="big center">Куда поехать</h2>
        <div className="city-tabs" role="tablist">
          {cities.filter(([, ps]) => ps.some((p) => p.vertical.slug !== "investment")).slice(0, 5).map(([c]) => (
            <button key={c} role="tab" aria-selected={c === curCity} className={c === curCity ? "on" : ""} onClick={() => setCity(c)}>{c}</button>
          ))}
        </div>
        <div className="container">
          <h3 className="reasons">{REASONS[cityPlaces.length] || "Причины"} посетить {CITY_IN[curCity || ""] || curCity}</h3>
          <div className="reason-row">
            {cityPlaces.map((p, k) => (
              <Link key={p.id} to={`/place/${p.slug}`} className="reason-card">
                <Cover color={p.vertical.color} icon={p.category.icon} seed={p.id} height="100%" photo={p.photos?.[0]} badge={false} />
                <div className="rc-text"><span className="rc-num">{k + 1}</span><b>{p.name}</b><span>{p.category.name} · ★ {p.rating.toFixed(1)}</span></div>
              </Link>
            ))}
            {all.loading && [1, 2, 3].map((k) => <Loading key={k} h={320} />)}
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section band">
          <div className="section-head"><div><h2>Чем заняться</h2><p className="muted">Ядро одно, направления настраиваются в панели управления и появляются здесь без новой версии</p></div></div>
          <div className="vgrid">
            {verts.map((v, k) => (
              <Link key={v.slug} to={v.slug === "investment" ? "/investors" : `/v/${v.slug}`} className={`vcard ${k === 0 ? "wide" : ""}`}>
                {v.photo ? <img src={v.photo} alt="" className="scene" loading="lazy" style={{ objectFit: "cover" }} /> : <Scene kind={sceneFor(v.categories[0]?.icon || v.icon)} seed={k * 5 + 3} accent={v.color} className="scene" />}
                <div className="vc-text">
                  <span className="vnode" style={{ background: v.color }}><Icon name={v.icon} size={20} /></span>
                  <b>{v.name}</b><span>{v.short}</span>
                  <em>{v.slug === "investment" ? `${stats.data?.sites ?? ""} площадок` : `${v.count} ${plural(v.count, "объект", "объекта", "объектов")}`}</em>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div><h2>Афиша на ближайшие дни</h2><p className="muted">Фестивали, выставки, мастер-классы и дни открытых дверей</p></div>
            <Link to="/events" className="btn secondary">Вся афиша</Link>
          </div>
          <div className="grid">
            {(events.data || []).slice(0, 4).map((e) => (
              <Link key={e.id} to={`/events/${e.slug}`} className="card event-card">
                <div className="ev-img"><Cover color={e.vertical?.color || "#E3263A"} icon={evIcon(e.kind)} seed={e.id + 300} height="100%" badge={false} photo={e.place?.photo} />
                  <div className="ev-date"><b>{new Date(e.start).getDate()}</b><span>{monthShort(e.start)}</span></div></div>
                <div className="col" style={{ padding: 16, gap: 6 }}>
                  <span className="badge cat" style={{ ["--c" as any]: e.vertical?.color, alignSelf: "flex-start" }}>{config?.dictionaries?.event_kinds?.[e.kind] || e.kind}</span>
                  <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{e.title}</div>
                  <div className="small muted">{e.place?.name}</div>
                  <div className="small">{e.price ? `${e.price} ₽` : "Бесплатно"}{e.registration && <span className="muted"> · по записи</span>}</div>
                </div>
              </Link>
            ))}
            {events.loading && [1, 2, 3, 4].map((i) => <Loading key={i} h={280} />)}
          </div>
        </section>

        <section className="section band">
          <div className="section-head"><div><h2>Популярное сейчас</h2><p className="muted">По просмотрам, отзывам и добавлениям в избранное</p></div><Link to="/catalog" className="btn secondary">Весь каталог</Link></div>
          <div className="grid">{places.slice(0, 8).map((p) => <PlaceCard key={p.id} p={p} />)}</div>
        </section>

        <section className="section trio">
          <div className="panel col promo-panel" style={{ gap: 14 }}>
            <Ticket size={28} color="var(--red)" />
            <h2>Промокоды партнёров</h2>
            <p className="muted">Назовите промокод в кафе, музее или магазине-партнёре — скидка 3–5% на весь ассортимент.</p>
            <Link to="/promo" className="btn primary" style={{ alignSelf: "flex-start", marginTop: "auto" }}>Получить промокод</Link>
          </div>
          <div className="panel col invest-panel" style={{ gap: 14 }}>
            <Scene kind="invest" seed={4} accent="#1B4FA3" className="scene" />
            <div className="col" style={{ gap: 14, position: "relative" }}>
              <Building2 size={28} />
              <h2>Инвестору — одно окно</h2>
              <p>Площадки с контурами на карте и паспортом, подбор под проект и единая заявка с куратором.</p>
              <Link to="/investors" className="btn primary" style={{ alignSelf: "flex-start" }}>Подобрать площадку</Link>
            </div>
          </div>
          <div className="panel col" style={{ gap: 14 }}>
            <WifiOff size={28} color="var(--red)" />
            <h2>Без интернета</h2>
            <p className="muted">Карта, поиск и карточки работают офлайн, а избранное хранится на устройстве даже без входа.</p>
            <Link to="/passport" className="btn secondary" style={{ alignSelf: "flex-start", marginTop: "auto" }}><Sparkles size={18} />Паспорт путешественника</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
