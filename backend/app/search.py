"""Поиск с учётом морфологии (Snowball-стемминг), опечаток (нечёткое сравнение), неверной раскладки и синонимов."""
import re
import threading

import snowballstemmer
from rapidfuzz import process, fuzz

_stem_ru = snowballstemmer.stemmer("russian")
_stem_en = snowballstemmer.stemmer("english")

_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
_RU = "йцукенгшщзхъфывапролджэячсмитьбюё"
LAYOUT = str.maketrans(_EN, _RU)

SYNONYMS = {
    "поесть": ["кафе", "ресторан", "кофейня", "столовая", "пекарня", "еда"],
    "покушать": ["кафе", "ресторан", "столовая"],
    "еда": ["кафе", "ресторан", "гастро"],
    "кофе": ["кофейня", "кафе"],
    "переночевать": ["отель", "гостиница", "хостел"],
    "ночлег": ["отель", "гостиница", "хостел"],
    "жилье": ["отель", "гостиница", "хостел"],
    "погулять": ["парк", "сквер", "набережная", "бульвар"],
    "прогулка": ["парк", "сквер", "набережная", "бульвар"],
    "дети": ["детский", "семейный", "детьми"],
    "ребенок": ["детский", "семейный", "детьми"],
    "море": ["морской", "приазовье", "набережная", "маяк", "порт"],
    "айти": ["it", "игры", "разработка", "программирование"],
    "it": ["айти", "игры", "разработка"],
    "игры": ["геймдев", "it"],
    "завод": ["предприятие", "производство", "фабрика", "комбинат"],
    "фабрика": ["предприятие", "производство", "завод"],
    "экскурсия": ["экскурсии", "тур"],
    "музыка": ["звукозапись", "концерт", "филармония", "опера"],
    "кино": ["кинотеатр", "киностудия", "фильм"],
    "театр": ["опера", "балет", "драма", "спектакль"],
    "книги": ["книжный", "библиотека"],
    "искусство": ["музей", "галерея", "выставка", "арт"],
    "выпить": ["бар", "пивоварня", "дегустация"],
    "пиво": ["пивоварня", "бар"],
    "сувенир": ["сделано в регионе", "магазин", "ремесло"],
    "инвестиции": ["площадка", "технопарк", "промплощадка"],
    "работа": ["вакансия", "стажировка"],
    "стажировка": ["стажеров", "практика"],
    "донецк": [],
}

FIELD_WEIGHTS = {"name": 6.0, "category": 3.5, "tags": 3.0, "vertical": 2.0, "address": 2.0, "attrs": 1.5,
                 "description": 1.0}


def normalize(text: str) -> str:
    text = (text or "").lower().replace("ё", "е")
    return re.sub(r"[^\w\s-]", " ", text)


def tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[\s\-_/]+", normalize(text)) if t]


def stem(word: str) -> str:
    if re.match(r"^[a-z0-9]+$", word):
        return _stem_en.stemWord(word)
    return _stem_ru.stemWord(word)


def fix_layout(word: str) -> str | None:
    if re.match(r"^[a-z\[\];',.`]+$", word):
        return word.translate(LAYOUT)
    return None


class SearchIndex:
    def __init__(self):
        self.docs: dict[int, dict[str, set]] = {}
        self.vocab: list[str] = []
        self.vocab_set: set = set()
        self.display: dict[str, str] = {}
        self.lock = threading.Lock()

    def build(self, places):
        docs, vocab, display = {}, set(), {}
        for p in places:
            fields = {
                "name": p.name,
                "category": p.category.name if p.category else "",
                "vertical": p.vertical.name if p.vertical else "",
                "tags": " ".join(p.tags or []),
                "address": f"{p.address} {p.city}",
                "attrs": " ".join(str(v) for v in (p.attrs or {}).values() if isinstance(v, (str, int))),
                "description": f"{p.short} {p.description}",
            }
            doc = {}
            for f, text in fields.items():
                st = set()
                for t in tokens(text):
                    if len(t) > 1:
                        k = stem(t)
                        st.add(k)
                        display.setdefault(k, t)
                doc[f] = st
                vocab |= st
            doc["_name"] = normalize(p.name)
            docs[p.id] = doc
        with self.lock:
            self.docs = docs
            self.vocab = sorted(v for v in vocab if len(v) >= 3)
            self.vocab_set = vocab
            self.display = display

    def expand(self, token: str) -> dict[str, float]:
        """Возвращает варианты основы слова с весами: точная, синонимы, раскладка, опечатки."""
        out: dict[str, float] = {}
        self._fixes = getattr(self, "_fixes", {})
        variants = [token]
        lay = fix_layout(token)
        if lay:
            variants.append(lay)
            self._fixes[token] = lay
        for v in variants:
            s = stem(v)
            out[s] = max(out.get(s, 0), 1.0 if v == token else 0.95)
            for syn in SYNONYMS.get(v, []):
                for st in tokens(syn):
                    out[stem(st)] = max(out.get(stem(st), 0), 0.8)
            if v != token and s in self.vocab_set:
                self._fixes[token] = self.display.get(s, v)
            known = s in self.vocab_set
            if len(s) >= 4 and self.vocab:
                for cand, score, _ in process.extract(s, self.vocab, scorer=fuzz.ratio, limit=4,
                                                      score_cutoff=88 if known else 75):
                    if cand == s:
                        continue
                    w = 0.55 + (score - 75) / 100
                    if known:
                        w *= 0.25  # слово существует — опечатки почти не учитываем
                    elif v == token and token not in self._fixes and token not in SYNONYMS:
                        self._fixes[token] = self.display.get(cand, cand)
                    out[cand] = max(out.get(cand, 0), w)
        return out

    def search(self, query: str) -> tuple[dict[int, float], list[str]]:
        q_tokens = [t for t in tokens(query) if len(t) > 1]
        if not q_tokens:
            return {}, []
        self._fixes = {}
        expansions = [self.expand(t) for t in q_tokens]
        qnorm = normalize(query).strip()
        results: dict[int, float] = {}
        with self.lock:
            docs = self.docs
        for pid, doc in docs.items():
            total, matched = 0.0, 0
            for exp in expansions:
                best = 0.0
                for field, w in FIELD_WEIGHTS.items():
                    fs = doc[field]
                    for st, ew in exp.items():
                        if st in fs:
                            best = max(best, w * ew)
                        elif len(st) >= 4 and any(x.startswith(st) for x in fs):
                            best = max(best, w * ew * 0.6)
                if best > 0:
                    matched += 1
                    total += best
            n = len(expansions)
            if matched == 0 or (n >= 2 and matched < n - (1 if n >= 3 else 0)):
                continue
            score = total * (matched / n) ** 2
            if qnorm and qnorm in doc["_name"]:
                score += 8
            results[pid] = score
        # «Возможно, вы искали»: исправленные слова (опечатки и неверная раскладка)
        fixed = [self._fixes.get(t, t) for t in q_tokens]
        hints = [" ".join(fixed)] if fixed != q_tokens else []
        return results, hints


INDEX = SearchIndex()


def rebuild_index(db):
    from .models import Place
    places = db.query(Place).filter(Place.moderation == "published").all()
    INDEX.build(places)
