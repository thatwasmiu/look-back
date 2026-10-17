import { useEffect, useRef, useState } from 'react';
import type { MediaDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';
import { BlurImage } from './BlurImage';

// Poster until tapped; then HLS (native on Safari, hls.js elsewhere, loaded lazily).
export function VideoPlayer({ media, active }: { media: MediaDTO; active: boolean }) {
  const [started, setStarted] = useState(false);
  if (started && !active) setStarted(false); // flipped away: back to poster, effect cleanup tears down hls
  const ref = useRef<HTMLVideoElement>(null);
  const poster = media.variants?.poster ? mediaUrl(media.variants.poster) : undefined;
  const hlsKey = media.variants?.hls;

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
        if (cancelled || !Hls.isSupported()) return;
        const h = new Hls();
        hls = h;
        h.loadSource(url);
        h.attachMedia(video);
        play();
      });
    }
    return () => {
      cancelled = true;
      video.pause();
      hls?.destroy();
    };
  }, [started, hlsKey]);

  if (started) {
    return <video ref={ref} className="video" poster={poster} playsInline controls />;
  }
  return (
    <button type="button" className="video-poster" aria-label="Play video" onClick={() => setStarted(true)}>
      {poster
        ? <BlurImage blurDataUrl={media.blurDataUrl} src={poster} objectPosition="50% 50%" scale={1} />
        : <div className="slot-paper" />}
      <span className="play-badge" aria-hidden>▶</span>
    </button>
  );
}
