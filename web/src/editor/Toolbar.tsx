import { useEffect, useRef, useState } from 'react';
import { BACKGROUND_COLORS, BACKGROUND_EFFECTS, FRAME_STYLES, PAGE_EFFECTS, type AlbumMode, type ReadingDirection, type BackgroundColor, type BackgroundEffect, type FrameEl, type MediaDTO, type PageElement, type PageLayout, type TextEl } from '@scrapbook/shared';
import { EffectView, backgroundEffectLabels, deskColorLabels, pageEffectLabels } from '../render/effects';
import { Tape, fontFamily, frameStyleLabels, stickers, tapeStyles } from '../render/decor';
import { FrameView } from '../render/FrameView';
import { mediaUrl } from '../mediaUrl';
import { MangaButtons, MangaPanelTools, MangaPickerContent, MangaTextTools, type MangaPicker } from '../manga/MangaTools';
import { addElement, assignMedia, bringForward, duplicate, newEffect, newFrame, newSticker, newTape, newText, removeElement, sendBackward, setFrameStyle, updateElement } from './layoutOps';
import type { SaveStatus } from './useAutosave';

type Props = {
  layout: PageLayout; selected: PageElement | null;
  commit(next: PageLayout | ((l: PageLayout) => PageLayout), select?: string | null, coalesce?: string): void;
  undo(): void; redo(): void; canUndo: boolean; canRedo: boolean;
  status: SaveStatus; save(): void;
  crop?(): void;
  editShape?(): void; // manga panel → shape mode (move its corners) // selected filled frame → crop mode (double-tap alone is unreliable on phones)
  zoom: number; setZoom(z: number): void;
  bgEffect: BackgroundEffect; setBgEffect(e: BackgroundEffect): void;
  bgColor: BackgroundColor; setBgColor(c: BackgroundColor): void;
  music?: MediaDTO | null; onMusicFile?(f: File): void; onMusicRemove?(): void; // album background music
  mode?: AlbumMode; readingDirection?: ReadingDirection; setReadingDirection?(d: ReadingDirection): void; // manga albums
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
const statusLabel: Record<SaveStatus, string> = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Lưu lỗi' };

// Laptop: a bar above the page. Phone (coarse pointer or < 700px, see CSS): a sheet pinned to the bottom,
// pickers open above it.
export function Toolbar({ layout, selected, commit, undo, redo, canUndo, canRedo, status, save, crop, zoom, setZoom, bgEffect, setBgEffect, bgColor, setBgColor, editShape, music = null, onMusicFile, onMusicRemove, mode = 'scrapbook', readingDirection = 'ltr', setReadingDirection }: Props) {
  const manga = mode === 'manga';
  const [picker, setPicker] = useState<'frame' | 'frameStyle' | 'sticker' | 'tape' | 'bg' | 'effect' | 'albumFx' | 'font' | MangaPicker | null>(null);
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
  const pickFrame = (s: FrameEl['frameStyle']) => {
    if (picker === 'frameStyle' && frame) { commit(setFrameStyle(layout, frame.id, s)); setPicker(null); } else add(newFrame(s));
  };
  const setText = (patch: Partial<TextEl>, coalesce?: string) => text && commit(updateElement(layout, text.id, patch), undefined, coalesce);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor tools" ref={ref}>
      {musicSrc && <audio ref={audioRef} src={musicSrc} loop onPlay={() => setMusicPlaying(true)} onPause={() => setMusicPlaying(false)} />}
      {picker && (
        <div className="picker">
          {(picker === 'frame' || picker === 'frameStyle') && FRAME_STYLES.map((s) => (
            <button key={s} type="button" className="swatch frame-swatch" aria-label={`${frameStyleLabels[s]} frame`} title={frameStyleLabels[s]}
              aria-pressed={picker === 'frameStyle' && frame?.frameStyle === s} onClick={() => pickFrame(s)}>
              <FrameView el={{ ...SAMPLE, frameStyle: s }} media={undefined} mode="view" active={false} />
            </button>
          ))}
          {picker === 'effect' && PAGE_EFFECTS.map((e) => (
            <button key={e} type="button" className="swatch effect-swatch" aria-label={`${pageEffectLabels[e]} effect`} title={pageEffectLabels[e]}
              onClick={() => add(newEffect(e))}><EffectView effect={e} /></button>
          ))}
          {picker === 'albumFx' && (
            <div className="desk-colors" role="group" aria-label="Desk color">
              {BACKGROUND_COLORS.map((c) => (
                <button key={c} type="button" className={`desk-swatch desk-${c}`} aria-label={`${deskColorLabels[c]} desk color`} title={deskColorLabels[c]}
                  aria-pressed={bgColor === c} onClick={() => setBgColor(c)} />
              ))}
            </div>
          )}
          {picker === 'albumFx' && BACKGROUND_EFFECTS.map((e) => (
            <button key={e} type="button" className="album-fx-option" aria-label={`${backgroundEffectLabels[e]} background`} aria-pressed={bgEffect === e}
              onClick={() => { setBgEffect(e); setPicker(null); }}>{backgroundEffectLabels[e]}</button>
          ))}
          {manga && <MangaPickerContent picker={picker} add={add} selected={selected} />}
          {picker === 'albumFx' && manga && setReadingDirection && (
            <div className="music-row" role="group" aria-label="Reading direction">
              <span>Reading direction</span>
              {(['ltr', 'rtl'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={readingDirection === d} onClick={() => setReadingDirection(d)}>{d === 'ltr' ? 'Left → right' : 'Right → left'}</button>
              ))}
            </div>
          )}
          {picker === 'albumFx' && onMusicFile && (
            <div className="music-row" role="group" aria-label="Background music">
              <span className="music-name" title={music?.name ?? undefined}>♪ {music?.name?.replace(/\.[^.]+$/, '') || 'Music'}</span>
              {music ? <>
                <span className="music-state">{music.status === 'ready' ? duration(music.durationSec) : music.status === 'failed' ? 'không đọc được file này' : 'đang xử lý…'}</span>
                {musicSrc && <button type="button" aria-pressed={musicPlaying} onClick={toggleMusic}>{musicPlaying ? '⏸ Pause' : '▶ Play'}</button>}
                <button type="button" onClick={() => { audioRef.current?.pause(); onMusicRemove?.(); }}>Remove music</button>
              </> : (
                <label className="music-upload">Upload music
                  <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onMusicFile(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
          )}
          {picker === 'sticker' && Object.entries(stickers).map(([id, { label, Svg }]) => (
            <button key={id} type="button" className="swatch sticker-swatch" aria-label={label} title={label} onClick={() => add(newSticker(id))}><Svg /></button>
          ))}
          {picker === 'tape' && tapeStyles.map((t) => (
            <button key={t} type="button" className="swatch tape-swatch" aria-label={`${t} tape`} onClick={() => add(newTape(t))}><Tape tapeStyle={t} /></button>
          ))}
          {picker === 'font' && text && <>
            {(manga ? MANGA_FONTS : SCRAPBOOK_FONTS).map((f) => (
              <button key={f} type="button" className="font-option" aria-pressed={text.font === f} style={{ fontFamily: fontFamily[f] }} onClick={() => setText({ font: f })}>Aa</button>
            ))}
            {/* Size: a step is ×1.15; quick taps on one text are a single undo step. */}
            <span className="font-size">
              <button type="button" aria-label="Smaller text" disabled={text.size <= 0.012} onClick={() => setText({ size: Math.max(0.01, +(text.size / 1.15).toFixed(4)) }, `size:${text.id}`)}>A−</button>
              <span aria-label="Text size">{Math.round(text.size * 1000)}</span>
              <button type="button" aria-label="Bigger text" disabled={text.size >= 0.25} onClick={() => setText({ size: Math.min(0.3, +(text.size * 1.15).toFixed(4)) }, `size:${text.id}`)}>A+</button>
            </span>
            {inks.map((c) => (
              <button key={c} type="button" className="ink" aria-label={`ink ${c}`} aria-pressed={text.color === c} style={{ background: c }} onClick={() => setText({ color: c })} />
            ))}
            <input type="color" className="ink-custom" aria-label="Text color" value={text.color} onChange={(e) => setText({ color: e.target.value }, `color:${text.id}`)} />
            <small className="picker-hint">double-tap text to edit</small>
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
        {manga ? <MangaButtons picker={picker} toggle={toggle} add={add} selected={selected} /> : <>
          <button type="button" aria-expanded={picker === 'frame'} onClick={() => toggle('frame')}>Frame</button>
          {frame && <button type="button" aria-expanded={picker === 'frameStyle'} onClick={() => toggle('frameStyle')}>Frame style</button>}
          <button type="button" aria-expanded={picker === 'sticker'} onClick={() => toggle('sticker')}>Sticker</button>
          <button type="button" aria-expanded={picker === 'tape'} onClick={() => toggle('tape')}>Tape</button>
        </>}
        <button type="button" onClick={() => add(newText())}>Text</button>
        {!manga && <button type="button" aria-expanded={picker === 'bg'} onClick={() => toggle('bg')}>Paper</button>}
        <button type="button" aria-expanded={picker === 'effect'} onClick={() => toggle('effect')}>Effect</button>
        <button type="button" aria-expanded={picker === 'albumFx'} onClick={() => toggle('albumFx')}>Background</button>
        {musicPlaying && <button type="button" className="music-btn on" aria-label="Pause music" title="Pause music" onClick={toggleMusic}>♪</button>}
        {/* One panel for the lettering: typeface, size and color. */}
        {text && (
          <button type="button" aria-expanded={picker === 'font'} onClick={() => toggle('font')}>
            <span className="color-dot" style={{ background: text.color }} aria-hidden />Font
          </button>
        )}
        {crop && selected?.type === 'frame' && selected.mediaId && <button type="button" onClick={crop}>Crop</button>}
        {frame?.mediaId && <button type="button" onClick={() => commit(assignMedia(layout, frame.id, null))}>Remove photo</button>}
        {frame?.frameStyle === 'panel' && <MangaPanelTools panel={frame} layout={layout} commit={commit} editShape={editShape} />}
        {manga && text && <MangaTextTools text={text} layout={layout} commit={commit} />}
        {selected && <button type="button" title="Duplicate (Ctrl+C, Ctrl+V)" onClick={() => add(duplicate(selected))}>⧉ Duplicate</button>}
        {selected && (
          <button type="button" aria-pressed={!!selected.pinned} title={selected.pinned ? 'Unpin to move, resize or rotate again' : 'Lock in place'}
            onClick={() => commit(updateElement(layout, selected.id, { pinned: !selected.pinned }))}>{selected.pinned ? '📌 Unpin' : '📌 Pin'}</button>
        )}
        {/* One way only: unpinning stays per item, so a stray tap can't unlock the whole page. */}
        {layout.elements.some((e) => !e.pinned) && (
          <button type="button" title="Lock every item on this page" onClick={() => commit({ ...layout, elements: layout.elements.map((e) => ({ ...e, pinned: true })) })}>📌 Pin all</button>
        )}
        <span className="sep" />
        <span className="row">
          <button type="button" disabled={!sel} aria-label="Bring forward" title="Bring forward" onClick={() => sel && commit(bringForward(layout, sel))}>↑</button>
          <button type="button" disabled={!sel} aria-label="Send backward" title="Send backward" onClick={() => sel && commit(sendBackward(layout, sel))}>↓</button>
          <button type="button" disabled={!sel} aria-label="Delete" title="Delete" onClick={() => sel && commit(removeElement(layout, sel), null)}>🗑</button>
        </span>
        <span className="sep" />
        <span className="row">
          <button type="button" disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" onClick={undo}>↶</button>
          <button type="button" disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={redo}>↷</button>
        </span>
        {/* Autosave handles normal edits; the button only appears when a save failed, to retry it. */}
        {status === 'error' && <button type="button" className="save-retry" onClick={save}>Retry save</button>}
        <span className="sep" />
        <span className="zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(stepZoom(zoom, -1))}>−</button>
          <button type="button" aria-label={`Fit page (zoom ${Math.round(zoom * 100)}%)`} title="Fit page" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl + wheel)" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(stepZoom(zoom, 1))}>+</button>
        </span>
        <span className={`status status-${status}`} role="status">{statusLabel[status]}</span>
      </div>
    </div>
  );
}
