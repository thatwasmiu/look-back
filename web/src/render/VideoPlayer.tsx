import { useEffect, useRef, useState } from 'react';
import type { Crop, MediaDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';
import { BlurImage } from './BlurImage';
import { MediaUnavailable } from './MediaUnavailable';
import { useT } from '../i18n';

type Props = { media: MediaDTO; active: boolean; crop?: Crop; autoPlay?: boolean; trim?: { start: number; end: number } };

// Poster until tapped; then HLS (hls.js, loaded lazily; the browser's own player where hls.js can't run).
// autoPlay (album view): starts by itself while its page is shown — muted and looping, since browsers only allow
// silent autoplay; the native controls unmute it. A tap on the poster still starts it with sound.
// trim: play only start..end — it starts at `start`, and at `end` loops (autoplay) or stops back at `start`.
// Any fatal playback error shows the crying placeholder (MediaUnavailable).
export function VideoPlayer({ media, active, crop = { x: 0.5, y: 0.5, scale: 1 }, autoPlay = false, trim }: Props) {
  const t = useT();
  const [started, setStarted] = useState(false);
  const [silent, setSilent] = useState(false); // started by autoplay
  const [failed, setFailed] = useState(false);
  if (started && (!active || failed)) setStarted(false); // effect cleanup tears down hls
  if (autoPlay && active && !started && !failed) { setStarted(true); setSilent(true); }
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
    video.muted = silent;
    const play = () => { video.play().catch(() => {}); };
    // hls.js wherever it can run (it follows segment redirects to a storage bucket); the browser's own HLS player
    // only where it can't (older iPhones) — built-in players refuse cross-site segment redirects.
    const native = () => {
      if (!video.canPlayType('application/vnd.apple.mpegurl')) { setFailed(true); return; }
      video.src = url;
      play();
    };
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) { native(); return; }
      const h = new Hls();
      hls = h;
      h.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setFailed(true); });
      h.loadSource(url);
      h.attachMedia(video);
      play();
    }, () => { if (!cancelled) native(); });
    return () => {
      cancelled = true;
      video.pause();
      hls?.destroy();
    };
  }, [started, hlsKey]); // `silent` is set together with `started`, so it needs no dependency of its own

  // Trim: jump to the start once the video can seek (and whenever the start moves, e.g. in the Trim panel),
  // and keep playback inside the range.
  const tStart = trim?.start, tEnd = trim?.end;
  useEffect(() => {
    const video = ref.current;
    if (!started || !video || tStart === undefined || tEnd === undefined) return;
    const toStart = () => { video.currentTime = tStart; };
    const onTime = () => {
      const past = video.currentTime >= tEnd;
      if (!past && video.currentTime >= tStart - 0.5) return;
      toStart();
      if (past && !silent) video.pause(); // played with sound: stop at the end of the clip
    };
    if (video.readyState >= 1) toStart();
    video.addEventListener('loadedmetadata', toStart);
    video.addEventListener('timeupdate', onTime);
    return () => { video.removeEventListener('loadedmetadata', toStart); video.removeEventListener('timeupdate', onTime); };
  }, [started, tStart, tEnd, silent]);

  if (started) {
    // ponytail: pan (object-position) only while playing; zoom would scale native controls out of the frame.
    return <video ref={ref} className="video" poster={poster} style={{ objectPosition }} playsInline controls loop={silent && !trim} onError={() => setFailed(true)} />;
  }
  const cover = poster
    ? <BlurImage blurDataUrl={media.blurDataUrl} src={poster} objectPosition={objectPosition} scale={crop.scale} shift={crop} />
    : <div className="slot-paper" />;
  if (failed) return <MediaUnavailable />;
  return (
    <button type="button" className="video-poster" aria-label={t('Play video')} onClick={() => { setSilent(false); setStarted(true); }}>
      {cover}
      <span className="play-badge" aria-hidden>▶</span>
    </button>
  );
}
