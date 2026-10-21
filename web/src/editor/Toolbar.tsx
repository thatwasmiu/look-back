import { useEffect, useRef, useState } from 'react';
import { BACKGROUND_COLORS, BACKGROUND_EFFECTS, FRAME_STYLES, PAGE_EFFECTS, type AlbumMode, type ReadingDirection, type BackgroundColor, type BackgroundEffect, type FrameEl, type MediaDTO, type PageElement, type PageLayout, type TextEl } from '@scrapbook/shared';
import { EffectView, backgroundEffectLabels, deskColorLabels, pageEffectLabels } from '../render/effects';
import { Tape, fontFamily, frameStyleLabels, stickers, tapeStyles } from '../render/decor';
import { FrameView } from '../render/FrameView';
import { mediaUrl } from '../mediaUrl';
import { MangaAddItems, MangaPanelTools, MangaPickerContent, MangaTextTools, type MangaPicker } from '../manga/MangaTools';
import { addElement, assignMedia, bringForward, duplicate, newEffect, newFrame, newSticker, newTape, newText, removeElement, sendBackward, setFrameStyle, updateElement } from './layoutOps';
import type { SaveStatus } from './useAutosave';
import { TrimPanel } from './TrimPanel';
import { useT } from '../i18n';

type Props = {
  layout: PageLayout; selected: PageElement | null;
  commit(next: PageLayout | ((l: PageLayout) => PageLayout), select?: string | null, coalesce?: string): void;
  undo(): void; redo(): void; canUndo: boolean; canRedo: boolean;
  status: SaveStatus; save(): void;
  crop?(): void;
  editShape?(): void; // manga panel → shape mode (move its corners) // selected filled frame → crop mode (double-tap alone is unreliable on phones)
  zoom: number; setZoom(z: number): void;
  snap?: boolean; setSnap?(on: boolean): void; // snap guides while dragging/resizing
  frameMedia?: MediaDTO | null; // the selected frame's photo/video (Trim for videos)
  bgEffect: BackgroundEffect; setBgEffect(e: BackgroundEffect): void;
  bgColor: BackgroundColor; setBgColor(c: BackgroundColor): void;
  music?: MediaDTO | null; onMusicFile?(f: File): void; onMusicRemove?(): void; // album background music
  mode?: AlbumMode; readingDirection?: ReadingDirection; setReadingDirection?(d: ReadingDirection): void; // manga albums
  guest?: boolean; // edit-link guest: no frame/panel tools, no album settings (the server refuses those changes)
};

const backgrounds: PageLayout['background'][] = ['paper-cream', 'paper-kraft', 'paper-grid', 'paper-dots'];
const duration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
// Bangers (sound effects) belongs to manga albums; the scrapbook Font picker keeps its two fonts.
const SCRAPBOOK_FONTS: TextEl['font'][] = ['dancing-script', 'patrick-hand'];
const MANGA_FONTS: TextEl['font'][] = ['patrick-hand', 'bangers', 'dancing-script'];
const inks = ['#4a3b2c', '#3b2a1a', '#7a4a2e', '#a33a2a', '#2f5d7c', '#3f6b3a'];
// Swatch preview: an empty frame (paper inside), drawn by the real renderer so the list matches the page.
const SAMPLE: FrameEl = { type: 'frame', id: 'sample', x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, frameStyle: 'polaroid', mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } };
// Zoom steps relative to "page fits the stage" (1).
export const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
export const stepZoom = (z: number, dir: 1 | -1) =>
  dir > 0 ? ZOOMS.find((s) => s > z + 1e-9) ?? z : [...ZOOMS].reverse().find((s) => s < z - 1e-9) ?? z;
const statusLabel: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Save failed' };

