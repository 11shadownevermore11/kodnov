import { useId, useMemo } from "react";

/** Рисованные пейзажи Донбасса. Цвета неба, холмов и огней берутся из переменных темы (--sky-*, --far, --mid, --near, --city, --lights),
 *  поэтому каждая цветовая тема перекрашивает все обложки. Работает офлайн, без фотографий. */
export type SceneKind = "city" | "sea" | "industry" | "creative" | "invest" | "park" | "food" | "hotel" | "museum" | "theatre" | "space";

const BY_ICON: Record<string, SceneKind> = {
  landmark: "museum", camera: "city", trees: "park", drama: "theatre", utensils: "food", coffee: "food", bed: "hotel", telescope: "space",
  blocks: "creative", music: "creative", clapperboard: "creative", "gamepad-2": "creative", "book-open": "creative", "building-2": "invest",
  megaphone: "creative", shirt: "creative", "pen-tool": "creative", factory: "industry", "hard-hat": "industry", "shopping-bag": "industry",
  handshake: "invest", briefcase: "invest", anchor: "sea", ship: "sea", waves: "sea", star: "city", palette: "creative", trophy: "city",
};
export const sceneFor = (icon?: string): SceneKind => BY_ICON[icon || ""] || "city";

function rng(seed: number) {
  let s = (seed * 9301 + 49297) % 233280 || 7;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Силуэт гряды терриконов: острые вершины с пологими склонами. */
function ridge(y: number, w: number, peaks: [number, number][], h = 250) {
  let d = `M0 ${h} L0 ${y}`;
  for (const [x, top] of peaks) d += ` L${x - top * 1.25} ${y} Q${x - 6} ${y - top + 4} ${x} ${y - top} Q${x + 6} ${y - top + 4} ${x + top * 1.35} ${y}`;
  return d + ` L${w} ${y} L${w} ${h} Z`;
}

export function Scene({ kind, seed = 1, accent = "var(--red)", className, style }: { kind: SceneKind; seed?: number; accent?: string; className?: string; style?: React.CSSProperties }) {
  const uid = useId().replace(/:/g, "");
  const r = useMemo(() => rng(seed + kind.length * 31), [seed, kind]);
  const W = 400, H = 250;
  const parts = useMemo(() => {
    const R = rng(seed * 7 + kind.length);
    const sunX = 60 + R() * 280, sunY = 50 + R() * 50;
    const stars = Array.from({ length: 16 }, () => [R() * W, R() * 110, R() * 1.2 + 0.4]);
    const far: [number, number][] = Array.from({ length: 4 }, (_, i) => [40 + i * 100 + R() * 50, 40 + R() * 45]);
    const mid: [number, number][] = Array.from({ length: 3 }, (_, i) => [80 + i * 130 + R() * 40, 25 + R() * 35]);
    return { sunX, sunY, stars, far, mid, R };
  }, [seed, kind]);
  void r;
  const { sunX, sunY, stars, far, mid } = parts;
  const R = rng(seed * 13 + 5);

  const subject = () => {
    switch (kind) {
      case "sea": {
        const lx = 250 + R() * 80;
        return (
          <g>
            <rect x="0" y="170" width={W} height="80" fill={`url(#w${uid})`} />
            {[0, 1, 2, 3].map((i) => <path key={i} d={`M${20 + i * 90} ${190 + (i % 2) * 18} q15 -6 30 0 t30 0`} stroke="var(--sun)" strokeOpacity=".35" fill="none" strokeWidth="2" />)}
            <path d={`M${lx - 60} 172 L${lx + 70} 172 L${lx + 40} 160 L${lx - 20} 160 Z`} style={{ fill: "var(--mid)" }} />
            <polygon points={`${lx - 9},162 ${lx + 9},162 ${lx + 5},96 ${lx - 5},96`} fill="#F4F1EA" />
            <rect x={lx - 9} y="120" width="18" height="10" style={{ fill: accent }} />
            <rect x={lx - 9} y="140" width="18" height="8" style={{ fill: accent }} />
            <rect x={lx - 7} y="86" width="14" height="11" style={{ fill: "var(--lights)" }} />
            <path d={`M${lx - 9} 86 L${lx} 76 L${lx + 9} 86 Z`} style={{ fill: accent }} />
            <path d={`M${lx} 91 L${lx - 170} 70 L${lx - 170} 105 Z`} style={{ fill: "var(--lights)" }} opacity=".18" />
            <g transform={`translate(${60 + R() * 100} 150)`}><path d="M0 18 L44 18 L36 26 L8 26 Z" style={{ fill: "var(--city)" }} /><path d="M22 18 L22 -14 L40 14 Z" fill="#F4F1EA" /><path d="M20 18 L20 -6 L6 14 Z" fill="#F4F1EA" opacity=".8" /></g>
          </g>
        );
      }
      case "industry": {
        const fx = 170 + R() * 60;
        return (
          <g style={{ fill: "var(--city)" }}>
            <path d={ridge(190, W, [[90, 95]], H)} style={{ fill: "var(--mid)" }} />
            <rect x={fx} y="140" width="150" height="60" />
            <path d={`M${fx} 140 l25 -18 l0 18 l25 -18 l0 18 l25 -18 l0 18 l25 -18 l0 18`} />
            <rect x={fx + 110} y="70" width="12" height="80" /><rect x={fx + 132} y="90" width="10" height="60" />
            {[0, 1, 2].map((i) => <circle key={i} cx={fx + 116 + i * 9} cy={58 - i * 14} r={7 + i * 4} fill="var(--ink-3)" opacity={0.35 - i * 0.08} />)}
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={fx + 10 + i * 26} y="158" width="14" height="10" style={{ fill: "var(--lights)" }} opacity=".85" />)}
            <rect x={fx + 6} y="182" width="40" height="18" style={{ fill: accent }} opacity=".9" />
          </g>
        );
      }
      case "creative": {
        const bx = 110 + R() * 90;
        return (
          <g>
            <circle cx={bx + 150} cy="95" r="34" style={{ fill: accent }} opacity=".9" />
            <rect x={bx} y="105" width="130" height="95" style={{ fill: "var(--city)" }} />
            {[0, 1, 2].map((row) => [0, 1, 2].map((c) => <rect key={`${row}${c}`} x={bx + 12 + c * 40} y={118 + row * 26} width="28" height="18" rx="2" style={{ fill: (row + c) % 2 ? "var(--lights)" : accent }} opacity={(row + c) % 2 ? 0.9 : 0.75} />))}
            <path d={`M${bx - 30} 102 Q${bx + 65} 130 ${bx + 160} 100`} stroke="var(--ink-3)" fill="none" strokeWidth="1.5" />
            {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={bx - 20 + i * 20} cy={104 + Math.sin(i / 8 * Math.PI) * 18} r="3.5" style={{ fill: "var(--lights)" }} />)}
          </g>
        );
      }
      case "invest": {
        return (
          <g style={{ fill: "var(--city)" }}>
            {[[150, 60, 40], [195, 90, 34], [235, 40, 46], [285, 110, 30]].map(([x, top, w], i) => (
              <g key={i}><rect x={x} y={top} width={w} height={200 - top} />
                {Array.from({ length: Math.floor((190 - top) / 14) }, (_, k) => <rect key={k} x={x + 5} y={top + 8 + k * 14} width={w - 10} height="4" style={{ fill: "var(--lights)" }} opacity={0.25 + ((k + i) % 3) * 0.25} />)}</g>
            ))}
            <path d="M80 200 L80 70 L90 70 L90 200 Z M55 74 L150 74 L150 80 L55 80 Z" />
            <line x1="140" y1="80" x2="140" y2="120" stroke="var(--city)" strokeWidth="1.5" />
            <rect x="133" y="120" width="14" height="10" style={{ fill: accent }} />
          </g>
        );
      }
      case "park": {
        return (
          <g>
            {Array.from({ length: 7 }, (_, i) => {
              const x = 30 + i * 55 + R() * 20, h = 40 + R() * 40;
              return <g key={i}><rect x={x - 2} y={200 - h * 0.5} width="4" height={h * 0.5} style={{ fill: "var(--city)" }} /><circle cx={x} cy={200 - h * 0.6} r={h * 0.35} style={{ fill: i % 3 === 0 ? accent : "var(--mid)" }} opacity={i % 3 === 0 ? 0.85 : 1} /></g>;
            })}
            <path d="M190 200 Q200 150 210 200 M200 200 Q215 140 230 200 M180 200 Q165 160 150 200" stroke="var(--sun)" strokeOpacity=".7" fill="none" strokeWidth="2" />
          </g>
        );
      }
      case "food": {
        const hx = 140 + R() * 80;
        return (
          <g>
            <rect x={hx} y="125" width="120" height="75" style={{ fill: "var(--city)" }} />
            {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${hx - 8 + i * 22.6} 125 l22.6 0 l-4 16 l-14.6 0 Z`} style={{ fill: i % 2 ? "#F4F1EA" : accent }} />)}
            <rect x={hx + 14} y="150" width="38" height="30" rx="3" style={{ fill: "var(--lights)" }} opacity=".9" />
            <rect x={hx + 70} y="150" width="34" height="50" rx="3" style={{ fill: "var(--mid)" }} />
            {[0, 1, 2].map((i) => <path key={i} d={`M${hx + 30 + i * 8} 112 q-6 -10 0 -20 q6 -10 0 -20`} stroke="var(--ink-3)" strokeOpacity=".6" fill="none" strokeWidth="2" />)}
          </g>
        );
      }
      case "hotel": {
        const x = 150 + R() * 60;
        return (
          <g>
            <rect x={x} y="50" width="90" height="150" style={{ fill: "var(--city)" }} />
            {Array.from({ length: 9 }, (_, row) => Array.from({ length: 4 }, (_, c) => <rect key={`${row}-${c}`} x={x + 9 + c * 20} y={60 + row * 15} width="12" height="8" style={{ fill: "var(--lights)" }} opacity={R() > 0.35 ? 0.9 : 0.15} />))}
            <rect x={x - 20} y="180" width="130" height="20" style={{ fill: accent }} opacity=".9" />
            <rect x={x + 30} y="40" width="30" height="10" style={{ fill: accent }} />
          </g>
        );
      }
      case "museum":
      case "theatre": {
        const x = 110 + R() * 80;
        return (
          <g style={{ fill: "var(--city)" }}>
            <path d={`M${x - 10} 110 L${x + 95} 70 L${x + 200} 110 Z`} />
            <rect x={x} y="110" width="190" height="10" />
            {Array.from({ length: 7 }, (_, i) => <rect key={i} x={x + 8 + i * 27} y="122" width="10" height="66" style={{ fill: "#F4F1EA" }} opacity=".85" />)}
            <rect x={x - 10} y="188" width="210" height="12" />
            {kind === "theatre" ? <circle cx={x + 95} cy="96" r="9" style={{ fill: accent }} /> : <rect x={x + 85} y="88" width="20" height="14" style={{ fill: accent }} />}
            {Array.from({ length: 6 }, (_, i) => <rect key={`l${i}`} x={x + 21 + i * 27} y="140" width="6" height="30" style={{ fill: "var(--lights)" }} opacity=".7" />)}
          </g>
        );
      }
      case "space": {
        return (
          <g>
            <path d="M150 200 L150 150 Q200 95 250 150 L250 200 Z" style={{ fill: "var(--city)" }} />
            <path d="M200 120 L262 82" stroke="var(--city)" strokeWidth="9" />
            <circle cx="300" cy="55" r="16" style={{ fill: "var(--sun)" }} opacity=".9" /><circle cx="307" cy="50" r="15" style={{ fill: "var(--sky-a)" }} />
            <ellipse cx="90" cy="60" rx="20" ry="6" stroke="var(--lights)" fill="none" strokeWidth="2" opacity=".7" /><circle cx="90" cy="60" r="9" style={{ fill: accent }} />
          </g>
        );
      }
      default: { // city
        const base = 200;
        const blocks = Array.from({ length: 11 }, (_, i) => [i * 38 + R() * 8, base - (30 + R() * 70), 26 + R() * 12]);
        return (
          <g>
            {blocks.map(([x, y, w], i) => (
              <g key={i}><rect x={x} y={y} width={w} height={base - y} style={{ fill: "var(--city)" }} />
                {Array.from({ length: Math.floor((base - y) / 12) }, (_, k) => <rect key={k} x={x + 5} y={y + 6 + k * 12} width={w - 10} height="3" style={{ fill: "var(--lights)" }} opacity={R() > 0.5 ? 0.75 : 0.12} />)}</g>
            ))}
            <g style={{ fill: "var(--city)" }}><circle cx="200" cy="118" r="18" /><rect x="182" y="118" width="36" height="82" /><rect x="198" y="88" width="4" height="14" /></g>
            <circle cx="200" cy="112" r="6" style={{ fill: accent }} />
            <rect x="330" y="60" width="4" height="140" style={{ fill: "var(--city)" }} /><circle cx="332" cy="60" r="4" style={{ fill: accent }} />
          </g>
        );
      }
    }
  };

  return (
    <svg className={className} style={style} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sky-a)" }} />
          <stop offset=".62" style={{ stopColor: "var(--sky-b)" }} />
          <stop offset="1" style={{ stopColor: "var(--sky-c)" }} />
        </linearGradient>
        <radialGradient id={`g${uid}`}>
          <stop offset="0" style={{ stopColor: "var(--sun)", stopOpacity: 0.95 }} />
          <stop offset=".35" style={{ stopColor: "var(--sun)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--sun)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`w${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--far)" }} />
          <stop offset="1" style={{ stopColor: "var(--near)" }} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#s${uid})`} />
      <g style={{ opacity: "var(--star)" as any }}>{stars.map(([x, y, s], i) => <circle key={i} cx={x} cy={y} r={s} fill="#fff" />)}</g>
      <circle cx={sunX} cy={sunY + 60} r="70" fill={`url(#g${uid})`} />
      <circle cx={sunX} cy={sunY + 60} r="16" style={{ fill: "var(--sun)" }} />
      <path d={ridge(165, W, far, H)} style={{ fill: "var(--far)" }} />
      <path d={ridge(185, W, mid, H)} style={{ fill: "var(--mid)" }} opacity=".9" />
      {subject()}
      <path d={`M0 ${H} L0 205 Q100 ${190 + (seed % 3) * 6} 200 205 T400 200 L400 ${H} Z`} style={{ fill: "var(--near)" }} />
      {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={20 + i * 50 + (i * 37 % 20)} cy={222 + (i % 3) * 6} r="3" style={{ fill: accent }} opacity=".75" />)}
    </svg>
  );
}

/** Террикон: усечённый конус с освещённой гранью — узнаваемый силуэт Донбасса. */
function terrikon(cx: number, base: number, h: number, w: number) {
  const top = base - h, tw = w * 0.07;
  return {
    body: `M${cx - w / 2} ${base} L${cx - tw} ${top + 4} Q${cx} ${top - 3} ${cx + tw} ${top + 4} L${cx + w / 2} ${base} Z`,
    lit: `M${cx + tw * 0.3} ${top + 2} L${cx + tw} ${top + 4} L${cx + w / 2} ${base} L${cx + w * 0.18} ${base} Z`,
  };
}

/** Большой панорамный пейзаж главного экрана: небо, звёзды, солнце, терриконы, силуэт Донецка, река Кальмиус, ковыль и розы. */
export function HeroLandscape() {
  const uid = useId().replace(/:/g, "");
  const R = rng(42);
  const W = 1600;
  const stars = Array.from({ length: 90 }, () => [R() * W, R() * 430, R() * 1.4 + 0.3, R()]);
  const skyline: [number, number, number][] = [];
  let x = 820;
  while (x < 1560) { const w = 22 + R() * 34; skyline.push([x, 590 - (40 + R() * 120), w]); x += w + 2 + R() * 8; }
  const farT = [terrikon(170, 600, 230, 420), terrikon(520, 600, 150, 300), terrikon(1460, 600, 190, 360)];
  const midT = [terrikon(360, 655, 120, 260), terrikon(1240, 655, 95, 220)];
  const grass = Array.from({ length: 120 }, (_, i) => {
    const gx = (i * 137) % W, gy = 790 + ((i * 59) % 110), hgt = 26 + ((i * 31) % 30), bend = ((i * 17) % 22) - 11;
    return `M${gx} ${gy} q${bend / 2} -${hgt / 2} ${bend} -${hgt}`;
  });
  const roses = Array.from({ length: 16 }, (_, i) => [1020 + ((i * 97) % 560), 800 + ((i * 47) % 85), 5 + (i % 3)]);
  return (
    <svg className="hero-land" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id={`hs${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sky-a)" }} />
          <stop offset=".5" style={{ stopColor: "var(--sky-b)" }} />
          <stop offset=".72" style={{ stopColor: "var(--sky-c)" }} />
        </linearGradient>
        <radialGradient id={`hg${uid}`}>
          <stop offset="0" style={{ stopColor: "var(--sun)", stopOpacity: 0.95 }} />
          <stop offset=".22" style={{ stopColor: "var(--sun)", stopOpacity: 0.4 }} />
          <stop offset="1" style={{ stopColor: "var(--sun)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`hz${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sky-c)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--sky-c)", stopOpacity: 0.55 }} />
        </linearGradient>
        <linearGradient id={`hr${uid}`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sky-c)", stopOpacity: 0.85 }} />
          <stop offset="1" style={{ stopColor: "var(--sky-b)", stopOpacity: 0.9 }} />
        </linearGradient>
        <filter id={`hb${uid}`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="22" /></filter>
        <linearGradient id={`hn${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--near)" }} />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill={`url(#hs${uid})`} />
      <g className="hl-stars" style={{ opacity: "var(--star)" as any }}>
        {stars.map(([sx, sy, s, t], i) => <circle key={i} cx={sx} cy={sy} r={s} fill="#fff" opacity={0.35 + t * 0.65} />)}
      </g>
      <g className="hl-sun"><circle cx="840" cy="590" r="460" fill={`url(#hg${uid})`} /><circle cx="840" cy="590" r="78" style={{ fill: "var(--sun)" }} /></g>
      {/* облака */}
      <g fill="#fff" opacity=".09" filter={`url(#hb${uid})`}>
        <ellipse cx="300" cy="200" rx="240" ry="34" /><ellipse cx="460" cy="176" rx="140" ry="28" />
        <ellipse cx="1300" cy="150" rx="280" ry="30" /><ellipse cx="1180" cy="300" rx="180" ry="20" />
      </g>
      {/* птицы */}
      <g stroke="var(--city)" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".7">
        {[[880, 340], [920, 318], [952, 352], [1100, 280]].map(([bx, by], i) => <path key={i} d={`M${bx - 10} ${by} q5 -7 10 0 q5 -7 10 0`} />)}
      </g>
      <g className="hl-far">
        {farT.map((t, i) => <g key={i}><path d={t.body} style={{ fill: "var(--far)", stroke: "var(--sky-c)", strokeOpacity: 0.35, strokeWidth: 1.5 }} /><path d={t.lit} style={{ fill: "var(--sky-c)" }} opacity=".3" /></g>)}
        <path d="M0 600 Q400 585 800 598 T1600 592 L1600 900 L0 900 Z" style={{ fill: "var(--far)" }} />
      </g>
      <rect x="0" y="470" width="1600" height="140" fill={`url(#hz${uid})`} />
      <g className="hl-city" style={{ fill: "var(--city)" }}>
        {skyline.map(([bx, by, bw], i) => (
          <g key={i}><rect x={bx} y={by} width={bw} height={640 - by} rx="2" />
            {Array.from({ length: Math.floor((585 - by) / 14) }, (_, k) => (
              <rect key={k} x={bx + 5} y={by + 8 + k * 14} width={bw - 10} height="3.5" style={{ fill: "var(--lights)" }} opacity={((i * 7 + k * 3) % 5) > 1 ? 0.7 : 0.1} />
            ))}
          </g>
        ))}
        {/* Донбасс Опера, стадион, телебашня */}
        <g transform="translate(700 0)"><rect x="0" y="520" width="110" height="120" /><path d="M8 522 Q55 455 102 522 Z" /><rect x="52" y="452" width="6" height="22" />
          {[16, 36, 56, 76, 94].map((cx) => <rect key={cx} x={cx} y="540" width="8" height="34" rx="4" style={{ fill: "var(--lights)" }} opacity=".55" />)}</g>
        <path d="M1300 640 L1300 548 Q1390 500 1480 548 L1480 640 Z" /><path d="M1308 552 Q1390 508 1472 552" stroke="var(--lights)" strokeWidth="3" fill="none" opacity=".55" />
        <rect x="1530" y="330" width="7" height="310" /><circle cx="1533" cy="330" r="6" style={{ fill: "var(--red)" }} />
      </g>
      <g className="hl-mid">
        {midT.map((t, i) => <g key={i}><path d={t.body} style={{ fill: "var(--mid)", stroke: "var(--sky-c)", strokeOpacity: 0.25, strokeWidth: 1.5 }} /><path d={t.lit} style={{ fill: "var(--sky-c)" }} opacity=".22" /></g>)}
        <path d="M0 660 Q260 630 560 655 T1100 650 T1600 640 L1600 900 L0 900 Z" style={{ fill: "var(--mid)" }} />
      </g>
      {/* река Кальмиус */}
      <path className="hl-river" d="M1600 668 C1300 676 1150 690 980 704 C760 722 560 716 380 740 C230 760 120 780 0 800 L0 836 C150 812 300 790 470 772 C700 748 900 742 1100 724 C1300 706 1450 694 1600 690 Z" fill={`url(#hr${uid})`} />
      <g className="hl-river" stroke="var(--sun)" strokeOpacity=".45" strokeWidth="2.5" strokeLinecap="round">
        {[[1180, 702, 70], [1000, 716, 90], [780, 734, 60], [560, 752, 80], [300, 782, 50]].map(([gx, gy, gl], i) => <path key={i} d={`M${gx} ${gy} h${gl}`} />)}
      </g>
      <path className="hl-near" d="M0 900 L0 818 Q260 770 560 800 T1100 790 T1600 760 L1600 900 Z" fill={`url(#hn${uid})`} />
      <g className="hl-near" stroke="var(--far)" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".55">
        {grass.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g className="hl-near">
        {roses.map(([rx, ry, rr], i) => (
          <g key={i} transform={`translate(${rx} ${ry})`}>
            <path d={`M0 0 q${i % 2 ? 4 : -4} 14 0 ${24 + (i % 3) * 6}`} stroke="var(--far)" strokeWidth="2" fill="none" />
            <circle r={rr} style={{ fill: "var(--rose, var(--red))" }} />
            <circle r={rr * 0.55} cx={rr * 0.25} cy={-rr * 0.2} fill="#000" opacity=".18" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Силуэт террикона с травой — декоративный элемент секций (как пальмы на референсе). */
export function TerrikonDeco({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 220" aria-hidden>
      <path d="M0 220 L70 220 Q130 60 150 40 Q170 60 230 220 L300 220 Z" fill="currentColor" />
      {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${10 + i * 21} 220 q${4 - (i % 3) * 4} -${20 + (i % 4) * 8} ${8} -${36 + (i % 3) * 10}`} stroke="currentColor" strokeWidth="3" fill="none" />)}
    </svg>
  );
}
