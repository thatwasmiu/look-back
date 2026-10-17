import type { ReactNode } from 'react';
import type { FrameEl, MediaDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';
import { BlurImage } from './BlurImage';
import { VideoPlayer } from './VideoPlayer';

// Deckle edge for 'torn' frames: deterministic jitter so every render (and every frame) matches.
const TORN_CLIP = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 24;
  const pts: string[] = [];
  const j = () => (rnd() * 2.2).toFixed(2);
  for (let i = 0; i < n; i++) pts.push(`${(i / n * 100).toFixed(2)}% ${j()}%`);
  for (let i = 0; i < n; i++) pts.push(`${100 - +j()}% ${(i / n * 100).toFixed(2)}%`);
  for (let i = 0; i < n; i++) pts.push(`${(100 - i / n * 100).toFixed(2)}% ${100 - +j()}%`);
  for (let i = 0; i < n; i++) pts.push(`${j()}% ${(100 - i / n * 100).toFixed(2)}%`);
  return `polygon(${pts.join(',')})`;
})();

type Props = { el: FrameEl; media: MediaDTO | undefined; mode: 'view' | 'edit'; active: boolean };

export function FrameView({ el, media, mode, active }: Props) {
  return (
    <div className={`frame frame-${el.frameStyle}`} data-frame-id={el.id} style={el.frameStyle === 'torn' ? { clipPath: TORN_CLIP } : undefined}>
      <div className="frame-window">{content(el, media, mode, active)}</div>
      {el.frameStyle === 'corners' && ['tl', 'tr', 'bl', 'br'].map((c) => <i key={c} className={`frame-corner frame-corner-${c}`} aria-hidden />)}
    </div>
  );
}

function content(el: FrameEl, m: MediaDTO | undefined, mode: 'view' | 'edit', active: boolean): ReactNode {
  if (!el.mediaId) return mode === 'edit' ? <div className="slot-empty">+ add</div> : <div className="slot-paper" />;
  if (!m) return <div className="slot-paper" />;
  const objectPosition = `${el.crop.x * 100}% ${el.crop.y * 100}%`;
  const v = m.variants;
  if (m.status === 'ready' && m.kind === 'image' && v?.display) {
    return <BlurImage blurDataUrl={m.blurDataUrl} src={mediaUrl(v.display)}
      srcAvif={v.displayAvif && mediaUrl(v.displayAvif)} objectPosition={objectPosition} scale={el.crop.scale} />;
  }
  if (m.status === 'ready' && m.kind === 'video' && v?.hls) {
    if (mode === 'view') return <VideoPlayer media={m} active={active} crop={el.crop} />;
    return <>{poster(m, objectPosition, el.crop.scale)}<span className="play-badge" aria-hidden>▶</span></>;
  }
  // Not ready: blur (and a video poster if the worker made one) — never the display image.
  const chip = m.status === 'failed' ? 'upload failed' : m.status === 'uploading' ? 'uploading…' : 'processing…';
  return (
    <>
      {poster(m, objectPosition, el.crop.scale)}
      <span className={m.status === 'failed' ? 'chip chip-error' : 'chip'}>{chip}</span>
    </>
  );
}

function poster(m: MediaDTO, objectPosition: string, scale: number): ReactNode {
  if (m.kind === 'video' && m.variants?.poster) {
    return <BlurImage blurDataUrl={m.blurDataUrl} src={mediaUrl(m.variants.poster)} objectPosition={objectPosition} scale={scale} />;
  }
  if (m.blurDataUrl) {
    return <div className="blur-image"><div className="blur-layer" aria-hidden style={{ backgroundImage: `url("${m.blurDataUrl}")`, backgroundPosition: objectPosition }} /></div>;
  }
  return <div className="slot-paper" />;
}
