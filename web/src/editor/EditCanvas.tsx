import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';
import type { FrameEl, MediaDTO, PageElement, PageLayout, TextEl } from '@scrapbook/shared';
import { PageRenderer } from '../render/PageRenderer';
import { ShapeOverlay, type Shape } from '../manga/ShapeOverlay';
import { textCss } from '../render/textStyle';
import { assignMedia, updateElement } from './layoutOps';
import { useT } from '../i18n';

type Props = {
  layout: PageLayout; media: Map<string, MediaDTO>;
  selectedId: string | null; onSelect(id: string | null): void;
  onCommit(l: PageLayout): void; // one history entry
  onFrameAddMedia?(frameId: string): void; // empty frame tapped: media tray/upload hooks in here
  cropId?: string | null; onCrop?(frameId: string | null): void; // frame in crop mode (pan/zoom the photo inside it)
  shapeId?: string | null; onShape?(frameId: string | null): void; // manga panel in shape mode (move its corners)
  zoom?: number; // 1 = page fits the stage
  snap?: boolean; // snap to the page's edges/centre and other items while dragging or resizing
  lockFrames?: boolean; // edit-link guest: frames/panels don't move, resize or rotate (they act pinned)
};
type Crop = FrameEl['crop'];
const SNAP_DIRS = { left: true, right: true, top: true, bottom: true, center: true, middle: true };

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Selected element gets react-moveable handles. During a gesture only a transient layout changes (live preview);
// the gesture end commits it once. Moveable reports CSS px relative to the page box; page units = px / box size.
export function EditCanvas({ layout, media, selectedId, onSelect, onCommit, onFrameAddMedia, cropId = null, onCrop, shapeId = null, onShape, zoom = 1, snap = false, lockFrames = false }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [live, setLive] = useState<PageLayout | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const start = useRef<PageElement | null>(null);
  const liveRef = useRef<PageLayout | null>(null); // gesture-end handler must not read a stale closure
  // Crop / shape-mode previews, committed once — on Done, or however the mode ends (a tap on the desk, another
  // tool…): the pending change is kept in a ref by the handlers, and whatever closes the mode commits it.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [cropLive, setCropLive] = useState<Crop | null>(null);
  const pendingCrop = useRef<{ id: string; crop: Crop } | null>(null);
  const setCrop = (c: Crop) => { pendingCrop.current = cropId ? { id: cropId, crop: c } : null; setCropLive(c); };
  useEffect(() => {
    const p = pendingCrop.current;
    if (p && p.id !== cropId) { pendingCrop.current = null; onCommit(updateElement(layoutRef.current, p.id, { crop: p.crop })); }
    setCropLive(null);
  }, [cropId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shapeLive, setShapeLive] = useState<Shape | null>(null);
  const pendingShape = useRef<{ id: string; shape: Shape } | null>(null);
  const setShape = (s: Shape) => { pendingShape.current = shapeId ? { id: shapeId, shape: s } : null; setShapeLive(s); };
  useEffect(() => {
    const p = pendingShape.current;
    if (p && p.id !== shapeId) { pendingShape.current = null; onCommit(updateElement(layoutRef.current, p.id, { shape: p.shape })); }
    setShapeLive(null);
  }, [shapeId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The page box resizes with the stage (window, phone tray opening): keep the handles on the element.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return; // jsdom
    const ro = new ResizeObserver(() => moveableRef.current?.updateRect());
    ro.observe(pageRef.current!);
    return () => ro.disconnect();
  }, []);
  const base = cropId && cropLive ? updateElement(live ?? layout, cropId, { crop: cropLive }) : live ?? layout;
  const shown = shapeId && shapeLive ? updateElement(base, shapeId, { shape: shapeLive }) : base;
  const finishShape = () => {
    pendingShape.current = null;
    if (shapeId && shapeLive) onCommit(updateElement(layout, shapeId, { shape: shapeLive }));
    onShape?.(null);
  };
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  const pinned = !!selected?.pinned || (lockFrames && selected?.type === 'frame');
  const finishCrop = () => {
    pendingCrop.current = null;
    if (cropId && cropLive) onCommit(updateElement(layout, cropId, { crop: cropLive }));
    onCrop?.(null);
  };
  const target = selected && editingId !== selected.id && cropId !== selected.id && shapeId !== selected.id
    ? [...pageRef.current?.querySelectorAll<HTMLElement>('[data-el]') ?? []].find((n) => n.dataset.el === selected.id) ?? null : null;

  // Snap targets: the page itself (edges and centre lines), frames/panels and text. Stickers, tape and effect
  // layers are left out: there are many of them and they'd make dragging sticky. Dragging only (resize and pinch
  // stay free), with a small threshold so placing anywhere stays easy.
  const guides = snap && target ? [
    pageRef.current!.querySelector<HTMLElement>('.page')!,
    ...[...pageRef.current!.querySelectorAll<HTMLElement>('.el-frame, .el-text')].filter((n) => n !== target),
  ] : [];
  const size = () => {
    const r = pageRef.current!.querySelector('.page')!.getBoundingClientRect();
    return { W: r.width, H: r.height };
  };
  const begin = () => { start.current = selected; };
  // flushSync: Moveable re-measures the target right after each event, so the DOM must already be updated.
  const preview = (patch: Partial<PageElement>) => {
    if (!start.current) return;
    // Patch over the live layout: a pinch fires resize and rotate events in the same gesture.
    const next = updateElement(liveRef.current ?? layout, start.current.id, patch);
    liveRef.current = next;
    flushSync(() => setLive(next));
  };
  // An item only moves while the mouse button is held. A move that arrives with no button down (a release the
  // drag never saw: double-clicks, file dialogs, letting go outside the window) ends the drag right there, keeping
  // where it was while the button was held — nothing sticks to the mouse. Touch events carry no `buttons`.
  const released = (e: { inputEvent?: { buttons?: number }; stopDrag?: () => void }) => {
    if (e.inputEvent?.buttons !== 0) return false;
    const held = liveRef.current;
    liveRef.current = null;
    start.current = null;
    setLive(null);
    if (held) onCommit(held);
    e.stopDrag?.();
    return true;
  };
  const end = () => {
    if (liveRef.current) onCommit(liveRef.current);
    liveRef.current = null;
    setLive(null);
    start.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('.moveable-control-box, [contenteditable], .crop-overlay')) return;
    if (cropId) finishCrop();
    const id = (e.target as Element).closest('[data-el]')?.getAttribute('data-el') ?? null;
    if (id !== editingId) {
      // Save what was typed first: closing the editor unmounts it, and its own blur would then never reach React.
      if (editingId) (document.activeElement as HTMLElement | null)?.blur?.();
      setEditingId(null);
    }
    // "+ add" of an empty frame: one tap opens the picker (no select-then-tap-again) — also when something else
    // lies over the button: an effect layer, a neighbour's bubble or sticker, an overlapping frame. Only the
    // selected item keeps its taps (it is being moved). Opened after the tap ends (a short tap, still on the
    // button) so the file dialog can't strand a gesture.
    const add = (e.target as Element).closest('.slot-empty')
      ?? (id !== selectedId ? document.elementsFromPoint?.(e.clientX, e.clientY).find((n) => n.closest('.slot-empty'))?.closest('.slot-empty') : undefined);
    const frameId = add?.closest('[data-el]')?.getAttribute('data-el');
    // A selected, unpinned frame's tap comes through Moveable's click instead; a pinned one has no Moveable gesture
    // (dragging is off), so its tap is handled here like an unselected frame's.
    const pinnedFrame = lockFrames || !!layout.elements.find((x) => x.id === frameId)?.pinned;
    if (add && frameId && (frameId !== selectedId || pinnedFrame) && onFrameAddMedia) {
      const x0 = e.clientX, y0 = e.clientY;
      const up = (u: PointerEvent) => {
        window.removeEventListener('pointercancel', cancel);
        const r = add.getBoundingClientRect();
        const onIt = u.clientX >= r.left && u.clientX <= r.right && u.clientY >= r.top && u.clientY <= r.bottom;
        if (Math.hypot(u.clientX - x0, u.clientY - y0) < 10 && (onIt || !r.width)) { onSelect(null); setTimeout(() => onFrameAddMedia(frameId), 0); }
      };
      const cancel = () => window.removeEventListener('pointerup', up);
      window.addEventListener('pointerup', up, { once: true });
      window.addEventListener('pointercancel', cancel, { once: true });
      return;
    }
    if (id === selectedId) return;
    const m = moveableRef.current;
    const native = e.nativeEvent;
    if (id && m) {
      // Select and drag in one gesture — but only if the button is still down once the handles attach.
      // A quick click releases first; starting the drag then would never see a pointerup (item stuck to the mouse).
      let held = true;
      const release = () => { held = false; };
      window.addEventListener('pointerup', release, { once: true });
      window.addEventListener('pointercancel', release, { once: true });
      m.waitToChangeTarget().then(() => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        if (held) m.dragStart(native);
      });
    }
    onSelect(id); // tap on empty page clears selection
  };
  const startEditing = (id: string | null) => {
    const el = layout.elements.find((x) => x.id === id);
    if (el?.type === 'text') { onSelect(el.id); setEditingId(el.id); }
    if (el?.type === 'frame' && el.mediaId) { onSelect(el.id); onCrop?.(el.id); }
  };

  const renderOverlay = (el: PageElement) => el.id === shapeId && el.type === 'frame'
    ? <ShapeOverlay el={el} onChange={setShape} onDone={finishShape} />
    : el.id === cropId && el.type === 'frame'
    ? <CropOverlay el={el} media={el.mediaId ? media.get(el.mediaId) : undefined} onChange={setCrop} onDone={finishCrop}
      onRemove={() => { pendingCrop.current = null; onCommit(assignMedia(layout, el.id, null)); onCrop?.(null); }} />
    : el.id === editingId && el.type === 'text'
    ? <TextEditor el={el} onDone={(text) => {
      setEditingId(null);
      if (text === el.text) return;
      const t = text.slice(0, 500);
      const h = fitBubble(el, t, pageRef.current?.querySelector(`[data-el="${el.id}"] .manga-words`));
      onCommit(updateElement(layout, el.id, h > el.h ? { text: t, h } : { text: t }));
    }} />
    : null;

  return (
    <div className={`edit-page${editingId ? ' editing' : ''}`} ref={pageRef} onPointerDown={onPointerDown}
      style={{ '--zoom': String(zoom) } as CSSProperties}
      onDoubleClick={(e) => startEditing((e.target as Element).closest('[data-el]')?.getAttribute('data-el') ?? null)}>
      <PageRenderer layout={shown} media={media} mode="edit" renderOverlay={renderOverlay} />
      <Moveable ref={moveableRef} target={target} className="editor-moveable" zoom={coarse ? 1.7 : 1}
        draggable={!pinned} resizable={!pinned} rotatable={!pinned} pinchable={pinned ? false : ['resizable', 'rotatable']} origin={false}
        snappable={snap && !pinned ? ['draggable'] : false} snapThreshold={5} elementGuidelines={guides} isDisplaySnapDigit={false}
        snapDirections={SNAP_DIRS} elementSnapDirections={SNAP_DIRS}
        renderDirections={pinned ? [] : ['nw', 'ne', 'sw', 'se']} keepRatio={selected?.type === 'sticker' || (selected?.type === 'frame' && ['circle', 'heart'].includes(selected.frameStyle))} rotationPosition="top"
        onDragStart={begin}
        onDrag={(e) => { if (released(e)) return; const { W, H } = size(); preview({ x: e.left / W, y: e.top / H }); }}
        onDragEnd={end}
        onResizeStart={begin}
        onResize={(e) => {
          if (released(e)) return;
          const s = start.current!;
          const { W, H } = size();
          const [dx, dy] = e.drag.beforeTranslate;
          const w = e.width / W;
          const h = e.height / H;
          // Corner handle: Moveable keeps the opposite corner fixed. Pinch: scale about the element's center.
          const pos = e.isPinch ? { x: s.x + (s.w - w) / 2, y: s.y + (s.h - h) / 2 } : { x: s.x + dx / W, y: s.y + dy / H };
          preview({ ...pos, w, h, ...(s.type === 'text' && { size: s.size * h / s.h }) });
        }}
        onResizeEnd={end}
        onRotateStart={(e) => { begin(); e.set(selected?.rotation ?? 0); }}
        onRotate={(e) => { if (!released(e)) preview({ rotation: Math.round(e.rotation * 10) / 10 }); }}
        onRotateEnd={end}
        onClick={(e) => {
          if (!selected) return;
          if (e.isDouble) startEditing(selected.id);
          // Only the "+ add" button itself: the rest of the frame stays for selecting, dragging and resizing (phones).
          else if (selected.type === 'frame' && !selected.mediaId && onFrameAddMedia && (e.inputTarget as Element | null)?.closest?.('.slot-empty')) {
            // The native file dialog swallows mouse events: opened mid-gesture it left a half-finished drag that
            // grabbed the frame afterwards. Deselect first (nothing to drag) and open it once this click is done.
            const id = selected.id;
            onSelect(null);
            setTimeout(() => onFrameAddMedia(id), 0);
          }
        }}
      />
    </div>
  );
}

