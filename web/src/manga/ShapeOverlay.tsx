// Shape mode for a manga panel: drag (or arrow-key) each corner on its own to make any four-sided panel.
// Points are relative to the panel's box (0..1); the overlay sits inside the rotated element, so drags are
// turned back by the element's rotation before they become box units.
import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { FrameEl } from '@scrapbook/shared';
import { useT } from '../i18n';

export type Shape = [number, number][];
export const SQUARE: Shape = [[0, 0], [1, 0], [1, 1], [0, 1]];
const STEP = 0.02;
const clamp01 = (v: number) => Math.min(1, Math.max(0, Math.round(v * 1000) / 1000));
const KEYS: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };

export function ShapeOverlay({ el, onChange, onDone }: { el: FrameEl; onChange(s: Shape): void; onDone(): void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const shape: Shape = el.shape ?? SQUARE;
  const drag = useRef<{ i: number; x: number; y: number; from: [number, number] } | null>(null);
  const move = (i: number, p: [number, number]) => onChange(shape.map((q, j) => (j === i ? [clamp01(p[0]), clamp01(p[1])] : q)) as Shape);

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current, box = ref.current;
    if (!d || !box || !box.offsetWidth || !box.offsetHeight) return;
    const a = (-el.rotation * Math.PI) / 180, sx = e.clientX - d.x, sy = e.clientY - d.y;
    move(d.i, [d.from[0] + (sx * Math.cos(a) - sy * Math.sin(a)) / box.offsetWidth, d.from[1] + (sx * Math.sin(a) + sy * Math.cos(a)) / box.offsetHeight]);
  };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onDone(); return; }
    const d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation(); // the editor's arrow keys would move the whole panel
    move(i, [shape[i][0] + d[0], shape[i][1] + d[1]]);
  };
  const end = () => { drag.current = null; };

  return (
    <div className="shape-overlay" ref={ref} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}>
      <svg className="shape-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon points={shape.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} />
      </svg>
      {shape.map(([x, y], i) => (
        <button key={i} type="button" className="shape-handle" aria-label={t('Corner {n}', { n: i + 1 })} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          onKeyDown={onKey(i)}
          onPointerDown={(e) => {
            e.stopPropagation();
            drag.current = { i, x: e.clientX, y: e.clientY, from: shape[i] };
            // Capture keeps the drag going outside the panel; a browser may refuse it (InvalidPointerId) — the drag
            // still works over the overlay, so never let that stop it.
            try { ref.current?.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
          }} />
      ))}
      <div className="crop-actions" style={{ rotate: `${-el.rotation}deg` }}>
        <button type="button" onClick={() => onChange(SQUARE)}>{t('Reset')}</button>
        <button type="button" className="crop-done" onClick={onDone}>{t('Done')}</button>
      </div>
    </div>
  );
}
