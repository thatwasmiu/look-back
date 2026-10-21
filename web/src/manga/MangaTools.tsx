// Manga-mode tools for the editor toolbar. The Toolbar owns the picker state and the shared rows (layers, undo,
// zoom, Text, Effect, Background); this file only adds what manga albums get instead of Frame / Sticker / Tape / Paper.
import type { EffectEl, FrameEl, PageElement, PageLayout, TextEl } from '@scrapbook/shared';
import { newEffect, newMangaText, newPanel, updateElement } from '../editor/layoutOps';
import { useT } from '../i18n';

export type MangaPicker = 'bubble' | 'lines';
type Add = (el: PageElement) => void;

// The "+ Add" list's manga part: panels, bubbles, narration, sound effects, lines, screentone.
export function MangaAddItems({ add, open, selected, noPanel = false }: { add: Add; open(p: MangaPicker): void; selected: PageElement | null; noPanel?: boolean }) {
  const t = useT();
  return <>
    {!noPanel && <button type="button" className="album-fx-option" onClick={() => add(newPanel())}>{t('Panel')}</button>}
    <button type="button" className="album-fx-option" onClick={() => open('bubble')}>{t('Bubble')}</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('narration'))}>{t('Narration')}</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('sfx'))}>{t('Sound effect')}</button>
    <button type="button" className="album-fx-option" onClick={() => open('lines')}>{t('Lines')}</button>
    <button type="button" className="album-fx-option" onClick={() => add(overlay(newEffect('screentone'), selected))}>{t('Screentone')}</button>
  </>;
}

export function MangaPickerContent({ picker, add, selected }: { picker: string | null; add: Add; selected: PageElement | null }) {
  const t = useT();
  if (picker === 'bubble') return <>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('speech'))}>{t('Speech')}</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('shout'))}>{t('Shout')}</button>
    <button type="button" className="album-fx-option" onClick={() => add(newMangaText('thought'))}>{t('Thought')}</button>
  </>;
  if (picker === 'lines') return <>
    <button type="button" className="album-fx-option" onClick={() => add(overlay(newEffect('speed-lines'), selected))}>{t('Speed lines')}</button>
    <button type="button" className="album-fx-option" onClick={() => add(overlay(newEffect('focus-lines'), selected))}>{t('Focus lines')}</button>
  </>;
  return null;
}

// With a panel selected: B&W ink, screentone, border weight.
export function MangaPanelTools({ panel, layout, commit, editShape }: { panel: FrameEl; layout: PageLayout; commit(l: PageLayout): void; editShape?(): void }) {
  const t = useT();
  const set = (patch: Partial<FrameEl>) => commit(updateElement(layout, panel.id, patch));
  const border = panel.border ?? 'normal';
  return <>
    <span className="row" role="group" aria-label={t('Panel')}>
      {editShape && <button type="button" title={t('Move each corner')} onClick={editShape}>{t('Shape')}</button>}
      <button type="button" aria-pressed={!!panel.ink} title={t('Black & white ink look')} onClick={() => set({ ink: !panel.ink })}>{t('Ink')}</button>
      <button type="button" aria-pressed={!!panel.tone} title={t('Screentone dots')} onClick={() => set({ tone: !panel.tone })}>{t('Tone')}</button>
    </span>
    <span className="row" role="group" aria-label={t('Border')}>
      {(['none', 'thin', 'normal'] as const).map((b) => (
        <button key={b} type="button" aria-pressed={border === b} onClick={() => set({ border: b })}>{t(b === 'none' ? 'No border' : b === 'thin' ? 'Thin' : 'Border')}</button>
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
  const t = useT();
  if (text.textStyle !== 'speech' && text.textStyle !== 'thought') return null;
  const tail = text.tail ?? 'bl';
  return (
    <span className="row" role="group" aria-label={t('Tail')}>
      {TAILS.map(([corner, name, icon]) => (
        <button key={corner} type="button" aria-label={t(`Tail ${name}`)} title={t(`Tail ${name}`)} aria-pressed={tail === corner}
          onClick={() => commit(updateElement(layout, text.id, { tail: corner }))}>{icon}</button>
      ))}
    </span>
  );
}
