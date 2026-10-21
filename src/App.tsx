import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Heart, LayoutGrid, Map, Menu, Route as RouteIcon, User, Search } from "lucide-react";
import { PALETTES, StoreProvider, useStore } from "./store";
import { TerrikonDeco } from "./ui/Scene";
import { Loading, Logo } from "./ui/kit";
import ChatWidget from "./ui/ChatWidget";
import Home from "./pages/Home";

const MapPage = lazy(() => import("./pages/MapPage"));
const Catalog = lazy(() => import("./pages/Catalog"));
const PlacePage = lazy(() => import("./pages/PlacePage"));
const Favorites = lazy(() => import("./pages/Favorites"));
const RoutesPage = lazy(() => import("./pages/RoutesPage"));
const RoutePage = lazy(() => import("./pages/RoutePage"));
const RouteBuilder = lazy(() => import("./pages/RouteBuilder"));
const Events = lazy(() => import("./pages/Events"));
const EventPage = lazy(() => import("./pages/EventPage"));
const More = lazy(() => import("./pages/More"));
const VerticalPage = lazy(() => import("./pages/VerticalPage"));
const Investors = lazy(() => import("./pages/Investors"));
const SitePage = lazy(() => import("./pages/SitePage"));
const Careers = lazy(() => import("./pages/Careers"));
const Heritage = lazy(() => import("./pages/Heritage"));
const Promo = lazy(() => import("./pages/Promo"));
const Passport = lazy(() => import("./pages/Passport"));
const Info = lazy(() => import("./pages/Info"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const Cabinet = lazy(() => import("./pages/Cabinet"));
const Admin = lazy(() => import("./admin/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PalettePicker() {
  const { palette, setPalette } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = PALETTES.find((p) => p.id === palette)!;
  return (
    <div className="palette" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Цветовая тема" aria-expanded={open} title="Цветовая тема">
        <span className="swatch" style={{ background: `linear-gradient(135deg, ${cur.swatch[0]} 50%, ${cur.swatch[1]} 50%)` }} />
      </button>
      {open && (
        <div className="palette-menu" role="menu">
          <div className="small muted" style={{ padding: "4px 8px 8px" }}>Цветовая тема</div>
          {PALETTES.map((p) => (
            <button key={p.id} role="menuitemradio" aria-checked={p.id === palette} className={p.id === palette ? "on" : ""} onClick={() => { setPalette(p.id); setOpen(false); }}>
              <span className="swatch lg" style={{ background: `linear-gradient(135deg, ${p.swatch[0]} 50%, ${p.swatch[1]} 50%)` }} />
              <span className="grow">{p.name}</span>
              <span className="tiny muted">{p.dark ? "тёмная" : "светлая"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ overHero }: { overHero: boolean }) {
  const { user, favorites, dark, proMode } = useStore();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    h(); window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  const nav = useNavigate();
  const favCount = Object.keys(favorites).length;
  return (
    <header className={`topbar ${overHero ? "on-home" : ""} ${overHero && !scrolled ? "over-hero" : ""}`}>
      <div className="container">
        <Link to="/" className="brand" aria-label="Код Новороссии — на главную">
          <img src={dark || (overHero && !scrolled) ? "/mark-white.png" : "/mark-black.png"} alt="" />
          <b>Код Новороссии<span>гид по ДНР</span></b>
        </Link>
        <nav className="nav" aria-label="Основное меню">
          <NavLink to="/map">Карта</NavLink>
          <NavLink to="/catalog">Каталог</NavLink>
          <NavLink to="/events">Афиша</NavLink>
          <NavLink to="/routes">Маршруты</NavLink>
          <NavLink to="/v/creative">Креативные индустрии</NavLink>
          {proMode && <NavLink to="/investors">Инвесторам</NavLink>}
          <NavLink to="/more">Ещё</NavLink>
        </nav>
        <div className="top-actions">
          <button className="icon-btn hide-mobile" onClick={() => nav("/catalog")} aria-label="Поиск"><Search size={18} /></button>
          <PalettePicker />
          <Link to="/favorites" className="icon-btn hide-mobile" aria-label="Избранное"><Heart size={18} />{favCount > 0 && <span className="dot">{favCount}</span>}</Link>
          <Link to={user ? "/profile" : "/login"} className="btn secondary sm" style={{ height: 40 }}>
            <User size={17} /><span className="hide-mobile">{user ? user.name.split(" ")[0] : "Войти"}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Нижняя панель">
      <NavLink to="/map"><Map size={22} />Карта</NavLink>
      <NavLink to="/catalog"><LayoutGrid size={22} />Каталог</NavLink>
      <NavLink to="/favorites"><Heart size={22} />Избранное</NavLink>
      <NavLink to="/routes"><RouteIcon size={22} />Маршруты</NavLink>
      <NavLink to="/more"><Menu size={22} />Ещё</NavLink>
    </nav>
  );
}

/** Фото-«задник» внутренних страниц: полупрозрачная фотография Донецка под заголовком. */
const PAGE_PHOTO: [string, string][] = [
  ["/events", "/img/night-fountain.jpg"], ["/routes", "/img/arches.jpg"], ["/v/creative", "/img/circus.jpg"],
  ["/heritage", "/img/hero-panorama.jpg"], ["/catalog", "/img/arches.jpg"], ["/favorites", "/img/circus.jpg"],
  ["/investors", "/img/hero-panorama.jpg"], ["/more", "/img/night-fountain.jpg"], ["/info", "/img/olimpiyskiy.jpg"],
];
/** Фото под заголовком раздела. Своё фото: положите photos/pages/<раздел>.jpg (catalog, events, routes, …) — см. photos/README.md */
const pageKey = (path: string) => { const [a, b] = path.split("/").filter(Boolean); return a === "v" ? b : a || ""; };
const photoFor = (path: string, own?: Record<string, string>) =>
  own?.[pageKey(path)] || PAGE_PHOTO.find(([p]) => path.startsWith(p))?.[1] || "/img/hero-panorama.jpg";

function Shell() {
  const { toasts, online, config } = useStore();
  const loc = useLocation();
  const [, setTick] = useState(0);
  useEffect(() => { window.scrollTo(0, 0); setTick((t) => t + 1); }, [loc.pathname]);
  const full = loc.pathname === "/map";
  return (
    <div className="app">
      {!online && <div className="offline-bar">Нет сети — показываем сохранённые данные. Избранное работает офлайн.</div>}
      <Header overHero={loc.pathname === "/"} />
      {loc.pathname !== "/" && !full && (
        <div className="backdrop" aria-hidden>
          <TerrikonDeco className="bd-t1" /><TerrikonDeco className="bd-t2" />
        </div>
      )}
      <main style={{ ["--page-photo" as any]: `url(${photoFor(loc.pathname, (config as any)?.photos?.pages)})` }}>
        <Suspense fallback={<div className="container page"><Loading h={320} /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/place/:slug" element={<PlacePage />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/routes/builder" element={<RouteBuilder />} />
            <Route path="/routes/:slug" element={<RoutePage />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:slug" element={<EventPage />} />
            <Route path="/more" element={<More />} />
            <Route path="/v/:slug" element={<VerticalPage />} />
            <Route path="/investors" element={<Investors />} />
            <Route path="/investors/sites/:slug" element={<SitePage />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/heritage" element={<Heritage />} />
            <Route path="/promo" element={<Promo />} />
            <Route path="/passport" element={<Passport />} />
            <Route path="/info" element={<Info />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/cabinet/*" element={<Cabinet />} />
            <Route path="/admin/*" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {!full && (
        <footer className="footer">
          <div className="container">
            <div className="row" style={{ gap: 12 }}>
              <Logo size={30} />
              <div>«Код Новороссии» — единая цифровая платформа туризма ДНР<br />Хакатон ФСП ДНР, 2026</div>
            </div>
            <div className="row" style={{ gap: 18 }}>
              <Link to="/info">Важно знать</Link><Link to="/promo">Промокоды</Link><Link to="/cabinet">Для бизнеса</Link><a href="/docs" target="_blank" rel="noreferrer">API</a>
            </div>
          </div>
        </footer>
      )}
      <TabBar />
      <ChatWidget />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </StoreProvider>
  );
}
