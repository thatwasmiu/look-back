import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MediaDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';
import { ACCEPT, type UploadItem } from './useUpload';

type Props = {
  media: MediaDTO[]; items: UploadItem[]; coverMediaId: string | null;
  onUpload(files: File[]): void; onRetry(localId: string): void;
  onPick(mediaId: string): void; // tap/click: put it in the selected frame
  onDrop(mediaId: string, frameId: string): void; // dragged onto a frame
  onDelete(mediaId: string): void; onSetCover(mediaId: string): void;
};

const chip: Partial<Record<MediaDTO['status'], string>> = { uploading: 'đang tải…', processing: 'đang xử lý…', failed: 'tải lên lỗi' };
export const thumbOf = (m: MediaDTO) => (m.status === 'ready' && (m.variants?.thumb ?? m.variants?.poster)) || null;

// Frame under the pointer on the editing page (not the page-strip thumbnails), or null.
const frameAt = (x: number, y: number) =>
  document.elementsFromPoint(x, y).find((n) => n.matches('.edit-page [data-frame-id]')) as HTMLElement | undefined ?? null;

// Laptop: side panel. Phone: a tab above the bottom toolbar that opens a horizontal strip (see CSS).
export function MediaTray({ media, items, coverMediaId, onUpload, onRetry, onPick, onDrop, onDelete, onSetCover }: Props) {
  const [open, setOpen] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number; m: MediaDTO } | null>(null);
  const dragged = useRef(false); // swallow the click that ends a drag
  const pending = items.filter((i) => i.state !== 'done' || i.notice);

  // Pointer-based drag (mouse and touch). A move of > 8px turns the press into a drag; the frame under the
  // pointer gets .drop-target. touch-action on the item (CSS) leaves the tray's own scroll axis to the browser.
  const startDrag = (e: ReactPointerEvent, m: MediaDTO) => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let over: HTMLElement | null = null;
    let dragging = false;
    dragged.current = false;
    const hover = (n: HTMLElement | null) => {
      if (n === over) return;
      over?.classList.remove('drop-target');
      n?.classList.add('drop-target');
      over = n;
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
      dragging = dragged.current = true;
      setGhost({ x: ev.clientX, y: ev.clientY, m });
      hover(frameAt(ev.clientX, ev.clientY));
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const id = ev.type === 'pointerup' ? over?.dataset.frameId : undefined;
      hover(null);
      setGhost(null);
      if (id) onDrop(m.id, id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const ghostSrc = ghost && thumbOf(ghost.m);
  return (
    <aside className={`tray${open ? ' open' : ''}`} aria-label="Album media"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) onUpload([...e.dataTransfer.files]); }}>
      <div className="tray-head">
        <button type="button" className="tray-tab" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Photos ({media.length})</button>
        <label className="tray-upload">
          Upload
          <input type="file" multiple accept={ACCEPT} hidden
            onChange={(e) => { onUpload([...e.target.files ?? []]); e.target.value = ''; }} />
        </label>
      </div>
      <ul className="tray-list">
        {pending.map((u) => (
          <li key={u.localId} className="tray-item tray-upload-item">
            <span className="tray-name" title={u.name}>{u.name}</span>
            {u.state === 'error'
              ? <><span className="tray-error" role="alert">{u.error}</span>
                {u.retryable !== false && <button type="button" onClick={() => onRetry(u.localId)}>Retry</button>}</>
              : <progress value={u.progress} max={1} aria-label={`Uploading ${u.name}`} />}
            {u.notice && <span className="tray-notice">{u.notice}</span>}
          </li>
        ))}
        {media.map((m) => {
          const src = thumbOf(m);
          return (
            <li key={m.id} className="tray-item">
              <button type="button" className="tray-thumb" aria-label={`${m.kind} ${m.id.slice(0, 8)}, ${chip[m.status] ?? 'ready'}`}
                style={!src && m.blurDataUrl ? { backgroundImage: `url("${m.blurDataUrl}")` } : undefined}
                onPointerDown={(e) => startDrag(e, m)}
                onClick={() => { if (!dragged.current) onPick(m.id); }}>
                {src && <img src={mediaUrl(src)} alt="" draggable={false} />}
                {m.kind === 'video' && <span className="tray-video" aria-hidden>▶</span>}
                {chip[m.status] && <span className={m.status === 'failed' ? 'chip chip-error' : 'chip'}>{chip[m.status]}</span>}
                {m.id === coverMediaId && <span className="tray-cover">cover</span>}
              </button>
              <div className="tray-actions">
                <button type="button" title="Set as album cover" aria-label="Set as album cover" disabled={m.id === coverMediaId}
                  onClick={() => onSetCover(m.id)}>★</button>
                <button type="button" title="Delete from album" aria-label="Delete from album"
                  onClick={() => window.confirm('Xóa ảnh/video này khỏi album? Nó sẽ bị gỡ khỏi mọi trang.') && onDelete(m.id)}>🗑</button>
              </div>
            </li>
          );
        })}
      </ul>
      {ghost && (
        <div className="tray-ghost" style={{ left: ghost.x, top: ghost.y, backgroundImage: ghost.m.blurDataUrl ? `url("${ghost.m.blurDataUrl}")` : undefined }}>
          {ghostSrc && <img src={mediaUrl(ghostSrc)} alt="" />}
        </div>
      )}
    </aside>
  );
}
