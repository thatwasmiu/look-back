// Manga-mode tools for the editor toolbar. The Toolbar owns the picker state and the shared rows (layers, undo,
// zoom, Text, Effect, Background); this file only adds what manga albums get instead of Frame / Sticker / Tape / Paper.
import type { EffectEl, FrameEl, PageElement, PageLayout, TextEl } from '@scrapbook/shared';
import { newEffect, newMangaText, newPanel, updateElement } from '../editor/layoutOps';

export type MangaPicker = 'bubble' | 'lines';
type Add = (el: PageElement) => void;

export function MangaButtons({ picker, toggle, add, selected }: { picker: string | null; toggle(p: MangaPicker): void; add: Add; selected: PageElement | null }) {
  return <>
    <button type="button" onClick={() => add(newPanel())}>Panel</button>
    <button type="button" aria-expanded={picker === 'bubble'} onClick={() => toggle('bubble')}>Bubble</button>
    <button type="button" onClick={() => add(newMangaText('narration'))}>Narration</button>
    <button type="button" onClick={() => add(newMangaText('sfx'))}>Sound effect</button>
    <button type="button" aria-expanded={picker === 'lines'} onClick={() => toggle('lines')}>Lines</button>
    <button type="button" onClick={() => add(overlay(newEffect('screentone'), selected))}>Screentone</button>
  </>;
}

export function MangaPickerContent({ picker, add, selected }: { picker: string | null; add: Add; selected: PageElement | null }) {
  if (picker === 'bubble') return <>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('speech'))}>Speech</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('shout'))}>Shout</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('thought'))}>Thought</button>
  </>;
  if (picker === 'lines') return <>
    <button type="button" className="album-fx-option" onClick={() => add(overlay(newEffect('speed-lines'), selected))}>Speed lines</button>
    <button type="button" className="album-fx-option" onClick={() => add(overlay(newEffect('focus-lines'), selected))}>Focus lines</button>
  </>;
  return null;
}

// With a panel selected: B&W ink, screentone, border weight.
export function MangaPanelTools({ panel, layout, commit }: { panel: FrameEl; layout: PageLayout; commit(l: PageLayout): void }) {
  const set = (patch: Partial<FrameEl>) => commit(updateElement(layout, panel.id, patch));
  const border = panel.border ?? 'normal';
  return <>
    <button type="button" aria-pressed={!!panel.ink} title="Black & white ink look" onClick={() => set({ ink: !panel.ink })}>Ink</button>
    <button type="button" aria-pressed={!!panel.tone} title="Screentone dots" onClick={() => set({ tone: !panel.tone })}>Tone</button>
    <span className="row" role="group" aria-label="Border">
      {(['none', 'thin', 'normal'] as const).map((b) => (
        <button key={b} type="button" aria-pressed={border === b} onClick={() => set({ border: b })}>{b === 'none' ? 'No border' : b === 'thin' ? 'Thin' : 'Border'}</button>
      ))}
    </span>
  </>;
}

// Lines and tone start over the selected panel; with no panel selected, a mid-page box to move onto one.
// (Not the whole page: an overlay takes taps, so a page-sized one would hide every panel and bubble beneath it.)
const overlay = (e: EffectEl, selected: PageElement | null): EffectEl => selected?.type === 'frame'
  ? { ...e, x: selected.x, y: selected.y, w: selected.w, h: selected.h, rotation: selected.rotation }
  : { ...e, x: 0.2, y: 0.275, w: 0.6, h: 0.45, rotation: 0 };

// With a speech or thought bubble selected: which corner its tail points from.
const TAILS = [['bl', 'bottom-left', '↙'], ['br', 'bottom-right', '↘'], ['tl', 'top-left', '↖'], ['tr', 'top-right', '↗'], ['none', 'none', '∅']] as const;
export function MangaTextTools({ text, layout, commit }: { text: TextEl; layout: PageLayout; commit(l: PageLayout): void }) {
  if (text.textStyle !== 'speech' && text.textStyle !== 'thought') return null;
  const tail = text.tail ?? 'bl';
  return (
    <span className="row" role="group" aria-label="Tail">
      {TAILS.map(([t, name, icon]) => (
        <button key={t} type="button" aria-label={`Tail ${name}`} title={`Tail ${name}`} aria-pressed={tail === t}
          onClick={() => commit(updateElement(layout, text.id, { tail: t }))}>{icon}</button>
      ))}
    </span>
  );
}
