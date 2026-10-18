import type { ComponentType, ReactNode } from 'react';
import type { FrameEl, TapeEl, TextEl } from '@scrapbook/shared';

export const fontFamily: Record<TextEl['font'], string> = {
  'dancing-script': "'Dancing Script', cursive",
  'patrick-hand': "'Patrick Hand', cursive",
};

export const frameStyleLabels: Record<FrameEl['frameStyle'], string> = {
  polaroid: 'Polaroid', 'instant-mini': 'Instant mini', plain: 'Thin white', rounded: 'Rounded', corners: 'Photo corners',
  stamp: 'Stamp', film: 'Film strip', scallop: 'Scalloped', 'kraft-mat': 'Kraft mat', 'double-line': 'Double line',
  doodle: 'Hand-drawn', torn: 'Torn paper', circle: 'Circle', heart: 'Heart',
};
export const tapeStyles: TapeEl['tapeStyle'][] = ['yellow', 'pink', 'mint', 'kraft'];

export const Tape = ({ tapeStyle }: { tapeStyle: TapeEl['tapeStyle'] }) => <div className={`tape tape-${tapeStyle}`} />;

// Hand-drawn sticker set: same ink outline, flat pastel fills, a white highlight.
// Die-cut white border + offset shadow are the same shapes drawn fat underneath (CSS .cut / .cut-shadow),
// not CSS filters: drop-shadow stacks were too slow to paint while scrolling.
const INK = '#4a3b2c';
const svg = (children: ReactNode): ComponentType => {
  const Svg = () => (
    <svg viewBox="0 0 100 100" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <g className="cut-shadow" transform="translate(0 2.5)">{children}</g>
      <g className="cut">{children}</g>
      {children}
    </svg>
  );
  return Svg;
};
const hi = (d: string) => <path d={d} stroke="#fff" strokeWidth={3} opacity={0.85} />;
// Chibi face: dot eyes, blush, small smile (sea creatures).
const face = (cx: number, cy: number, gap = 10) => <>
  <circle cx={cx - gap} cy={cy} r={3.2} fill={INK} stroke="none" />
  <circle cx={cx + gap} cy={cy} r={3.2} fill={INK} stroke="none" />
  <ellipse cx={cx - gap - 6} cy={cy + 7} rx={5} ry={3} fill="#f07c8c" opacity={0.55} stroke="none" />
  <ellipse cx={cx + gap + 6} cy={cy + 7} rx={5} ry={3} fill="#f07c8c" opacity={0.55} stroke="none" />
  <path d={`M${cx - 4} ${cy + 6} q4 4 8 0`} strokeWidth={2.5} />
</>;
const octopus = (fill: string) => svg(<>
  {['M24 50 C 22 64 14 70 8 72 C 16 79 29 72 33 57', 'M36 54 C 34 70 28 80 21 86 C 32 89 43 77 45 58',
    'M46 58 C 46 74 50 84 54 91 C 59 82 57 70 55 58', 'M56 57 C 58 76 68 88 79 86 C 73 80 66 70 65 54',
    'M67 57 C 71 72 86 79 92 72 C 86 70 78 64 76 50'].map((d) => <path key={d} d={d} fill={fill} />)}
  <path d="M20 54 C 16 26 34 10 50 10 C 66 10 84 26 80 54 C 70 63 30 63 20 54 Z" fill={fill} />
  {face(50, 38)}
  {hi('M30 26 q6-9 15-10')}
</>);

