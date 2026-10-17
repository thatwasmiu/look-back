import type { MediaDTO, PageDTO } from '@scrapbook/shared';
import { mediaUrl } from '../mediaUrl';

export type PreloadPlan = { now: string[]; soon: string[]; soonHls: string[]; idle: string[] }; // media keys

// <picture> picks display.avif where supported; preload that same file so it isn't fetched twice.
// ponytail: detection is async; a plan made in the first few ms after load uses webp. Fine: an album fetch is slower.
let avif = false;
if (typeof Image !== 'undefined') {
  const probe = new Image();
  probe.onload = () => { avif = probe.width > 0; };
  probe.src = 'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAaQENBpMhAZQmMEwAA0AACQQMkcYIpq';
}

const readyMedia = (page: PageDTO, media: Map<string, MediaDTO>) =>
  page.layout.elements.flatMap((el) => {
    const m = el.type === 'frame' && el.mediaId ? media.get(el.mediaId) : undefined;
    return m?.status === 'ready' && m.variants ? [m] : [];
  });

// What the page itself shows: display image or video poster. Never `original`.
const shown = (m: MediaDTO) => (m.kind === 'video' ? m.variants?.poster : (avif && m.variants?.displayAvif) || m.variants?.display);

export function planPreload(pages: PageDTO[], media: Map<string, MediaDTO>, visible: number[]): PreloadPlan {
  const lo = Math.min(...visible) - 2, hi = Math.max(...visible) + 2;
  const now = new Set<string>(), soon = new Set<string>(), soonHls = new Set<string>(), idle = new Set<string>();
  const seen = new Set<string>(); // media ids already covered by now/soon
  pages.forEach((page, i) => {
    if (!visible.includes(i)) return;
    for (const m of readyMedia(page, media)) { seen.add(m.id); const k = shown(m); if (k) now.add(k); }
  });
  pages.forEach((page, i) => {
    if (visible.includes(i) || i < lo || i > hi) return;
    for (const m of readyMedia(page, media)) {
      seen.add(m.id);
      const k = shown(m);
      if (k && !now.has(k)) soon.add(k);
      if (m.kind === 'video' && m.variants?.hls) soonHls.add(m.variants.hls);
    }
  });
  pages.forEach((page) => {
    for (const m of readyMedia(page, media)) if (!seen.has(m.id) && m.variants?.thumb) idle.add(m.variants.thumb);
  });
  return { now: [...now], soon: [...soon], soonHls: [...soonHls], idle: [...idle] };
}

const decode = (key: string) => {
  const img = new Image();
  img.src = mediaUrl(key);
  return img.decode().catch(() => {}); // a broken image must not stall the queue
};
const whenIdle = (fn: () => void) =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(fn) : setTimeout(fn, 200);

// In-flight image loads are left to finish on abort (the next plan usually wants them); only scheduling stops.
export function runPreload(plan: PreloadPlan, signal: AbortSignal): void {
  const idle = (i: number) => {
    if (signal.aborted || i >= plan.idle.length) return;
    whenIdle(() => { if (!signal.aborted) decode(plan.idle[i]).then(() => idle(i + 1)); });
  };
  Promise.all(plan.now.map(decode)).then(() => {
    if (signal.aborted) return;
    for (const k of plan.soonHls) warmHls(mediaUrl(k), 2, signal).catch(() => {});
    Promise.all(plan.soon.map(decode)).then(() => idle(0));
  });
}

const uris = (playlist: string) => playlist.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

// Pulls master → first variant playlist → first N segments into the HTTP cache, so tap-to-play starts at once.
export async function warmHls(masterUrl: string, segments: number, signal: AbortSignal): Promise<void> {
  const get = async (u: URL) => (await fetch(u.href, { signal })).text();
  const master = new URL(masterUrl, location.href);
  const first = uris(await get(master))[0];
  if (!first) return;
  const variant = new URL(first, master);
  for (const seg of uris(await get(variant)).slice(0, segments)) await get(new URL(seg, variant));
}
