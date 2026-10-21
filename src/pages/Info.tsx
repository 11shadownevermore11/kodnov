import { api } from "../api";
import { useAsync } from "../store";
import { Icon, Loading } from "../ui/kit";

export default function Info() {
  const { data, loading } = useAsync(() => api<any[]>("/api/info"), []);
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <div className="page-head"><div><h1>Важно знать</h1><p className="lead">Короткая памятка для гостей региона. Сохраняется на устройстве и доступна без интернета.</p></div></div>
      {loading ? <Loading h={300} /> : (
        <div className="grid two">
          {(data || []).map((s) => (
            <section key={s.id} className="panel stack">
              <h3 className="row" style={{ gap: 10, fontSize: 19 }}><Icon name={s.icon} size={22} />{s.title}</h3>
              {s.items.map((it: any) => <div key={it.title}><b>{it.title}</b><div className="small muted">{it.text}</div></div>)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
