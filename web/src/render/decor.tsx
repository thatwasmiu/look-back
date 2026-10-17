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
};
