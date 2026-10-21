import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Logo, Tabs } from "../ui/kit";

export default function Login() {
  const { setAuth, toast } = useStore();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/profile";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", name: "", totp: "" });
  const [step, setStep] = useState<"form" | "totp" | "setup">("form");
  const [setup, setSetup] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const demo = useAsync(() => api<any[]>("/api/auth/demo-accounts").catch(() => []), []);

  const done = (r: any) => {
    setAuth(r.token, r.user);
    toast(`Здравствуйте, ${r.user.name.split(" ")[0]}!`);
    nav(r.user.is_service && next === "/profile" ? "/admin" : next);
  };

  const login = async (email = f.email, password = f.password, totp = f.totp) => {
    setBusy(true);
    try {
      const r = await api("/api/auth/login", { body: { email, password, totp: totp || undefined } });
      if (r.need_totp) { setStep("totp"); setF((x) => ({ ...x, email, password })); return; }
      if (r.need_totp_setup) {
        const s = await api("/api/auth/2fa/setup", { method: "POST", token: r.setup_token });
        setSetup({ ...s, token: r.setup_token }); setStep("setup"); return;
      }
      done(r);
    } catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  const register = async () => {
    setBusy(true);
    try { done(await api("/api/auth/register", { body: { email: f.email, password: f.password, name: f.name } })); }
    catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  const enable2fa = async () => {
    try { done(await api("/api/auth/2fa/enable", { body: { code: f.totp }, token: setup.token })); } catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <div className="container page" style={{ maxWidth: 980 }}>
      <div className="two-col" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0, gap: 32 }}>
        <div className="panel stack" style={{ padding: 28 }}>
          <div className="row" style={{ gap: 12 }}><Logo size={44} /><h2>{step === "form" ? (mode === "login" ? "Вход" : "Регистрация") : "Двухфакторная защита"}</h2></div>
          {step === "form" && (
            <>
              <Tabs tabs={[["login", "Вход"], ["register", "Регистрация"]]} value={mode} onChange={setMode} />
              <form className="stack" onSubmit={(e) => { e.preventDefault(); mode === "login" ? login() : register(); }}>
                {mode === "register" && <label className="field">Имя<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>}
                <label className="field">E-mail<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required /></label>
                <label className="field">Пароль<input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} /></label>
                <button className="btn primary lg" disabled={busy}>{mode === "login" ? "Войти" : "Создать аккаунт"}</button>
              </form>
              <p className="small muted">Без аккаунта доступны просмотр, поиск, карта, офлайн-режим и избранное на устройстве. Аккаунт нужен для отзывов, синхронизации, записи и заявок.</p>
            </>
          )}
          {step === "totp" && (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); login(); }}>
              <p className="muted">Для служебных ролей обязательна двухфакторная защита. Введите 6-значный код из приложения-аутентификатора.</p>
              <input className="input" style={{ fontSize: 26, letterSpacing: ".3em", textAlign: "center", height: 58 }} inputMode="numeric" maxLength={6} autoFocus value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value.replace(/\D/g, "") })} />
              <button className="btn primary lg" disabled={f.totp.length < 6 || busy}>Подтвердить</button>
            </form>
          )}
          {step === "setup" && setup && (
            <div className="stack">
              <p className="muted">Ваша роль требует двухфакторной защиты. Отсканируйте QR-код в Яндекс Ключе, Google Authenticator или другом приложении и введите код.</p>
              <div style={{ background: "#fff", padding: 14, borderRadius: 14, alignSelf: "center" }}><QRCodeSVG value={setup.otpauth_uri} size={180} /></div>
              <div className="tiny muted" style={{ wordBreak: "break-all", textAlign: "center" }}>Ключ: {setup.secret}</div>
              <input className="input" style={{ fontSize: 22, letterSpacing: ".3em", textAlign: "center" }} inputMode="numeric" maxLength={6} value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value.replace(/\D/g, "") })} />
              <button className="btn primary lg" disabled={f.totp.length < 6} onClick={enable2fa}><ShieldCheck size={18} />Включить и войти</button>
            </div>
          )}
        </div>
        {demo.data && demo.data.length > 0 && (
          <div className="panel stack" style={{ padding: 28 }}>
            <h3 className="row" style={{ gap: 8 }}><KeyRound size={18} />Демо-доступы для жюри</h3>
            <p className="small muted">Пароль у всех — demo123. Для служебных ролей код 2FA подставится автоматически (только в демо-режиме).</p>
            {demo.data.map((a) => (
              <button key={a.email} className="card row" style={{ padding: 12, gap: 12, cursor: "pointer", textAlign: "left", width: "100%" }}
                      onClick={async () => { const fresh = await api<any[]>("/api/auth/demo-accounts"); const acc = fresh.find((x) => x.email === a.email); login(a.email, "demo123", acc?.totp || ""); }}>
                <UserRound size={22} />
                <div className="grow"><b>{a.role_title}</b><div className="tiny muted">{a.email}{a.email === "expert@kod.ru" ? " · эксперт морского наследия" : ""}</div></div>
                {a.totp && <span className="badge blue">2FA</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