export const stickers: Record<string, { label: string; Svg: ComponentType }> = {
  flower: { label: 'Flower', Svg: svg(<>
    <g fill="#f4a6b8">
      {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="50" cy="28" rx="14" ry="19" transform={`rotate(${a} 50 50)`} />)}
    </g>
    <circle cx="50" cy="50" r="11" fill="#f7d26a" />
    <path d="M46 47 l1 1 M53 46 l1 1 M50 54 l1 1" strokeWidth={3} />
    {hi('M42 18 q3-6 9-6')}
  </>) },
  heart: { label: 'Heart', Svg: svg(<>
    <path d="M50 85 C 22 66 9 49 14 32 C 19 17 39 14 50 30 C 61 13 82 17 87 32 C 91 49 77 65 50 85 Z" fill="#e8737a" />
    {hi('M24 34 q2-9 11-10')}
  </>) },
  star: { label: 'Star', Svg: svg(<>
    <path d="M50 9 L61 37 L90 38 L67 57 L76 87 L50 70 L24 87 L33 57 L10 38 L39 36 Z" fill="#f7d26a" />
    {hi('M45 26 l3-8')}
    <path d="M86 12 v8 M82 16 h8 M14 74 v6 M11 77 h6" strokeWidth={2.5} />
  </>) },
  leaf: { label: 'Leaf', Svg: svg(<>
    <path d="M18 84 C 18 42 44 18 85 15 C 83 56 60 82 18 84 Z" fill="#9cc78f" />
    <path d="M18 84 Q 48 54 76 24 M40 61 l-3-14 M52 49 l-2-14 M40 61 l14 1 M52 49 l14 1 M64 37 l12 1" strokeWidth={2.5} />
  </>) },
  sun: { label: 'Sun', Svg: svg(<>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M50 13 V4" transform={`rotate(${a} 50 50)`} />)}
    <circle cx="50" cy="50" r="24" fill="#f7c55a" />
    <path d="M42 46 v1 M58 46 v1 M42 56 q8 7 16 0" />
    <path d="M34 54 h3 M63 54 h3" stroke="#ef8a6b" strokeWidth={4} />
  </>) },
  moon: { label: 'Moon', Svg: svg(<>
    <path d="M60 12 A 38 38 0 1 0 88 66 A 30 30 0 1 1 60 12 Z" fill="#f3e3a0" />
    <path d="M36 48 a3 3 0 1 0 1 0 M48 70 a2 2 0 1 0 1 0" fill="#e2cc7a" strokeWidth={2} />
    <path d="M80 22 v8 M76 26 h8" strokeWidth={2.5} />
  </>) },
  camera: { label: 'Camera', Svg: svg(<>
    <path d="M36 30 l5-9 h18 l5 9" fill="#e9dccb" />
    <rect x="12" y="30" width="76" height="52" rx="9" fill="#9fc3d9" />
    <circle cx="50" cy="56" r="17" fill="#fffdf7" />
    <circle cx="50" cy="56" r="9" fill="#6d8ea3" />
    <rect x="72" y="37" width="9" height="6" rx="2" fill="#f7d26a" strokeWidth={2.5} />
    {hi('M45 50 q2-3 6-3')}
  </>) },
  plane: { label: 'Paper plane', Svg: svg(<>
    <path d="M8 46 L90 14 L64 84 L48 60 Z" fill="#fffdf7" />
    <path d="M48 60 L90 14 M48 60 L50 76 L58 69" fill="#e3ecf2" />
    <path d="M10 86 q14 -2 22 -14" strokeDasharray="4 7" strokeWidth={2.5} />
  </>) },
  ticket: { label: 'Ticket stub', Svg: svg(<>
    <path d="M10 28 H90 V42 A8 8 0 0 0 90 58 V72 H10 V58 A8 8 0 0 0 10 42 Z" fill="#f1b68a" transform="rotate(-8 50 50)" />
    <g transform="rotate(-8 50 50)">
      <path d="M68 31 V69" strokeDasharray="3 5" strokeWidth={2.5} />
      <text x="39" y="55" fontSize="9" textAnchor="middle" fill={INK} stroke="none" fontFamily="'Patrick Hand', cursive">ADMIT ONE</text>
      <text x="79" y="54" fontSize="9" textAnchor="middle" fill={INK} stroke="none" fontFamily="'Patrick Hand', cursive">07</text>
    </g>
  </>) },
  coffee: { label: 'Coffee cup', Svg: svg(<>
    <path d="M38 26 q-6-7 0-13 q5-5 0-11 M54 26 q-6-7 0-13 q5-5 0-11" strokeWidth={3} />
    <path d="M71 46 q16 -1 14 14 q-2 12 -17 10" />
    <path d="M20 34 H74 L67 83 Q 65 90 58 90 H36 Q 29 90 27 83 Z" fill="#fffdf7" />
    <path d="M23 52 H71 L69 66 H25 Z" fill="#c99a6b" />
    {hi('M30 40 l2 8')}
  </>) },
  cloud: { label: 'Cloud', Svg: svg(<>
    <path d="M24 74 Q 7 74 9 59 Q 11 45 27 47 Q 28 26 49 28 Q 66 21 75 40 Q 93 40 91 58 Q 89 74 74 74 Z" fill="#dcebf4" />
    <path d="M40 58 v1 M58 58 v1 M46 64 q3 3 6 0" />
    {hi('M30 52 q2-8 10-9')}
  </>) },
  arrow: { label: 'Arrow doodle', Svg: svg(<>
    <path d="M10 74 C 26 46 48 84 58 58 C 65 40 45 34 47 50 C 49 68 74 62 86 30" strokeWidth={4} />
    <path d="M74 30 L87 28 L89 42" strokeWidth={4} />
  </>) },
  butterfly: { label: 'Butterfly', Svg: svg(<>
    <path d="M50 46 C 36 20 10 18 12 38 C 13 52 30 54 48 50 C 30 56 20 72 30 80 C 40 86 48 70 50 56" fill="#c6b3e6" />
    <path d="M50 46 C 64 20 90 18 88 38 C 87 52 70 54 52 50 C 70 56 80 72 70 80 C 60 86 52 70 50 56" fill="#c6b3e6" />
    <path d="M50 36 V70 M50 36 q-4-12 -10-16 M50 36 q4-12 10-16" strokeWidth={3} />
    <path d="M24 34 a3 3 0 1 0 1 0 M75 34 a3 3 0 1 0 1 0" fill="#fff" strokeWidth={2} />
  </>) },
  strawberry: { label: 'Strawberry', Svg: svg(<>
    <path d="M50 88 C 26 74 16 50 24 36 C 32 26 68 26 76 36 C 84 50 74 74 50 88 Z" fill="#ef7b7b" />
    <path d="M30 32 L38 22 L44 30 L50 18 L56 30 L62 22 L70 32 C 60 38 40 38 30 32 Z" fill="#8cc68a" />
    <path d="M38 48 l1 2 M52 46 l1 2 M62 54 l1 2 M44 62 l1 2 M56 68 l1 2 M36 58 l1 2" stroke="#ffe7a8" strokeWidth={3} />
    {hi('M30 46 q2-6 8-8')}
  </>) },
  cherries: { label: 'Cherries', Svg: svg(<>
    <path d="M36 64 C 44 40 52 26 66 14 M66 64 C 64 44 64 28 66 14" strokeWidth={3} />
    <path d="M66 14 C 74 12 84 16 86 24 C 78 26 70 22 66 14 Z" fill="#8cc68a" />
    <circle cx="34" cy="72" r="15" fill="#d9555f" />
    <circle cx="66" cy="72" r="15" fill="#d9555f" />
    {hi('M25 68 q2-6 7-7')}{hi('M57 68 q2-6 7-7')}
  </>) },
  rainbow: { label: 'Rainbow', Svg: svg(<>
    <path d="M10 72 A40 40 0 0 1 90 72 L78 72 A28 28 0 0 0 22 72 Z" fill="#f29b9b" />
    <path d="M22 72 A28 28 0 0 1 78 72 L68 72 A18 18 0 0 0 32 72 Z" fill="#f7d26a" />
    <path d="M32 72 A18 18 0 0 1 68 72 L58 72 A8 8 0 0 0 42 72 Z" fill="#9fd3c7" />
    <path d="M6 78 q0-10 10-10 q4-8 12-4 q8 0 8 10 q0 6-6 6 H12 q-6 0-6-2 Z" fill="#fffaf0" />
    <path d="M64 78 q0-10 10-10 q4-8 12-4 q8 0 8 10 q0 6-6 6 H70 q-6 0-6-2 Z" fill="#fffaf0" />
  </>) },
  balloon: { label: 'Balloon', Svg: svg(<>
    <path d="M50 66 C 30 62 22 44 26 30 C 30 14 70 14 74 30 C 78 44 70 62 50 66 Z" fill="#8fb8e8" />
    <path d="M46 66 L54 66 L50 72 Z" fill="#8fb8e8" strokeWidth={2.5} />
    <path d="M50 72 C 44 80 56 84 48 94" strokeWidth={2.5} />
    {hi('M34 30 q3-9 12-11')}
  </>) },
  gift: { label: 'Gift box', Svg: svg(<>
    <rect x="18" y="42" width="64" height="44" rx="4" fill="#f4a6b8" />
    <rect x="14" y="32" width="72" height="14" rx="3" fill="#f7c0cd" />
    <path d="M44 32 V86 M56 32 V86" stroke="#fffaf0" strokeWidth={5} />
    <path d="M50 32 C 40 14 26 20 32 30 C 36 34 46 33 50 32 C 54 33 64 34 68 30 C 74 20 60 14 50 32 Z" fill="#f7d26a" />
  </>) },
  cake: { label: 'Cake slice', Svg: svg(<>
    <path d="M14 70 L70 40 L86 56 L86 82 L14 82 Z" fill="#f7e3c4" />
    <path d="M14 70 L70 40 L86 56 L30 70 Z" fill="#fffaf0" />
    <path d="M14 76 H86" stroke="#f4a6b8" strokeWidth={4} />
    <circle cx="66" cy="38" r="8" fill="#e8737a" />
    <path d="M66 30 q2-6 6-8" strokeWidth={2.5} />
  </>) },
  music: { label: 'Music notes', Svg: svg(<>
    <path d="M38 72 V24 L80 14 V62" strokeWidth={4} />
    <path d="M38 24 L80 14 V26 L38 36 Z" fill={INK} />
    <ellipse cx="30" cy="74" rx="11" ry="8" fill="#c6b3e6" transform="rotate(-18 30 74)" />
    <ellipse cx="72" cy="64" rx="11" ry="8" fill="#c6b3e6" transform="rotate(-18 72 64)" />
  </>) },
  bow: { label: 'Ribbon bow', Svg: svg(<>
    <path d="M50 46 C 34 26 12 28 14 44 C 16 58 36 56 50 50 Z" fill="#f29b9b" />
    <path d="M50 46 C 66 26 88 28 86 44 C 84 58 64 56 50 50 Z" fill="#f29b9b" />
    <path d="M46 52 L34 84 L42 80 L46 88 L50 56 Z M54 52 L66 84 L58 80 L54 88 L50 56 Z" fill="#e8737a" />
    <rect x="43" y="40" width="14" height="16" rx="5" fill="#e8737a" />
    {hi('M22 40 q4-6 12-4')}
  </>) },
  letter: { label: 'Love letter', Svg: svg(<>
    <rect x="12" y="26" width="76" height="52" rx="4" fill="#fffaf0" />
    <path d="M12 30 L50 58 L88 30" />
    <path d="M50 66 C 40 58 38 50 44 47 C 47 45 50 48 50 50 C 50 48 53 45 56 47 C 62 50 60 58 50 66 Z" fill="#e8737a" strokeWidth={2.5} />
  </>) },
  pin: { label: 'Map pin', Svg: svg(<>
    <path d="M50 92 C 34 70 22 56 22 40 C 22 22 36 10 50 10 C 64 10 78 22 78 40 C 78 56 66 70 50 92 Z" fill="#e8737a" />
    <circle cx="50" cy="40" r="12" fill="#fffaf0" />
    {hi('M32 30 q4-10 14-13')}
  </>) },
  mountain: { label: 'Mountains', Svg: svg(<>
    <path d="M6 82 L36 30 L54 60 L66 42 L94 82 Z" fill="#9fb8a8" />
    <path d="M28 44 L36 30 L44 44 L40 40 L36 46 L32 40 Z" fill="#fffaf0" strokeWidth={2.5} />
    <circle cx="74" cy="22" r="9" fill="#f7d26a" />
  </>) },
  icecream: { label: 'Ice cream', Svg: svg(<>
    <path d="M30 50 L50 94 L70 50 Z" fill="#e6c08f" />
    <path d="M36 58 L60 80 M64 58 L42 80" strokeWidth={2.5} />
    <path d="M26 52 C 18 46 20 32 32 32 C 32 18 52 12 58 24 C 72 20 82 36 74 46 C 78 52 72 56 66 52 Z" fill="#f7c0cd" />
    <circle cx="52" cy="14" r="6" fill="#d9555f" />
    {hi('M34 38 q3-6 9-6')}
  </>) },
  clover: { label: 'Clover', Svg: svg(<>
    {[0, 90, 180, 270].map((a) => (
      <path key={a} d="M50 48 C 40 40 34 26 42 20 C 46 17 50 20 50 24 C 50 20 54 17 58 20 C 66 26 60 40 50 48 Z" fill="#8cc68a" transform={`rotate(${a} 50 50)`} />
    ))}
    <path d="M52 52 q8 18 20 32" strokeWidth={3.5} />
  </>) },
  paw: { label: 'Paw print', Svg: svg(<>
    <path d="M50 54 C 64 54 76 66 74 78 C 72 88 60 84 50 84 C 40 84 28 88 26 78 C 24 66 36 54 50 54 Z" fill="#d9b48f" />
    <ellipse cx="24" cy="44" rx="9" ry="11" fill="#d9b48f" transform="rotate(-20 24 44)" />
    <ellipse cx="40" cy="28" rx="9" ry="12" fill="#d9b48f" transform="rotate(-6 40 28)" />
    <ellipse cx="60" cy="28" rx="9" ry="12" fill="#d9b48f" transform="rotate(6 60 28)" />
    <ellipse cx="76" cy="44" rx="9" ry="11" fill="#d9b48f" transform="rotate(20 76 44)" />
  </>) },
  sparkle: { label: 'Sparkles', Svg: svg(<>
    <path d="M42 14 C 44 34 50 40 70 42 C 50 44 44 50 42 72 C 40 50 34 44 14 42 C 34 40 40 34 42 14 Z" fill="#f7d26a" />
    <path d="M76 56 C 77 66 80 69 90 70 C 80 71 77 74 76 84 C 75 74 72 71 62 70 C 72 69 75 66 76 56 Z" fill="#fbe5a0" />
    <path d="M76 12 C 77 18 78 19 84 20 C 78 21 77 22 76 28 C 75 22 74 21 68 20 C 74 19 75 18 76 12 Z" fill="#fbe5a0" strokeWidth={2.5} />
  </>) },
  octopus: { label: 'Octopus', Svg: octopus('#f4a6b8') },
  'octopus-blue': { label: 'Little octopus', Svg: octopus('#9fc9e8') },
  squid: { label: 'Squid', Svg: svg(<>
    {['M40 60 q-5 16 -12 26', 'M46 61 q-2 18 -5 30', 'M54 61 q2 18 5 30', 'M60 60 q5 16 12 26'].map((d) => (
      <g key={d}><path d={d} strokeWidth={8} /><path d={d} stroke="#f7c59f" strokeWidth={3.5} /></g>
    ))}
    <path d="M38 24 L22 36 L38 42 Z M62 24 L78 36 L62 42 Z" fill="#f7c59f" />
    <path d="M50 6 C 66 20 68 42 63 62 H37 C 32 42 34 20 50 6 Z" fill="#f7c59f" />
    {face(50, 44, 8)}
    {hi('M42 18 q3-6 8-8')}
  </>) },
  bubbles: { label: 'Bubbles', Svg: svg(<>
    <circle cx="40" cy="58" r="24" fill="#d6eef8" />
    <circle cx="72" cy="30" r="14" fill="#d6eef8" />
    <circle cx="76" cy="70" r="9" fill="#d6eef8" />
    <circle cx="26" cy="20" r="7" fill="#d6eef8" />
    {hi('M26 52 q3-10 12-13')}{hi('M65 27 q2-5 6-6')}
  </>) },
  seaweed: { label: 'Seaweed', Svg: svg(<>
    <path d="M36 92 C 26 76 42 66 32 52 C 24 40 38 30 32 12 C 46 24 40 38 46 50 C 54 64 40 74 48 92 Z" fill="#7fbf8e" />
    <path d="M56 92 C 62 80 52 70 60 58 C 66 48 58 40 66 28 C 74 40 68 50 70 60 C 72 72 64 80 70 92 Z" fill="#9fd3a8" />
  </>) },
  shell: { label: 'Seashell', Svg: svg(<>
    <path d="M50 86 L16 46 C 16 18 84 18 84 46 Z" fill="#f7d9c4" />
    <path d="M50 86 L30 26 M50 86 L50 20 M50 86 L70 26 M50 86 L20 40 M50 86 L80 40" strokeWidth={2.5} />
    <path d="M40 86 H60 L56 92 H44 Z" fill="#f2c4a8" />
  </>) },
  starfish: { label: 'Starfish', Svg: svg(<>
    <path d="M50 8 C 55 26 58 32 76 32 C 92 33 92 38 80 46 C 66 56 66 62 72 80 C 76 94 70 94 58 84 C 50 77 50 77 42 84 C 30 94 24 94 28 80 C 34 62 34 56 20 46 C 8 38 8 33 24 32 C 42 32 45 26 50 8 Z" fill="#f6a96b" />
    {[[50, 24], [70, 40], [62, 70], [38, 70], [30, 40]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.2} fill="#fbe0c8" stroke="none" />)}
    {face(50, 48, 7)}
  </>) },
  fish: { label: 'Fish', Svg: svg(<>
    <path d="M70 50 L92 32 C 90 44 90 56 92 68 Z" fill="#f7d26a" />
    <path d="M10 50 C 22 24 58 22 72 50 C 58 78 22 76 10 50 Z" fill="#8fc7e8" />
    <path d="M38 34 q8 16 0 32" stroke="#6aa9d0" strokeWidth={3} />
    <circle cx="24" cy="46" r="3.5" fill={INK} stroke="none" />
    <path d="M14 56 q4 2 7 0" strokeWidth={2.5} />
    {hi('M26 32 q8-6 18-5')}
  </>) },
  anchor: { label: 'Anchor', Svg: svg(<>
    <circle cx="50" cy="16" r="8" fill="#fffaf0" />
    <path d="M50 24 V84 M34 38 H66" strokeWidth={6} />
    <path d="M18 60 C 20 78 34 86 50 86 C 66 86 80 78 82 60" strokeWidth={6} />
    <path d="M12 64 L18 56 L26 64 M88 64 L82 56 L74 64" strokeWidth={5} />
    <path d="M50 24 V84 M34 38 H66 M18 60 C 20 78 34 86 50 86 C 66 86 80 78 82 60" stroke="#7fa7c8" strokeWidth={2.5} />
  </>) },
  infinity: { label: 'Infinity heart', Svg: svg(<>
    <path d="M50 50 C 38 22 4 22 4 50 C 4 78 38 78 50 50 C 62 22 96 22 96 50 C 96 78 62 78 50 50 Z" fill="#f4a6b8" strokeWidth={4} />
    <path d="M50 43 C 45 34 35 34 35 44 C 35 52 44 58 50 63 C 56 58 65 52 65 44 C 65 34 55 34 50 43 Z" fill="#e8737a" strokeWidth={2.5} />
    {hi('M12 40 q5-9 15-9')}
  </>) },
  'energy-can': { label: 'Energy drink', Svg: svg(<>
    <path d="M32 18 H68 L70 26 V84 Q70 90 64 90 H36 Q30 90 30 84 V26 Z" fill="#9fd3c7" />
    <path d="M32 18 Q32 12 38 12 H62 Q68 12 68 18 Z" fill="#d9d9d9" />
    <path d="M54 32 L40 56 H50 L44 76 L62 48 H52 L58 32 Z" fill="#f7d26a" strokeWidth={2.5} />
    {hi('M36 30 V70')}
  </>) },
  onigiri: { label: 'Rice ball', Svg: svg(<>
    <path d="M50 12 C 60 12 88 62 86 76 C 84 88 16 88 14 76 C 12 62 40 12 50 12 Z" fill="#fffaf0" />
    <path d="M30 62 H70 V86 H30 Z" fill="#3f5b4a" />
    {face(50, 46, 9)}
  </>) },
  sushi: { label: 'Sushi', Svg: svg(<>
    <path d="M14 60 C 14 46 86 46 86 60 V70 C 86 80 14 80 14 70 Z" fill="#fffaf0" />
    <path d="M10 52 C 20 30 80 30 90 52 C 80 58 20 58 10 52 Z" fill="#f6a96b" />
    <path d="M30 40 l8 10 M48 36 l8 12 M66 38 l8 10" stroke="#fbe0c8" strokeWidth={3} />
    <path d="M44 48 H56 V78 H44 Z" fill="#3f5b4a" strokeWidth={2.5} />
  </>) },
  ring: { label: 'Ring', Svg: svg(<>
    <circle cx="50" cy="62" r="26" fill="none" stroke="#e6c06a" strokeWidth={9} />
    <circle cx="50" cy="62" r="26" fill="none" strokeWidth={2} />
    <path d="M38 30 L44 18 H56 L62 30 L50 42 Z" fill="#cfeaf6" />
    {hi('M44 22 l-3 6')}
  </>) },
  bubble: { label: 'Speech bubble', Svg: svg(<>
    <path d="M14 22 H86 Q92 22 92 28 V62 Q92 68 86 68 H40 L24 84 L28 68 H14 Q8 68 8 62 V28 Q8 22 14 22 Z" fill="#fffaf0" />
    <path d="M50 58 C 38 50 34 42 40 37 C 44 34 49 37 50 40 C 51 37 56 34 60 37 C 66 42 62 50 50 58 Z" fill="#f29b9b" strokeWidth={2.5} />
  </>) },
};
