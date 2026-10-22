// Album → video for TikTok / Reels / Stories: the page pictures made for "Share to social", one after another with a
// cross-fade and a slow zoom, recorded in the browser (canvas + MediaRecorder) with the album's music. MP4 where the
// browser can record it (Safari, recent Chrome), WebM otherwise. Records in real time: 3 s per page.
export const SLIDE_SEC = 3;
export const FADE_SEC = 0.6;
const FPS = 30;
const ZOOM = 0.05; // each picture grows by 5 % while it is shown

const TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];

export function pickVideoType(supported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string | null {
  return TYPES.find((t) => supported(t)) ?? null;
}

export const canRecordVideo = () =>
  typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'
  && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!pickVideoType();

// At time t (s) of an n-page video: the page shown, and the next one fading in over it (alpha 0→1) near its end.
export function slideAt(t: number, n: number): { i: number; next: number | null; alpha: number; p: number } {
  const i = Math.min(n - 1, Math.max(0, Math.floor(t / SLIDE_SEC)));
  const into = t - i * SLIDE_SEC;
  const fading = i < n - 1 && into > SLIDE_SEC - FADE_SEC;
  return { i, next: fading ? i + 1 : null, alpha: fading ? (into - (SLIDE_SEC - FADE_SEC)) / FADE_SEC : 0, p: Math.min(1, into / SLIDE_SEC) };
}

const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = fail;
  img.src = src;
});

// Music under the video: the track decoded and played into the recording only (not the speakers), looped, faded out
// over the last second. No music, or it can't be fetched (a bucket without CORS): a silent video.
async function musicTrack(url: string | null | undefined, seconds: number): Promise<{ track: MediaStreamTrack; start(): void; stop(): void } | null> {
  if (!url) return null;
  try {
    const ctx = new AudioContext();
    const data = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = data;
    src.loop = true;
    const gain = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    src.connect(gain).connect(dest);
    return {
      track: dest.stream.getAudioTracks()[0],
      start() {
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(1, now + Math.max(0, seconds - 1));
        gain.gain.linearRampToValueAtTime(0, now + seconds);
        src.start();
      },
      stop() { try { src.stop(); } catch { /* not started */ } void ctx.close(); },
    };
  } catch {
    return null;
  }
}

export async function recordSlideshow({ pictures, width, height, musicUrl, name, onProgress }: {
  pictures: string[]; width: number; height: number; musicUrl?: string | null; name: string; onProgress?(sec: number, total: number): void;
}): Promise<File> {
  const type = pickVideoType();
  if (!type || !pictures.length) throw new Error('video recording not supported');
  const imgs = await Promise.all(pictures.map(load));
  const total = imgs.length * SLIDE_SEC;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const draw = (img: HTMLImageElement, p: number, alpha: number) => {
    const s = 1 + ZOOM * p;
    g.globalAlpha = alpha;
    g.drawImage(img, (width - width * s) / 2, (height - height * s) / 2, width * s, height * s);
  };
  const frame = (t: number) => {
    const { i, next, alpha, p } = slideAt(t, imgs.length);
    draw(imgs[i], p, 1);
    if (next !== null) draw(imgs[next], 0, alpha);
    g.globalAlpha = 1;
  };
  frame(0);

  const stream = canvas.captureStream(FPS);
  const music = await musicTrack(musicUrl, total);
  if (music) stream.addTrack(music.track);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const stopped = new Promise<void>((ok) => { rec.onstop = () => ok(); });

  rec.start(1000);
  music?.start();
  const t0 = performance.now();
  await new Promise<void>((done) => {
    // A timer, not requestAnimationFrame: the recording goes on if the screen dims or the tab is covered.
    const tick = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      frame(Math.min(t, total));
      onProgress?.(Math.min(Math.floor(t), total), total);
      if (t >= total) { clearInterval(tick); done(); }
    }, 1000 / FPS);
  });
  rec.stop();
  await stopped;
  music?.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  const base = (rec.mimeType || type).split(';')[0];
  return new File([new Blob(parts, { type: base })], `${name}.${base.includes('mp4') ? 'mp4' : 'webm'}`, { type: base });
}
