import type { CSSProperties } from 'react';
import type { BackgroundEffect, EffectEl } from '@scrapbook/shared';
import './effects.css';

// Particles are plain <i> elements animated with CSS (transform/opacity only). Positions, sizes, delays come from
// a seeded generator so every render — editor, viewer, thumbnails — shows the same particles.
type P = { x: number; y: number; s: number; d: number; t: number; h: number };
function particles(seed: number, n: number): P[] {
  let v = seed;
  const r = () => ((v = (v * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), s: r(), d: r(), t: r(), h: r() }));
}
const vars = (p: P): CSSProperties =>
  ({ '--x': p.x.toFixed(3), '--y': p.y.toFixed(3), '--s': p.s.toFixed(3), '--d': p.d.toFixed(3), '--t': p.t.toFixed(3), '--h': p.h.toFixed(3) }) as CSSProperties;

const PAGE_COUNT: Record<EffectEl['effect'], number> = { sparkles: 16, hearts: 10, petals: 12, confetti: 22, bokeh: 10, 'light-leak': 0 };

// On the page: plays inside the element's own box.
export function EffectView({ effect }: { effect: EffectEl['effect'] }) {
  return (
    <div className={`fx fx-${effect}`} aria-hidden>
      {particles(effect.length * 7919, PAGE_COUNT[effect]).map((p, i) => <i key={i} style={vars(p)} />)}
    </div>
  );
}

const BG_COUNT: Record<Exclude<BackgroundEffect, 'none'>, number> = { snow: 40, petals: 18, fireflies: 22, stars: 50, rain: 36 };

// Behind the whole book (viewer and editor desk). Never takes pointer events.
export function BackgroundEffectView({ kind }: { kind: BackgroundEffect }) {
  if (kind === 'none') return null;
  return (
    <div className={`bgfx bgfx-${kind}`} aria-hidden>
      {particles(kind.length * 104729, BG_COUNT[kind]).map((p, i) => <i key={i} style={vars(p)} />)}
    </div>
  );
}

export const pageEffectLabels: Record<EffectEl['effect'], string> = {
  sparkles: 'Sparkles', hearts: 'Floating hearts', petals: 'Falling petals', confetti: 'Confetti', bokeh: 'Bokeh lights', 'light-leak': 'Light leak',
};
export const backgroundEffectLabels: Record<BackgroundEffect, string> = {
  none: 'No effect', snow: 'Snow', petals: 'Petals', fireflies: 'Fireflies', stars: 'Starry night', rain: 'Rain',
};
