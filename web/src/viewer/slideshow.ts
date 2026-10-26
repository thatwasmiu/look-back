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

// At time t (s) of an n-picture video: the picture shown, and the next one fading in over it (alpha 0→1) near its end.
export function slideAt(t: number, n: number, slide = SLIDE_SEC, fade = FADE_SEC): { i: number; next: number | null; alpha: number; p: number } {
  const i = Math.min(n - 1, Math.max(0, Math.floor(t / slide)));
  const into = t - i * slide;
  const fading = fade > 0 && i < n - 1 && into > slide - fade;
  return { i, next: fading ? i + 1 : null, alpha: fading ? (into - (slide - fade)) / fade : 0, p: Math.min(1, into / slide) };
}

// Boomerang of a photobooth set: the shots forward then back (no repeated ends), the whole run three times.
export const BOOMERANG_SEC = 0.35;
export function boomerangOrder<T>(shots: T[], loops = 3): T[] {
  const back = shots.slice(1, -1).reverse();
  return Array.from({ length: loops }, () => [...shots, ...back]).flat();
}

const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // a photo kept in a bucket must not taint the canvas (the bucket needs CORS)
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

// A picture: its URL, or its URL plus a canvas filter (a photobooth page's look, e.g. 'grayscale(1)').
export type Picture = string | { src: string; filter?: string };

// slideSec / fadeSec / zoom: the boomerang uses quick cuts (BOOMERANG_SEC, no fade, no zoom). Pictures are drawn
// cover-fit (the page pictures already have the video's size; a shot is cropped to it).
export async function recordSlideshow({ pictures, width, height, musicUrl, name, onProgress, slideSec = SLIDE_SEC, fadeSec = FADE_SEC, zoom = ZOOM }: {
  pictures: Picture[]; width: number; height: number; musicUrl?: string | null; name: string; onProgress?(sec: number, total: number): void;
  slideSec?: number; fadeSec?: number; zoom?: number;
}): Promise<File> {
  const type = pickVideoType();
  if (!type || !pictures.length) throw new Error('video recording not supported');
  const pics = pictures.map((p) => (typeof p === 'string' ? { src: p } : p));
  const cache = new Map<string, Promise<HTMLImageElement>>(); // a boomerang shows each shot several times
  const imgs = await Promise.all(pics.map((p) => { if (!cache.has(p.src)) cache.set(p.src, load(p.src)); return cache.get(p.src)!; }));
  const total = imgs.length * slideSec;
  return recordCanvas({ width, height, seconds: total, musicUrl, name, onProgress, type, frame: (g, t) => {
    const draw = (i: number, p: number, alpha: number) => {
      const img = imgs[i];
      const s = Math.max(width / img.naturalWidth, height / img.naturalHeight) * (1 + zoom * p);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.globalAlpha = alpha;
      g.filter = pics[i].filter ?? 'none';
      g.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      g.filter = 'none';
    };
    const { i, next, alpha, p } = slideAt(t, imgs.length, slideSec, fadeSec);
    draw(i, p, 1);
    if (next !== null) draw(next, 0, alpha);
    g.globalAlpha = 1;
  } });
}

// Record `seconds` of a canvas drawn by frame(g, t) — in real time, with the music under it — as a video file.
export async function recordCanvas({ width, height, seconds, frame, musicUrl, name, onProgress, type = pickVideoType() }: {
  width: number; height: number; seconds: number; frame(g: CanvasRenderingContext2D, t: number): void;
  musicUrl?: string | null; name: string; onProgress?(sec: number, total: number): void; type?: string | null;
}): Promise<File> {
  if (!type) throw new Error('video recording not supported');
  const total = seconds;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  frame(g, 0);

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
      frame(g, Math.min(t, total));
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
