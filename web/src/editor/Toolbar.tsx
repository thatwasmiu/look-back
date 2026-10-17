import { useEffect, useRef, useState } from 'react';
import { FRAME_STYLES, type FrameEl, type PageElement, type PageLayout, type TextEl } from '@scrapbook/shared';
import { Tape, fontFamily, frameStyleLabels, stickers, tapeStyles } from '../render/decor';
import { FrameView } from '../render/FrameView';
import { addElement, bringForward, newFrame, newSticker, newTape, newText, removeElement, sendBackward, setFrameStyle, updateElement } from './layoutOps';
import type { SaveStatus } from './useAutosave';

type Props = {
  layout: PageLayout; selected: PageElement | null;
  commit(next: PageLayout | ((l: PageLayout) => PageLayout), select?: string | null, coalesce?: string): void;
  undo(): void; redo(): void; canUndo: boolean; canRedo: boolean;
  status: SaveStatus; save(): void;
  crop?(): void; // selected filled frame → crop mode (double-tap alone is unreliable on phones)
};

const backgrounds: PageLayout['background'][] = ['paper-cream', 'paper-kraft', 'paper-grid', 'paper-dots'];
const inks = ['#4a3b2c', '#3b2a1a', '#7a4a2e', '#a33a2a', '#2f5d7c', '#3f6b3a'];
// Swatch preview: an empty frame (paper inside), drawn by the real renderer so the list matches the page.
const SAMPLE: FrameEl = { type: 'frame', id: 'sample', x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } };
const statusLabel: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Save failed' };

// Laptop: a bar above the page. Phone (coarse pointer or < 700px, see CSS): a sheet pinned to the bottom,
// pickers open above it.
export function Toolbar({ layout, selected, commit, undo, redo, canUndo, canRedo, status, save, crop }: Props) {
  const [picker, setPicker] = useState<'frame' | 'frameStyle' | 'sticker' | 'tape' | 'bg' | null>(null);
  const toggle = (p: typeof picker) => setPicker((cur) => (cur === p ? null : p));
  const ref = useRef<HTMLDivElement>(null);
  // An open picker closes on a press anywhere outside the toolbar, or on Escape.
  useEffect(() => {
    if (!picker) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setPicker(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(null); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [picker]);
  const add = (el: PageElement) => { commit(addElement(layout, el), el.id); setPicker(null); };
  const sel = selected?.id;
  const text = selected?.type === 'text' ? selected : null;
  const frame = selected?.type === 'frame' ? selected : null;
  const pickFrame = (s: FrameEl['frameStyle']) => {
    if (picker === 'frameStyle' && frame) { commit(setFrameStyle(layout, frame.id, s)); setPicker(null); } else add(newFrame(s));
  };
  const setText = (patch: Partial<TextEl>, coalesce?: string) => text && commit(updateElement(layout, text.id, patch), undefined, coalesce);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor tools" ref={ref}>
      {picker && (
        <div className="picker">
          {(picker === 'frame' || picker === 'frameStyle') && FRAME_STYLES.map((s) => (
            <button key={s} type="button" className="swatch frame-swatch" aria-label={`${frameStyleLabels[s]} frame`} title={frameStyleLabels[s]}
              aria-pressed={picker === 'frameStyle' && frame?.frameStyle === s} onClick={() => pickFrame(s)}>
              <FrameView el={{ ...SAMPLE, frameStyle: s }} media={undefined} mode="view" active={false} />
            </button>
          ))}
          {picker === 'sticker' && Object.entries(stickers).map(([id, { label, Svg }]) => (
            <button key={id} type="button" className="swatch sticker-swatch" aria-label={label} title={label} onClick={() => add(newSticker(id))}><Svg /></button>
          ))}
          {picker === 'tape' && tapeStyles.map((t) => (
            <button key={t} type="button" className="swatch tape-swatch" aria-label={`${t} tape`} onClick={() => add(newTape(t))}><Tape tapeStyle={t} /></button>
          ))}
          {picker === 'bg' && backgrounds.map((b) => (
            <button key={b} type="button" aria-label={b} aria-pressed={layout.background === b}
              className={`swatch bg-swatch bg-${b}`} onClick={() => { commit({ ...layout, background: b }); setPicker(null); }} />
          ))}
        </div>
      )}
      <div className="tools">
        <button type="button" aria-expanded={picker === 'frame'} onClick={() => toggle('frame')}>Frame</button>
        {frame && <button type="button" aria-expanded={picker === 'frameStyle'} onClick={() => toggle('frameStyle')}>Frame style</button>}
        <button type="button" aria-expanded={picker === 'sticker'} onClick={() => toggle('sticker')}>Sticker</button>
        <button type="button" aria-expanded={picker === 'tape'} onClick={() => toggle('tape')}>Tape</button>
        <button type="button" onClick={() => add(newText())}>Text</button>
        <button type="button" aria-expanded={picker === 'bg'} onClick={() => toggle('bg')}>Paper</button>
        {crop && selected?.type === 'frame' && selected.mediaId && <button type="button" onClick={crop}>Crop</button>}
        <span className="sep" />
        <button type="button" disabled={!sel} aria-label="Bring forward" title="Bring forward" onClick={() => sel && commit(bringForward(layout, sel))}>↑</button>
        <button type="button" disabled={!sel} aria-label="Send backward" title="Send backward" onClick={() => sel && commit(sendBackward(layout, sel))}>↓</button>
        <button type="button" disabled={!sel} aria-label="Delete" title="Delete" onClick={() => sel && commit(removeElement(layout, sel), null)}>🗑</button>
        <span className="sep" />
        <button type="button" disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" onClick={undo}>↶</button>
        <button type="button" disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={redo}>↷</button>
        <button type="button" onClick={save}>Save</button>
        <span className={`status status-${status}`} role="status">{statusLabel[status]}</span>
      </div>
      {text && (
        <div className="tools text-tools">
          {(Object.keys(fontFamily) as TextEl['font'][]).map((f) => (
            <button key={f} type="button" aria-pressed={text.font === f} style={{ fontFamily: fontFamily[f] }} onClick={() => setText({ font: f })}>Aa</button>
          ))}
          {inks.map((c) => (
            <button key={c} type="button" className="ink" aria-label={`ink ${c}`} aria-pressed={text.color === c} style={{ background: c }} onClick={() => setText({ color: c })} />
          ))}
          <input type="color" aria-label="Text color" value={text.color} onChange={(e) => setText({ color: e.target.value }, `color:${text.id}`)} />
          <small>double-tap text to edit</small>
        </div>
      )}
    </div>
  );
}
