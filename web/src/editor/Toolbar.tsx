import { useState } from 'react';
import type { PageElement, PageLayout, TextEl } from '@scrapbook/shared';
import { Tape, fontFamily, stickers, tapeStyles } from '../render/decor';
import { addElement, bringForward, newFrame, newSticker, newTape, newText, removeElement, sendBackward, updateElement } from './layoutOps';
import type { SaveStatus } from './useAutosave';

type Props = {
  layout: PageLayout; selected: PageElement | null;
  commit(next: PageLayout | ((l: PageLayout) => PageLayout), select?: string | null, coalesce?: string): void;
  undo(): void; redo(): void; canUndo: boolean; canRedo: boolean;
  status: SaveStatus; save(): void;
};

const backgrounds: PageLayout['background'][] = ['paper-cream', 'paper-kraft', 'paper-grid', 'paper-dots'];
const inks = ['#4a3b2c', '#3b2a1a', '#7a4a2e', '#a33a2a', '#2f5d7c', '#3f6b3a'];
const statusLabel: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Save failed' };

// Laptop: a bar above the page. Phone (coarse pointer or < 700px, see CSS): a sheet pinned to the bottom,
// pickers open above it.
export function Toolbar({ layout, selected, commit, undo, redo, canUndo, canRedo, status, save }: Props) {
  const [picker, setPicker] = useState<'sticker' | 'tape' | 'bg' | null>(null);
  const toggle = (p: typeof picker) => setPicker((cur) => (cur === p ? null : p));
  const add = (el: PageElement) => { commit(addElement(layout, el), el.id); setPicker(null); };
  const sel = selected?.id;
  const text = selected?.type === 'text' ? selected : null;
  const setText = (patch: Partial<TextEl>, coalesce?: string) => text && commit(updateElement(layout, text.id, patch), undefined, coalesce);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor tools">
      {picker && (
        <div className="picker">
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
        <button type="button" onClick={() => add(newFrame())}>Frame</button>
        <button type="button" aria-expanded={picker === 'sticker'} onClick={() => toggle('sticker')}>Sticker</button>
        <button type="button" aria-expanded={picker === 'tape'} onClick={() => toggle('tape')}>Tape</button>
        <button type="button" onClick={() => add(newText())}>Text</button>
        <button type="button" aria-expanded={picker === 'bg'} onClick={() => toggle('bg')}>Paper</button>
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
