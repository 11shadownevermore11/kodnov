import { Link } from "react-router-dom";
import { Award, Lock } from "lucide-react";
import { api } from "../api";
import { useAsync, useStore } from "../store";
import { Empty, Loading } from "../ui/kit";

/** «Паспорт путешественника» — геймификация: штампы за посещения (гео-отметка до 300 м) и достижения. */
export default function Passport() {
  const { user } = useStore();
  const { data, loading } = useAsync(() => (user ? api("/api/me/passport") : Promise.resolve(null)), [user?.id]);
  if (!user) return <div className="container page"><Empty icon="trophy" title="Паспорт путешественника">Войдите, отмечайтесь в местах региона и собирайте штампы и достижения<Link to="/login?next=/passport" className="btn primary">Войти</Link></Empty></div>;
  if (loading || !data) return <div className="container page"><Loading h={400} /></div>;
  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Паспорт путешественника</h1><p className="lead">Нажмите «Отметиться здесь» на карточке места, когда будете рядом (до 300 м), — получите штамп.</p></div>
        <div className="panel" style={{ padding: "14px 20px", textAlign: "center" }}><div className="tiny muted">Уровень</div><div style={{ fontFamily: "var(--display)", fontSize: 34, fontWeight: 600 }}>{data.level}</div><div className="tiny muted">до следующего: {data.next_level_in}</div></div>
      </div>
      <h2 style={{ marginBottom: 16 }}>Достижения</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {data.achievements.map((a: any) => (
          <div key={a.id} className="card row" style={{ padding: 14, gap: 12, opacity: a.done ? 1 : 0.55 }}>
            <span style={{ width: 42, height: 42, borderRadius: "50%", background: a.done ? "var(--red)" : "var(--surface-2)", color: a.done ? "#fff" : "var(--ink-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>{a.done ? <Award size={20} /> : <Lock size={18} />}</span>
            <div><b>{a.title}</b><div className="tiny muted">{a.description}</div></div>
          </div>
        ))}
      </div>
      <h2 style={{ margin: "36px 0 18px" }}>Штампы ({data.stamps.length})</h2>
      {data.stamps.length ? (
        <div className="passport-grid">
          {data.stamps.map((s: any) => (
            <Link key={s.place.id} to={`/place/${s.place.slug}`} className="stamp" style={{ color: s.place.vertical.color, borderColor: s.place.vertical.color }}>
              <span>{s.place.name}<br /><span style={{ fontWeight: 500, opacity: .8 }}>{new Date(s.at).toLocaleDateString("ru-RU")}</span></span>
            </Link>
          ))}
        </div>
      ) : <Empty icon="map-pin" title="Пока нет штампов">Откройте любое место рядом с вами и нажмите «Отметиться здесь»</Empty>}
    </div>
  );
}
