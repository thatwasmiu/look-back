import { useEffect, useRef, useState } from 'react';
import type { Crop, MediaDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';
import { BlurImage } from './BlurImage';

type Props = { media: MediaDTO; active: boolean; crop?: Crop };

// Poster until tapped; then HLS (native on Safari, hls.js elsewhere, loaded lazily).
// Any fatal playback error drops back to the poster with a "can't play video" chip.
export function VideoPlayer({ media, active, crop = { x: 0.5, y: 0.5, scale: 1 } }: Props) {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  if (started && (!active || failed)) setStarted(false); // effect cleanup tears down hls
  const ref = useRef<HTMLVideoElement>(null);
  const poster = media.variants?.poster ? mediaUrl(media.variants.poster) : undefined;
  const hlsKey = media.variants?.hls;
  const objectPosition = `${crop.x * 100}% ${crop.y * 100}%`;

  useEffect(() => {
    const video = ref.current;
    if (!started || !video || !hlsKey) return;
    const url = mediaUrl(hlsKey);
    let hls: { destroy(): void } | null = null;
    let cancelled = false;
    const play = () => { video.play().catch(() => {}); };
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      play();
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setFailed(true); return; }
        const h = new Hls();
        hls = h;
        h.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setFailed(true); });
        h.loadSource(url);
        h.attachMedia(video);
        play();
      }, () => { if (!cancelled) setFailed(true); });
    }
    return () => {
      cancelled = true;
      video.pause();
      hls?.destroy();
    };
  }, [started, hlsKey]);

  if (started) {
    // ponytail: pan (object-position) only while playing; zoom would scale native controls out of the frame.
    return <video ref={ref} className="video" poster={poster} style={{ objectPosition }} playsInline controls onError={() => setFailed(true)} />;
  }
  const cover = poster
    ? <BlurImage blurDataUrl={media.blurDataUrl} src={poster} objectPosition={objectPosition} scale={crop.scale} />
    : <div className="slot-paper" />;
  if (failed) return <>{cover}<span className="chip chip-error">can't play video</span></>;
  return (
    <button type="button" className="video-poster" aria-label="Play video" onClick={() => setStarted(true)}>
      {cover}
      <span className="play-badge" aria-hidden>▶</span>
    </button>
  );
}
