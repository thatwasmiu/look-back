import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { FrameEl, MediaDTO, PageLayout } from '@scrapbook/shared';
import { useT } from '../i18n';
import { mediaUrl } from '../mediaUrl';
import { PageRenderer } from '../render/PageRenderer';
import { VideoPlayer } from '../render/VideoPlayer';
import { SphereView } from '../render/SphereView';

// A space album in the viewer: its one page is a long wall (scrolled down), a strip (scrolled sideways) or a free
// board (panned any way, zoomed 1–4×: pinch, Ctrl + wheel, double-tap, the + / − buttons; it opens whole on screen).
// Tapping a photo opens it big in the photo viewer, where you swipe through all the space's photos in reading order.
const MAX_ZOOM = 4;
export function SpaceView({ layout, media }: { layout: PageLayout; media: Map<string, MediaDTO> }) {
  const t = useT();
  const shape = layout.space?.shape ?? 'vertical';
  const free = shape === 'free';
  const shots = useMemo(() => spaceShots(layout, media), [layout, media]);
  const [open, setOpen] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  // Zoom keeping the board point under (cx, cy) — the fingers, the pointer, the screen's centre — where it is.
  const zoomTo = (z: number, cx?: number, cy?: number) => {
    const st = stage.current;
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    if (!st || Math.abs(next - zoomRef.current) < 0.001) return;
    const r = st.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top;
    const fx = (st.scrollLeft + px) / zoomRef.current, fy = (st.scrollTop + py) / zoomRef.current;
    zoomRef.current = next;
    flushSync(() => setZoomState(next));
    st.scrollLeft = fx * next - px;
    st.scrollTop = fy * next - py;
  };
  useEffect(() => {
    const st = stage.current;
    if (!free || !st) return;
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY); };
    let pinch: { d: number; z: number } | null = null;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const tstart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = { d: dist(e), z: zoomRef.current }; };
    const tmove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault(); // two fingers zoom the board, not the page
      zoomTo(pinch.z * dist(e) / pinch.d, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    };
    const tend = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    st.addEventListener('wheel', wheel, { passive: false });
    st.addEventListener('touchstart', tstart, { passive: true });
    st.addEventListener('touchmove', tmove, { passive: false });
    st.addEventListener('touchend', tend);
    return () => {
      st.removeEventListener('wheel', wheel);
      st.removeEventListener('touchstart', tstart);
      st.removeEventListener('touchmove', tmove);
      st.removeEventListener('touchend', tend);
    };
  }, [free]);
  if (shape === 'sphere') return ( // the globe: drag to turn, tap a photo for the photo viewer
    <div className="stage space-stage space-sphere">
      <SphereView photos={shots.map((s) => s.media)} onOpen={setOpen} size={layout.space?.radius} />
      {open !== null && createPortal(<PhotoViewer shots={shots} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
  return (
    <div ref={stage} className={`stage space-stage space-${shape}`} style={free ? { '--z': zoom } as CSSProperties : undefined}
      onDoubleClick={(e) => { if (free) zoomTo(zoomRef.current > 1.5 ? 1 : 2.5, e.clientX, e.clientY); }}
      onClick={(e) => {
        const id = (e.target as Element).closest('[data-el]')?.getAttribute('data-el');
        const i = shots.findIndex((s) => s.frame.id === id);
        if (i >= 0) setOpen(i);
      }}>
      {/* The board carries the space's proportions itself: a strip is as tall as the stage and as wide as that makes it
          (a page sized from its height alone left the scroll area too short). */}
      <div className="space-board" style={layout.space ? { aspectRatio: `${3 * layout.space.cols} / ${4 * layout.space.rows}` } : undefined}>
        <PageRenderer layout={layout} media={media} mode="view" active={open === null} />
      </div>
      {/* On the body: the scrolling stage is its own layer, which a fixed overlay inside it couldn't rise above. */}
      {open !== null && createPortal(<PhotoViewer shots={shots} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />, document.body)}
      {free && open === null && createPortal(
        <div className="space-zoom">
          <button type="button" aria-label={t('Zoom out')} disabled={zoom <= 1} onClick={() => zoomTo(zoom / 1.5)}>−</button>
          <button type="button" aria-label={t('Zoom in')} disabled={zoom >= MAX_ZOOM} onClick={() => zoomTo(zoom * 1.5)}>＋</button>
        </div>, document.body)}
    </div>
  );
}

type Shot = { frame: FrameEl; media: MediaDTO };
// The space's photos in reading order: rows top to bottom on a wall, columns left to right on a strip (a frame's
// position rounded to a tenth of a tile, so a slightly tilted row still reads as one).
export function spaceShots(layout: PageLayout, media: Map<string, MediaDTO>): Shot[] {
  const across = layout.space?.shape === 'horizontal';
  const globe = layout.space?.shape === 'sphere'; // a globe keeps its frames' order
  const r = (v: number) => Math.round(v * 10);
  const all = layout.elements
    .flatMap((e) => {
      const m = e.type === 'frame' && e.mediaId ? media.get(e.mediaId) : undefined;
      return e.type === 'frame' && m && m.status === 'ready' ? [{ frame: e, media: m }] : [];
    })
  return globe ? all : all.sort((a, b) => (across
    ? r(a.frame.x) - r(b.frame.x) || a.frame.y - b.frame.y
    : r(a.frame.y) - r(b.frame.y) || a.frame.x - b.frame.x));
}

// Full screen, one photo or video at a time: ← / → (keys, buttons, a swipe), × / Esc / a swipe down to close.
export function PhotoViewer({ shots, index, onIndex, onClose }: { shots: Shot[]; index: number; onIndex(i: number): void; onClose(): void }) {
  const t = useT();
  const go = (d: number) => onIndex(Math.min(shots.length - 1, Math.max(0, index + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const start = useRef<{ x: number; y: number } | null>(null);
  const up = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 80) onClose();
  };
  const { media } = shots[index];
  const v = media.variants;
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={t('Photo {n} of {total}', { n: index + 1, total: shots.length })}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={up}>
      {media.kind === 'video'
        ? <div className="photo-viewer-video"><VideoPlayer key={media.id} media={media} active /></div>
        : v?.display && <img key={media.id} src={mediaUrl(v.display)} alt="" draggable={false} />}
      <span className="photo-viewer-count">{index + 1} / {shots.length}</span>
      <button type="button" className="photo-viewer-close" aria-label={t('Close')} onClick={onClose}>×</button>
      <button type="button" className="photo-viewer-nav prev" aria-label={t('Previous photo')} disabled={index === 0} onClick={() => go(-1)}>‹</button>
      <button type="button" className="photo-viewer-nav next" aria-label={t('Next photo')} disabled={index === shots.length - 1} onClick={() => go(1)}>›</button>
    </div>
  );
}
