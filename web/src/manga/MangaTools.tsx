// Manga-mode tools for the editor toolbar. The Toolbar owns the picker state and the shared rows (layers, undo,
// zoom, Text, Effect, Background); this file only adds what manga albums get instead of Frame / Sticker / Tape / Paper.
import type { EffectEl, FrameEl, PageElement, PageLayout } from '@scrapbook/shared';
import { newEffect, newMangaText, newPanel, updateElement } from '../editor/layoutOps';

export type MangaPicker = 'bubble' | 'lines';
type Add = (el: PageElement) => void;

export function MangaButtons({ picker, toggle, add }: { picker: string | null; toggle(p: MangaPicker): void; add: Add }) {
  return <>
    <button type="button" onClick={() => add(newPanel())}>Panel</button>
    <button type="button" aria-expanded={picker === 'bubble'} onClick={() => toggle('bubble')}>Bubble</button>
    <button type="button" onClick={() => add(newMangaText('narration'))}>Narration</button>
    <button type="button" onClick={() => add(newMangaText('sfx'))}>Sound effect</button>
    <button type="button" aria-expanded={picker === 'lines'} onClick={() => toggle('lines')}>Lines</button>
    <button type="button" onClick={() => add(fullPage(newEffect('screentone')))}>Tone</button>
  </>;
}

export function MangaPickerContent({ picker, add }: { picker: string | null; add: Add }) {
  if (picker === 'bubble') return <>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('speech'))}>Speech</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('shout'))}>Shout</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('thought'))}>Thought</button>
  </>;
  if (picker === 'lines') return <>
    <button type="button" className="album-fx-option" onClick={() => add(fullPage(newEffect('speed-lines')))}>Speed lines</button>
    <button type="button" className="album-fx-option" onClick={() => add(fullPage(newEffect('focus-lines')))}>Focus lines</button>
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

// Lines and tone start covering the whole page; resize them onto a panel.
const fullPage = (e: EffectEl): EffectEl => ({ ...e, x: 0, y: 0, w: 1, h: 1, rotation: 0 });
