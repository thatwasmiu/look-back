import type { MediaDTO } from '@scrapbook/shared';
import { VideoPlayer } from '../render/VideoPlayer';
import { useT } from '../i18n';

type Trim = { start: number; end: number };
const MIN_CLIP = 0.5; // seconds
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// Trim a frame's video: Start / End sliders over the video's length, with a muted looping preview of the clip.
// Nothing is re-encoded; the frame just stores the range (null = the whole video).
export function TrimPanel({ media, trim, onChange }: { media: MediaDTO; trim?: Trim; onChange(t: Trim | undefined): void }) {
  const tr = useT();
  const dur = media.durationSec ?? 0;
  if (dur <= MIN_CLIP) return <small className="picker-hint">{tr('The video is too short to trim.')}</small>;
  const t = trim ?? { start: 0, end: dur };
  const set = (next: Trim) => onChange(next.start <= 0 && next.end >= dur ? undefined : next);
  return (
    <div className="trim-panel">
      <div className="trim-preview"><VideoPlayer media={media} active autoPlay trim={t} /></div>
      <label>
        <span>Start {fmt(t.start)}</span>
        <input type="range" aria-label={tr('Trim start')} min={0} max={dur} step={0.1} value={t.start}
          onChange={(e) => set({ ...t, start: Math.min(+e.target.value, t.end - MIN_CLIP) })} />
      </label>
      <label>
        <span>End {fmt(t.end)}</span>
        <input type="range" aria-label={tr('Trim end')} min={0} max={dur} step={0.1} value={t.end}
          onChange={(e) => set({ ...t, end: Math.max(+e.target.value, t.start + MIN_CLIP) })} />
      </label>
      <small className="picker-hint">{fmt(t.end - t.start)} / {fmt(dur)}{trim && <> · <button type="button" className="link-btn" onClick={() => onChange(undefined)}>{tr('Full video')}</button></>}</small>
    </div>
  );
}