// Laptop: a bar above the page. Phone (coarse pointer or < 700px, see CSS): a sheet pinned to the bottom,
// pickers open above it.
export function Toolbar({ layout, selected, commit, undo, redo, canUndo, canRedo, status, save, crop, zoom, setZoom, snap, setSnap, frameMedia = null, bgEffect, setBgEffect, bgColor, setBgColor, editShape, music = null, onMusicFile, onMusicRemove, mode = 'scrapbook', readingDirection = 'ltr', setReadingDirection, guest = false }: Props) {
  const t = useT();
  const manga = mode === 'manga';
  // 'add': the "+ Add" list; picking a kind with choices (frames, stickers, bubbles…) opens that kind's list.
  const [picker, setPicker] = useState<'add' | 'frame' | 'frameStyle' | 'sticker' | 'tape' | 'bg' | 'effect' | 'albumFx' | 'font' | 'trim' | MangaPicker | null>(null);
  const toggle = (p: typeof picker) => setPicker((cur) => (cur === p ? null : p));
  const ref = useRef<HTMLDivElement>(null);
  // Music preview while editing: the <audio> lives outside the picker, so it keeps playing once the picker closes.
  const audioRef = useRef<HTMLAudioElement>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const musicSrc = music?.status === 'ready' && music.variants?.audio ? mediaUrl(music.variants.audio) : null;
  const toggleMusic = () => { const a = audioRef.current; if (a?.paused) void a.play()?.catch(() => {}); else a?.pause(); };
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
  const lockedFrame = guest && !!frame; // a guest may only change a frame's photo (crop, trim, remove)
  const video = frame && frameMedia?.kind === 'video' && frameMedia.status === 'ready' && frameMedia.id === frame.mediaId ? frameMedia : null;
  const pickFrame = (s: FrameEl['frameStyle']) => {
    if (picker === 'frameStyle' && frame) { commit(setFrameStyle(layout, frame.id, s)); setPicker(null); } else add(newFrame(s));
  };
  const setText = (patch: Partial<TextEl>, coalesce?: string) => text && commit(updateElement(layout, text.id, patch), undefined, coalesce);

  return (
    <div className="toolbar" role="toolbar" aria-label={t('Editor tools')} ref={ref}>
      {musicSrc && <audio ref={audioRef} src={musicSrc} loop onPlay={() => setMusicPlaying(true)} onPause={() => setMusicPlaying(false)} />}
      {picker && (
        <div className="picker">
          {picker === 'add' && <>
            {manga ? <MangaAddItems add={add} open={(p) => setPicker(p)} selected={selected} noPanel={guest} /> : <>
              {!guest && <button type="button" className="album-fx-option" onClick={() => setPicker('frame')}>{t('Frame')}</button>}
              <button type="button" className="album-fx-option" onClick={() => setPicker('sticker')}>{t('Sticker')}</button>
              <button type="button" className="album-fx-option" onClick={() => setPicker('tape')}>{t('Tape')}</button>
            </>}
            <button type="button" className="album-fx-option" onClick={() => add(newText())}>{t('Text')}</button>
            <button type="button" className="album-fx-option" onClick={() => setPicker('effect')}>{t('Effect')}</button>
          </>}
          {(picker === 'frame' || picker === 'frameStyle') && FRAME_STYLES.map((s) => (
            <button key={s} type="button" className="swatch frame-swatch" aria-label={t('{name} frame', { name: t(frameStyleLabels[s]) })} title={t(frameStyleLabels[s])}
              aria-pressed={picker === 'frameStyle' && frame?.frameStyle === s} onClick={() => pickFrame(s)}>
              <FrameView el={{ ...SAMPLE, frameStyle: s }} media={undefined} mode="view" active={false} />
            </button>
          ))}
          {picker === 'effect' && PAGE_EFFECTS.map((e) => (
            <button key={e} type="button" className="swatch effect-swatch" aria-label={t('{name} effect', { name: t(pageEffectLabels[e]) })} title={t(pageEffectLabels[e])}
              onClick={() => add(newEffect(e))}><EffectView effect={e} /></button>
          ))}
          {picker === 'albumFx' && (
            <div className="desk-colors" role="group" aria-label={t('Desk color')}>
              {BACKGROUND_COLORS.map((c) => (
                <button key={c} type="button" className={`desk-swatch desk-${c}`} aria-label={t('{name} desk color', { name: t(deskColorLabels[c]) })} title={t(deskColorLabels[c])}
                  aria-pressed={bgColor === c} onClick={() => setBgColor(c)} />
              ))}
            </div>
          )}
          {picker === 'albumFx' && BACKGROUND_EFFECTS.map((e) => (
            <button key={e} type="button" className="album-fx-option" aria-label={t('{name} background', { name: t(backgroundEffectLabels[e]) })} aria-pressed={bgEffect === e}
              onClick={() => { setBgEffect(e); setPicker(null); }}>{t(backgroundEffectLabels[e])}</button>
          ))}
          {manga && <MangaPickerContent picker={picker} add={add} selected={selected} />}
          {picker === 'albumFx' && manga && setReadingDirection && (
            <div className="music-row" role="group" aria-label={t('Reading direction')}>
              <span>{t('Reading direction')}</span>
              {(['ltr', 'rtl'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={readingDirection === d} onClick={() => setReadingDirection(d)}>{t(d === 'ltr' ? 'Left → right' : 'Right → left')}</button>
              ))}
            </div>
          )}
          {picker === 'albumFx' && onMusicFile && (
            <div className="music-row" role="group" aria-label={t('Background music')}>
              <span className="music-name" title={music?.name ?? undefined}>♪ {music?.name?.replace(/\.[^.]+$/, '') || t('Music')}</span>
              {music ? <>
                <span className="music-state">{music.status === 'ready' ? duration(music.durationSec) : music.status === 'failed' ? t("can't read this file") : t('processing…')}</span>
                {musicSrc && <button type="button" aria-pressed={musicPlaying} onClick={toggleMusic}>{musicPlaying ? `⏸ ${t('Pause')}` : `▶ ${t('Play')}`}</button>}
                <button type="button" onClick={() => { audioRef.current?.pause(); onMusicRemove?.(); }}>{t('Remove music')}</button>
              </> : (
                <label className="music-upload">{t('Upload music')}
                  <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onMusicFile(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
          )}
          {picker === 'sticker' && Object.entries(stickers).map(([id, { label, Svg }]) => (
            <button key={id} type="button" className="swatch sticker-swatch" aria-label={t(label)} title={t(label)} onClick={() => add(newSticker(id))}><Svg /></button>
          ))}
          {picker === 'tape' && tapeStyles.map((ts) => (
            <button key={ts} type="button" className="swatch tape-swatch" aria-label={t('{name} tape', { name: t(ts) })} onClick={() => add(newTape(ts))}><Tape tapeStyle={ts} /></button>
          ))}
          {picker === 'trim' && frame && video && (
            <TrimPanel media={video} trim={frame.trim} onChange={(trim) => commit(updateElement(layout, frame.id, { trim }), undefined, `trim:${frame.id}`)} />
          )}
          {picker === 'font' && text && <>
            {(manga ? MANGA_FONTS : SCRAPBOOK_FONTS).map((f) => (
              <button key={f} type="button" className="font-option" aria-pressed={text.font === f} style={{ fontFamily: fontFamily[f] }} onClick={() => setText({ font: f })}>Aa</button>
            ))}
            {/* Size: a step is ×1.15; quick taps on one text are a single undo step. */}
            <span className="font-size">
              <button type="button" aria-label={t('Smaller text')} disabled={text.size <= 0.012} onClick={() => setText({ size: Math.max(0.01, +(text.size / 1.15).toFixed(4)) }, `size:${text.id}`)}>A−</button>
              <span aria-label={t('Text size')}>{Math.round(text.size * 1000)}</span>
              <button type="button" aria-label={t('Bigger text')} disabled={text.size >= 0.25} onClick={() => setText({ size: Math.min(0.3, +(text.size * 1.15).toFixed(4)) }, `size:${text.id}`)}>A+</button>
            </span>
            <span className="font-size font-align" role="group" aria-label={t('Alignment')}>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} type="button" aria-label={t(`Align ${a}`)} aria-pressed={(text.align ?? (text.textStyle === 'narration' ? 'left' : 'center')) === a}
                  onClick={() => setText({ align: a })}><AlignIcon align={a} /></button>
              ))}
            </span>
            {/* Line spacing: steps of 0.1 × the font size; quick taps are one undo step. */}
            <span className="font-size">
              <button type="button" aria-label={t('Less line spacing')} onClick={() => setText({ lineHeight: Math.max(0.6, +(lineHeightOf(text) - 0.1).toFixed(2)) }, `lh:${text.id}`)}>↕−</button>
              <span aria-label={t('Line spacing')}>{lineHeightOf(text).toFixed(1)}</span>
              <button type="button" aria-label={t('More line spacing')} onClick={() => setText({ lineHeight: Math.min(3, +(lineHeightOf(text) + 0.1).toFixed(2)) }, `lh:${text.id}`)}>↕+</button>
            </span>
            <button type="button" className="outline-toggle" aria-pressed={!!text.outline} onClick={() => setText({ outline: !text.outline })}>{t('Outline')}</button>
            {inks.map((c) => (
              <button key={c} type="button" className="ink" aria-label={t('ink {color}', { color: c })} aria-pressed={text.color === c} style={{ background: c }} onClick={() => setText({ color: c })} />
            ))}
            <input type="color" className="ink-custom" aria-label={t('Text color')} value={text.color} onChange={(e) => setText({ color: e.target.value }, `color:${text.id}`)} />
            <small className="picker-hint">{t('double-tap text to edit')}</small>
          </>}
          {picker === 'bg' && backgrounds.map((b) => (
            <button key={b} type="button" aria-label={b} aria-pressed={layout.background === b}
              className="swatch bg-swatch" onClick={() => { commit({ ...layout, background: b }); setPicker(null); }}>
              <span className={`page-bg bg-${b}`} />
            </button>
          ))}
        </div>
      )}
      <div className="tools">
        <div className="tools-main">
          <button type="button" className="add-btn" aria-label={t('Add')} aria-expanded={picker === 'add'} onClick={() => toggle('add')}>＋ {t('Add')}</button>
          {!manga && <button type="button" aria-expanded={picker === 'bg'} onClick={() => toggle('bg')}>{t('Paper')}</button>}
          {!guest && <button type="button" aria-expanded={picker === 'albumFx'} onClick={() => toggle('albumFx')}>{t('Background')}</button>}
          {musicPlaying && <button type="button" className="music-btn on" aria-label={t('Pause music')} title={t('Pause music')} onClick={toggleMusic}>♪</button>}
          {/* One way only: unpinning stays per item, so a stray tap can't unlock the whole page. */}
          {!guest && layout.elements.some((e) => !e.pinned) && (
            <button type="button" aria-label={t('Pin all')} title={t('Lock every item on this page')} onClick={() => commit({ ...layout, elements: layout.elements.map((e) => ({ ...e, pinned: true })) })}>📌 {t('Pin all')}</button>
          )}
          <span className="row">
            <button type="button" disabled={!canUndo} aria-label={t('Undo')} title={t('Undo (Ctrl+Z)')} onClick={undo}>↶</button>
            <button type="button" disabled={!canRedo} aria-label={t('Redo')} title={t('Redo (Ctrl+Shift+Z)')} onClick={redo}>↷</button>
          </span>
          <span className="zoom">
            <button type="button" aria-label={t('Zoom out')} title={t('Zoom out')} disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(stepZoom(zoom, -1))}>−</button>
            <button type="button" aria-label={t('Fit page (zoom {pct}%)', { pct: Math.round(zoom * 100) })} title={t('Fit page')} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" aria-label={t('Zoom in')} title={t('Zoom in (Ctrl + wheel)')} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(stepZoom(zoom, 1))}>+</button>
          </span>
          {setSnap && <button type="button" aria-pressed={!!snap} title={t('Snap to the page centre/edges and other items while dragging')} onClick={() => setSnap(!snap)}>{t('Snap')}</button>}
          {/* Autosave handles normal edits; the button only appears when a save failed, to retry it. */}
          {status === 'error' && <button type="button" className="save-retry" onClick={save}>{t('Retry save')}</button>}
          <span className={`status status-${status}`} role="status">{t(statusLabel[status])}</span>
        </div>
        {/* What the selected item can do. */}
        {selected && (
          <div className="tools-context">
            {text && (
              <button type="button" aria-expanded={picker === 'font'} onClick={() => toggle('font')}>
                <span className="color-dot" style={{ background: text.color }} aria-hidden />{t('Font')}
              </button>
            )}
            {frame && !guest && !manga && <button type="button" aria-expanded={picker === 'frameStyle'} onClick={() => toggle('frameStyle')}>{t('Frame style')}</button>}
            {crop && frame?.mediaId && <button type="button" onClick={crop}>{t('Crop')}</button>}
            {video && <button type="button" aria-expanded={picker === 'trim'} onClick={() => toggle('trim')}>✂ {t('Trim')}</button>}
            {frame?.mediaId && <button type="button" onClick={() => commit(assignMedia(layout, frame.id, null))}>{t('Remove photo')}</button>}
            {frame?.frameStyle === 'panel' && !guest && <MangaPanelTools panel={frame} layout={layout} commit={commit} editShape={editShape} />}
            {manga && text && <MangaTextTools text={text} layout={layout} commit={commit} />}
            {!lockedFrame && <button type="button" title={t('Duplicate (Ctrl+C, Ctrl+V)')} onClick={() => add(duplicate(selected))}>⧉ {t('Duplicate')}</button>}
            {!lockedFrame && (
              <button type="button" aria-pressed={!!selected.pinned} title={t(selected.pinned ? 'Unpin to move, resize or rotate again' : 'Lock in place')}
                onClick={() => commit(updateElement(layout, selected.id, { pinned: !selected.pinned }))}>📌 {t(selected.pinned ? 'Unpin' : 'Pin')}</button>
            )}
            <span className="row">
              <button type="button" aria-label={t('Bring forward')} title={t('Bring forward')} onClick={() => sel && commit(bringForward(layout, sel))}>↑</button>
              <button type="button" aria-label={t('Send backward')} title={t('Send backward')} onClick={() => sel && commit(sendBackward(layout, sel))}>↓</button>
              <button type="button" disabled={lockedFrame} aria-label={t('Delete')} title={t('Delete')} onClick={() => sel && commit(removeElement(layout, sel), null)}>🗑</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Line spacing in effect when none is set: plain text is drawn tight (1.05), bubbles at the browser's normal.
const lineHeightOf = (t: TextEl) => t.lineHeight ?? (t.textStyle && t.textStyle !== 'plain' ? 1.2 : 1.05);

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  const x = (w: number) => (align === 'left' ? 2 : align === 'right' ? 18 - w : 10 - w / 2);
  return (
    <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden>
      {[16, 10, 14, 8].map((w, i) => <rect key={i} x={x(w)} y={1 + i * 4} width={w} height="2" rx="1" fill="currentColor" />)}
    </svg>
  );
}
