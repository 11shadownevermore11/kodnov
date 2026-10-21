import { Link, useNavigate } from "react-router-dom";
import { Route, CloudOff, Cloud } from "lucide-react";
import { useStore } from "../store";
import { Empty, PlaceCard } from "../ui/kit";

export default function Favorites() {
  const { favorites, user } = useStore();
  const nav = useNavigate();
  const list = Object.values(favorites);
  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>Избранное</h1>
          <p className="lead row" style={{ gap: 8 }}>
            {user ? <><Cloud size={18} />Синхронизируется между сайтом и приложением</> : <><CloudOff size={18} />Хранится на этом устройстве и работает без интернета. Войдите, чтобы синхронизировать.</>}
          </p>
        </div>
        {list.length > 1 && (
          <button className="btn primary" onClick={() => { try { sessionStorage.setItem("kod-builder", JSON.stringify(list.map((p) => p.id))); } catch { /* */ } nav("/routes/builder"); }}>
            <Route size={18} />Собрать маршрут из избранного
          </button>
        )}
      </div>
      {list.length ? <div className="grid">{list.map((p) => <PlaceCard key={p.id} p={p} />)}</div>
        : <Empty icon="heart" title="Здесь будут сохранённые места">Нажмите ♥ на карточке места — оно появится здесь, даже без интернета<Link to="/catalog" className="btn secondary">Открыть каталог</Link></Empty>}
    </div>
  );
}
