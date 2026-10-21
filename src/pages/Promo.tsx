import { useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Ticket } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Cover, Loading, Modal } from "../ui/kit";

export default function Promo() {
  const { toast } = useStore();
  const { data, loading } = useAsync(() => api<any[]>("/api/promos"), []);
  const [shown, setShown] = useState<any>(null);
  const show = async (p: any) => { try { const r = await api(`/api/promos/${p.id}/activate`, { method: "POST" }); setShown({ ...p, ...r }); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <div className="container page">
      <div className="page-head"><div><h1>Промокоды партнёров</h1><p className="lead">Культурные и досуговые заведения — партнёры платформы. Назовите промокод на кассе и получите скидку 3–5% на ассортимент.</p></div></div>
      {loading ? <Loading h={300} /> : (
        <div className="grid">
          {(data || []).map((p) => (
            <div key={p.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {p.place && <Cover color={p.place.vertical.color} icon={p.place.category.icon} seed={p.place.id} height={110} />}
              <div className="col" style={{ padding: 16, gap: 8, flex: 1 }}>
                <div className="row between"><span className="badge err">−{p.discount}%</span><span className="tiny muted">активаций: {p.activations}</span></div>
                {p.place && <Link to={`/place/${p.place.slug}`} style={{ fontWeight: 600, fontSize: 17 }}>{p.place.name}</Link>}
                <div className="small muted">{p.description}{p.valid_until ? `, до ${new Date(p.valid_until).toLocaleDateString("ru-RU")}` : ""}</div>
                <button className="btn primary" style={{ marginTop: "auto" }} onClick={() => show(p)}><Ticket size={17} />Показать промокод</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="panel" style={{ marginTop: 32 }}>
        <h3>Хотите стать партнёром?</h3>
        <p className="muted small" style={{ marginTop: 6 }}>Владельцы кафе, музеев и магазинов подключают промокод в кабинете бизнеса и видят статистику активаций.</p>
        <Link to="/cabinet" className="btn secondary" style={{ marginTop: 12 }}>Открыть кабинет бизнеса</Link>
      </div>
      {shown && (
        <Modal title={`Скидка ${shown.discount}% — ${shown.place?.name}`} onClose={() => setShown(null)}>
          <div className="col" style={{ alignItems: "center", gap: 14, textAlign: "center" }}>
            <div style={{ background: "#fff", padding: 14, borderRadius: 14 }}><QRCodeSVG value={shown.qr} size={180} /></div>
            <div className="promo-code">{shown.code}</div>
            <p className="small muted">Покажите QR-код или назовите промокод кассиру.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
