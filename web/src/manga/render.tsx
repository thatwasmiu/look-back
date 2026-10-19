// Manga mode visuals: panels (frames with frameStyle 'panel'), bubbles / narration / sound effects (text with a
// textStyle). Everything is drawn with plain CSS shapes — generic manga conventions, nothing from a real manga.
import type { CSSProperties, ReactNode } from 'react';
import type { FrameEl, TextEl } from '@scrapbook/shared';
import { textCss } from '../render/textStyle';
import './manga.css';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const polygon = (shape: [number, number][]) => `polygon(${shape.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(', ')})`;

// A panel: black border (outer box, clipped to the shape) around the photo window (clipped to the same shape, so a
// slanted panel's photo stays inside it even while cropping a rotated panel).
export function PanelFrame({ el, children }: { el: FrameEl; children: ReactNode }) {
  const clip = el.shape ? polygon(el.shape) : undefined;
  return (
    <div className={`frame frame-panel panel-border-${el.border ?? 'normal'}`} data-frame-id={el.id} style={clip ? { clipPath: clip } : undefined}>
      <div className={`frame-window${el.ink ? ' ink' : ''}`} style={clip ? { clipPath: clip } : undefined}>
        {children}
        {el.tone && <div className="tone" aria-hidden />}
      </div>
    </div>
  );
}

export const isMangaText = (el: TextEl) => !!el.textStyle && el.textStyle !== 'plain';

export function MangaText({ el }: { el: TextEl }) {
  const style: CSSProperties = textCss(el);
  const s = el.textStyle!;
  if (s === 'shout') {
    // Spiky burst: black burst behind a slightly smaller white one = an outline that follows the spikes.
    return <div className={`manga-text manga-shout tail-${el.tail ?? 'none'}`} style={style}><span className="burst-ink" /><span className="burst-paper" /><span className="manga-words">{el.text}</span></div>;
  }
  return <div className={`manga-text manga-${s} tail-${el.tail ?? (s === 'narration' || s === 'sfx' ? 'none' : 'bl')}`} style={style}><span className="manga-words">{el.text}</span></div>;
}
