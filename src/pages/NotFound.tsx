import { Link } from "react-router-dom";
import { Empty } from "../ui/kit";

export default function NotFound() {
  return <div className="container page"><Empty icon="map-pin" title="Такой страницы нет">Возможно, адрес изменился. Начните с карты или каталога.<Link to="/" className="btn primary">На главную</Link></Empty></div>;
}
