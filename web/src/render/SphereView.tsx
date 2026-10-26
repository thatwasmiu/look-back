import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MediaDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';
import { cardSize, spherePoints } from './sphere';

// A globe of photos in 3D (CSS transforms): drag to turn it (it keeps going a little, then drifts slowly on its own —
// not with reduced motion), tap a photo to open it. The globe is drawn with small images; the viewer opens the big one.
// interactive=false: a still globe (album card, editor preview without gestures).
const SPIN = 0.08; // degrees per frame when left alone
export function SphereView({ photos, onOpen, interactive = true }: { photos: MediaDTO[]; onOpen?(i: number): void; interactive?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const globe = useRef<HTMLDivElement>(null);
  const [r, setR] = useState(120);
  const rot = useRef({ x: -12, y: 0, vx: 0, vy: 0, drag: null as null | { x: number; y: number; moved: number; id: number } });

  useEffect(() => { // the globe's radius follows the space it has
    const el = box.current;
    if (!el) return;
    const fit = () => setR(Math.max(60, Math.min(el.clientWidth, el.clientHeight) * 0.34));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { // turning: straight on the element each frame, no re-render
    const still = !interactive || matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const step = () => {
      const s = rot.current;
      if (!s.drag) {
        s.y += s.vy; s.x = Math.max(-70, Math.min(70, s.x + s.vx));
        s.vx *= 0.94; s.vy *= 0.94;
        if (!still && Math.abs(s.vy) < 0.05) s.y += SPIN;
      }
      if (globe.current) globe.current.style.transform = `translateZ(${-r}px) rotateX(${s.x}deg) rotateY(${s.y}deg)`;
      raf = requestAnimationFrame(step);
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame?.(raf);
  }, [r, interactive]);

  const pts = spherePoints(photos.length);
  const side = cardSize(photos.length, r);
  const src = (m: MediaDTO) => {
    const v = m.variants;
    const key = m.kind === 'video' ? v?.poster : v?.thumb ?? v?.display;
    return key ? mediaUrl(key) : '';
  };
  return (
    <div ref={box} className={`sphere-view${interactive ? ' live' : ''}`}
      onPointerDown={interactive ? (e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        rot.current.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
        rot.current.vx = rot.current.vy = 0;
      } : undefined}
      onPointerMove={interactive ? (e) => {
        const d = rot.current.drag;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
        const s = rot.current;
        s.y += dx * 0.3; s.x = Math.max(-70, Math.min(70, s.x - dy * 0.3));
        s.vy = dx * 0.3; s.vx = -dy * 0.3;
      } : undefined}
      onPointerUp={interactive ? (e) => {
        const d = rot.current.drag;
        rot.current.drag = null;
        if (d && d.moved < 8) { // a tap, not a turn
          const i = (document.elementFromPoint?.(e.clientX, e.clientY) as Element | null)?.closest('[data-i]')?.getAttribute('data-i');
          if (i != null) onOpen?.(Number(i));
        }
      } : undefined}
      onPointerCancel={() => { rot.current.drag = null; }}>
      <div ref={globe} className="sphere-globe" style={{ transform: `translateZ(${-r}px) rotateX(-12deg)` }}>
        {photos.map((m, i) => (
          <button key={m.id} type="button" className="sphere-card" data-i={i} tabIndex={interactive ? 0 : -1}
            aria-label={`${i + 1} / ${photos.length}`}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(i); }}
            style={{
              width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2,
              transform: `rotateY(${pts[i].lon}rad) rotateX(${pts[i].lat}rad) translateZ(${r}px)`,
            } as CSSProperties}>
            <img src={src(m)} alt="" draggable={false} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