// Bubbles and narration boxes grow (never shrink) to fit what was typed: the new words are measured at the box's
// full width in a hidden copy of the drawn words. A speech/thought ellipse or a shout burst only has room in its middle.
const ROOM: Partial<Record<NonNullable<TextEl['textStyle']>, number>> = { speech: 0.62, thought: 0.62, shout: 0.5, narration: 0.9 };
function fitBubble(el: TextEl, text: string, words: Element | null | undefined): number {
  const room = el.textStyle && ROOM[el.textStyle];
  const box = words?.parentElement;
  if (!room || !(words instanceof HTMLElement) || !box?.offsetHeight) return el.h;
  const probe = words.cloneNode() as HTMLElement;
  // Full bubble width (the drawn words shrink to their old text); the 8% side padding still applies.
  Object.assign(probe.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden', boxSizing: 'border-box', width: '100%' });
  probe.textContent = text;
  box.appendChild(probe);
  const need = probe.offsetHeight;
  probe.remove();
  const have = box.offsetHeight * room;
  return need > have ? Math.min(0.9, Math.round(el.h * (need / have) * 1000) / 1000) : el.h;
}

// Inline editor laid over the text element (the rendered text is hidden under it via .editing CSS).
function TextEditor({ el, onDone }: { el: TextEl; onDone(text: string): void }) {
  return (
    <div className={`text text-editing${el.textStyle && el.textStyle !== 'plain' ? ` manga-edit manga-edit-${el.textStyle}` : ''}`} contentEditable suppressContentEditableWarning spellCheck={false}
      ref={(n) => { if (n && document.activeElement !== n) { n.focus(); document.getSelection()?.selectAllChildren(n); } }}
      // White sound-effect lettering has an outline when drawn; while typing it would be invisible on white paper.
      style={{ ...textCss(el, el.textStyle === 'sfx' ? '#111111' : el.color), ...(el.textStyle === 'sfx' && { WebkitTextStroke: 'initial' }) }}
      onBlur={(e) => onDone(e.currentTarget.innerText.replace(/\n$/, ''))}
      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}>
      {el.text}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Crop mode: drag moves the photo freely (it follows the finger, past the frame's edges too, in any direction
// whatever the photo's proportions), wheel / pinch / Size zoom. Pointer deltas are rotated into the frame's own axes and
// kept as crop.ox/oy, a share of the frame window. The photo is drawn scaled about crop.x/y (BlurImage) and then
// shifted by ox/oy; zooming keeps the point under the fingers (or the frame's centre) where it is by adjusting ox/oy.
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

// New ox/oy after a zoom from c.scale to s, so the photo point at (ax, ay) — fractions of the frame window — stays put.
// On one axis the point shown at a is o + scale·(q − o) + t (o: the zoom origin crop.x, t: the shift ox).
export function zoomAbout(c: Crop, s: number, ax = 0.5, ay = 0.5): Crop {
  const k = s / c.scale;
  const move = (t: number, o: number, a: number) => (a - o) * (1 - k) + k * t;
  return { ...c, scale: s, ox: move(c.ox ?? 0, c.x, ax), oy: move(c.oy ?? 0, c.y, ay) };
}

function CropOverlay({ el, media, onChange, onDone, onRemove }: {
  el: FrameEl; media: MediaDTO | undefined; onChange(c: Crop): void; onDone(): void; onRemove(): void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const cur = useRef(el.crop); // latest crop, ahead of re-renders
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<{ crop: Crop; cx: number; cy: number; d: number } | null>(null);
  const set = (c: Crop) => { cur.current = c; onChange(c); };

  const win = () => ref.current?.parentElement?.querySelector<HTMLElement>('.frame-window') ?? null;
  // Screen vector → frame axes (the frame may be rotated).
  const toFrame = (sx: number, sy: number) => {
    const a = (-el.rotation * Math.PI) / 180;
    return { x: sx * Math.cos(a) - sy * Math.sin(a), y: sx * Math.sin(a) + sy * Math.cos(a) };
  };
  // How far the photo may be pushed: until it has (almost) left the frame, however far it is zoomed in.
  const limit = (c: Crop) => {
    const w = win(), iw = media?.width, ih = media?.height;
    const cover = w && iw && ih ? Math.max(w.offsetWidth / iw, w.offsetHeight / ih) : 0;
    const pw = cover && iw ? (iw * cover * c.scale) / w!.offsetWidth : c.scale; // photo size in frame widths / heights
    const ph = cover && ih ? (ih * cover * c.scale) / w!.offsetHeight : c.scale;
    return { x: Math.min(8, (pw + 1) / 2 + 0.5), y: Math.min(8, (ph + 1) / 2 + 0.5) };
  };
  const tidy = (c: Crop): Crop => {
    const l = limit(c), r = (v: number, m: number) => Math.round(clamp(v, -m, m) * 10000) / 10000;
    const { ox: _x, oy: _y, ...rest } = c;
    const ox = r(c.ox ?? 0, l.x), oy = r(c.oy ?? 0, l.y);
    return { ...rest, ...(ox || oy ? { ox, oy } : {}) }; // no shift: leave the fields out
  };
  const pan = (c: Crop, sx: number, sy: number): Crop => {
    const w = win();
    const d = toFrame(sx, sy);
    if (!w?.offsetWidth || !w.offsetHeight || (!d.x && !d.y)) return tidy(c);
    return tidy({ ...c, ox: (c.ox ?? 0) + d.x / w.offsetWidth, oy: (c.oy ?? 0) + d.y / w.offsetHeight });
  };
  // A screen point → fractions of the frame window (for zooming about the fingers).
  const at = (px: number, py: number) => {
    const w = win();
    if (!w?.offsetWidth) return { x: 0.5, y: 0.5 };
    const r = w.getBoundingClientRect();
    const d = toFrame(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
    return { x: 0.5 + d.x / w.offsetWidth, y: 0.5 + d.y / w.offsetHeight };
  };
  const zoom = (s: number, ax?: number, ay?: number) => tidy(zoomAbout(cur.current, clamp(s, MIN_SCALE, MAX_SCALE), ax, ay));
  // Controls sit under the frame; a frame near the bottom of the visible stage gets them above it instead.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    const bar = actionsRef.current, stage = bar?.closest('.edit-stage');
    if (!bar || !stage || above) return;
    const b = bar.getBoundingClientRect(), st = stage.getBoundingClientRect(), frame = ref.current!.getBoundingClientRect();
    if (b.bottom > st.bottom && frame.top - st.top > b.height + 16) setAbove(true);
  }, [above]);
  // Scale at which the whole photo fits inside the frame window (cover is 1).
  const fitScale = () => {
    const win = ref.current?.parentElement?.querySelector<HTMLElement>('.frame-window');
    if (!win || !media?.width || !media.height) return 1;
    const rw = win.offsetWidth / media.width, rh = win.offsetHeight / media.height;
    return Math.min(rw, rh) / Math.max(rw, rh);
  };
  // Gesture baseline restarts whenever a finger is added or lifted.
  const rebase = () => {
    const p = [...pts.current.values()];
    if (!p.length) { base.current = null; return; }
    const cx = p.reduce((s, q) => s + q.x, 0) / p.length, cy = p.reduce((s, q) => s + q.y, 0) / p.length;
    base.current = { crop: cur.current, cx, cy, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!pts.current.has(e.pointerId) || !base.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const b = base.current;
    const cx = p.reduce((s, q) => s + q.x, 0) / p.length, cy = p.reduce((s, q) => s + q.y, 0) / p.length;
    // Two fingers: zoom about where they started (that photo point stays under them), then follow their middle.
    const scale = b.d && p.length > 1 ? clamp(b.crop.scale * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / b.d, MIN_SCALE, MAX_SCALE) : b.crop.scale;
    const a = at(b.cx, b.cy);
    set(pan(scale === b.crop.scale ? b.crop : zoomAbout(b.crop, scale, a.x, a.y), cx - b.cx, cy - b.cy));
  };
  const lift = (e: ReactPointerEvent) => { pts.current.delete(e.pointerId); rebase(); };

  useEffect(() => {
    const n = ref.current!;
    // Non-passive so a trackpad pinch (ctrl+wheel) zooms the photo instead of the browser page.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const a = at(e.clientX, e.clientY); // zoom about the pointer
      set(zoom(cur.current.scale * Math.exp(-e.deltaY * 0.0015), a.x, a.y));
    };
    n.addEventListener('wheel', wheel, { passive: false });
    return () => n.removeEventListener('wheel', wheel);
  });

  return (
    <div className="crop-overlay" ref={ref}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('button, label')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        rebase();
      }}
      onPointerMove={onMove} onPointerUp={lift} onPointerCancel={lift}>
      {/* Counter-rotated so the controls stay level under a tilted frame. */}
      <div className={`crop-actions${above ? ' above' : ''}`} ref={actionsRef} style={{ rotate: `${-el.rotation}deg` }}>
        <label className="crop-size">Size
          <input type="range" aria-label={t('Photo size')} min={MIN_SCALE} max={MAX_SCALE} step={0.01} value={el.crop.scale}
            onChange={(e) => set(zoom(Number(e.target.value)))} />
        </label>
        <button type="button" onClick={() => set({ x: 0.5, y: 0.5, scale: fitScale() })} title={t('Show the whole photo')}>{t('Fit')}</button>
        <button type="button" onClick={() => set({ x: 0.5, y: 0.5, scale: 1 })} title={t('Fill the frame')}>{t('Fill')}</button>
        <button type="button" className="crop-remove" onClick={onRemove}>{t('Remove photo')}</button>
        <button type="button" className="crop-done" onClick={onDone}>{t('Done')}</button>
      </div>
    </div>
  );
}
