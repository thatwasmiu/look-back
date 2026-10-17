import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';
import type { MediaDTO, PageElement, PageLayout, TextEl } from '@scrapbook/shared';
import { PageRenderer } from '../render/PageRenderer';
import { fontFamily } from '../render/decor';
import { updateElement } from './layoutOps';

type Props = {
  layout: PageLayout; media: Map<string, MediaDTO>;
  selectedId: string | null; onSelect(id: string | null): void;
  onCommit(l: PageLayout): void; // one history entry
  onFrameAddMedia?(frameId: string): void; // empty frame tapped: media tray/upload hooks in here
};

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Selected element gets react-moveable handles. During a gesture only a transient layout changes (live preview);
// the gesture end commits it once. Moveable reports CSS px relative to the page box; page units = px / box size.
export function EditCanvas({ layout, media, selectedId, onSelect, onCommit, onFrameAddMedia }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const [live, setLive] = useState<PageLayout | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const start = useRef<PageElement | null>(null);
  const liveRef = useRef<PageLayout | null>(null); // gesture-end handler must not read a stale closure
  const shown = live ?? layout;
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  const target = selected && editingId !== selected.id
    ? [...pageRef.current?.querySelectorAll<HTMLElement>('[data-el]') ?? []].find((n) => n.dataset.el === selected.id) ?? null : null;

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
  const end = () => {
    if (liveRef.current) onCommit(liveRef.current);
    liveRef.current = null;
    setLive(null);
    start.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('.moveable-control-box, [contenteditable]')) return;
    const id = (e.target as Element).closest('[data-el]')?.getAttribute('data-el') ?? null;
    if (id !== editingId) setEditingId(null);
    if (id === selectedId) return;
    const m = moveableRef.current;
    const native = e.nativeEvent;
    if (id && m) m.waitToChangeTarget().then(() => m.dragStart(native)); // select and drag in one gesture
    onSelect(id); // tap on empty page clears selection
  };
  const startEditing = (id: string | null) => {
    const el = layout.elements.find((x) => x.id === id);
    if (el?.type === 'text') { onSelect(el.id); setEditingId(el.id); }
  };

  const renderOverlay = (el: PageElement) => el.id === editingId && el.type === 'text'
    ? <TextEditor el={el} onDone={(text) => {
      setEditingId(null);
      if (text !== el.text) onCommit(updateElement(layout, el.id, { text: text.slice(0, 500) }));
    }} />
    : null;

  return (
    <div className={`edit-page${editingId ? ' editing' : ''}`} ref={pageRef} onPointerDown={onPointerDown}
      onDoubleClick={(e) => startEditing((e.target as Element).closest('[data-el]')?.getAttribute('data-el') ?? null)}>
      <PageRenderer layout={shown} media={media} mode="edit" renderOverlay={renderOverlay} />
      <Moveable ref={moveableRef} target={target} className="editor-moveable" zoom={coarse ? 1.7 : 1}
        draggable resizable rotatable pinchable={['resizable', 'rotatable']} origin={false}
        renderDirections={['nw', 'ne', 'sw', 'se']} keepRatio={selected?.type === 'sticker'} rotationPosition="top"
        onDragStart={begin}
        onDrag={(e) => { const { W, H } = size(); preview({ x: e.left / W, y: e.top / H }); }}
        onDragEnd={end}
        onResizeStart={begin}
        onResize={(e) => {
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
        onRotate={(e) => preview({ rotation: Math.round(e.rotation * 10) / 10 })}
        onRotateEnd={end}
        onClick={(e) => {
          if (!selected) return;
          if (e.isDouble) startEditing(selected.id);
          else if (selected.type === 'frame' && !selected.mediaId) onFrameAddMedia?.(selected.id);
        }}
      />
    </div>
  );
}

// Inline editor laid over the text element (the rendered text is hidden under it via .editing CSS).
function TextEditor({ el, onDone }: { el: TextEl; onDone(text: string): void }) {
  return (
    <div className="text text-editing" contentEditable suppressContentEditableWarning spellCheck={false}
      ref={(n) => { if (n && document.activeElement !== n) { n.focus(); document.getSelection()?.selectAllChildren(n); } }}
      style={{ fontFamily: fontFamily[el.font], color: el.color, fontSize: `${el.size * 100}cqh` }}
      onBlur={(e) => onDone(e.currentTarget.innerText.replace(/\n$/, ''))}
      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}>
      {el.text}
    </div>
  );
}
