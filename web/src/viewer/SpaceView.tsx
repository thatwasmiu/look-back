import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { FrameEl, MediaDTO, PageLayout } from '@scrapbook/shared';
import { useT } from '../i18n';
import { mediaUrl } from '../mediaUrl';
import { PageRenderer } from '../render/PageRenderer';
import { VideoPlayer } from '../render/VideoPlayer';

// A space album in the viewer: its one page is a long wall (scrolled down) or strip (scrolled sideways). Tapping a
// photo opens it big in the photo viewer, where you swipe through all the space's photos in reading order.
export function SpaceView({ layout, media }: { layout: PageLayout; media: Map<string, MediaDTO> }) {
  const shape = layout.space?.shape ?? 'vertical';
  const shots = useMemo(() => spaceShots(layout, media), [layout, media]);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className={`stage space-stage space-${shape}`}
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
    </div>
  );
}

type Shot = { frame: FrameEl; media: MediaDTO };
// The space's photos in reading order: rows top to bottom on a wall, columns left to right on a strip (a frame's
// position rounded to a tenth of a tile, so a slightly tilted row still reads as one).
export function spaceShots(layout: PageLayout, media: Map<string, MediaDTO>): Shot[] {
  const across = layout.space?.shape === 'horizontal';
  const r = (v: number) => Math.round(v * 10);
  return layout.elements
    .flatMap((e) => {
      const m = e.type === 'frame' && e.mediaId ? media.get(e.mediaId) : undefined;
      return e.type === 'frame' && m && m.status === 'ready' ? [{ frame: e, media: m }] : [];
    })
    .sort((a, b) => (across
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
