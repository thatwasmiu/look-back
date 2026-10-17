import { afterEach, expect, test, vi } from 'vitest';
import type { MediaDTO, PageDTO, PageElement } from '@scrapbook/shared';
import { planPreload, runPreload, warmHls } from '../src/viewer/preload';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const frame = (id: string, mediaId: string): PageElement => ({
  type: 'frame', id, x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0, z: 1,
  frameStyle: 'plain', mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
});
const image = (id: string, status: MediaDTO['status'] = 'ready'): MediaDTO => ({
  id, albumId: 'a', kind: 'image', status, width: 1, height: 1, durationSec: null, blurDataUrl: null, error: null,
  variants: { thumb: `${id}/thumb.webp`, display: `${id}/display.webp`, displayAvif: `${id}/display.avif`, original: `${id}/original.jpg` },
});
const video = (id: string): MediaDTO => ({
  id, albumId: 'a', kind: 'video', status: 'ready', width: 1, height: 1, durationSec: 5, blurDataUrl: null, error: null,
  variants: { poster: `${id}/poster.webp`, hls: `${id}/hls/master.m3u8`, original: `${id}/original.mp4` },
});

// 10 pages, image p<i> on each; page 4 also has video v4; pages 3 and 7 also hold processing media.
const list = [...Array.from({ length: 10 }, (_, i) => image(`p${i}`)), video('v4'), image('proc3', 'processing'), image('proc7', 'processing')];
const media = new Map(list.map((m) => [m.id, m]));
const pages: PageDTO[] = Array.from({ length: 10 }, (_, i) => ({
  id: `page${i}`, albumId: 'a', position: i,
  layout: { background: 'paper-cream', elements: [
    frame(`f${i}`, `p${i}`),
    ...(i === 4 ? [frame('fv', 'v4')] : []),
    ...(i === 3 ? [frame('fp3', 'proc3')] : []),
    ...(i === 7 ? [frame('fp7', 'proc7')] : []),
    { type: 'tape', id: `t${i}`, x: 0, y: 0, w: 0.1, h: 0.1, rotation: 0, z: 2, tapeStyle: 'yellow' },
  ] },
}));

test('planPreload: now = visible, soon = ±2, idle = thumbs of the rest; never originals or unready media', () => {
  const plan = planPreload(pages, media, [3]);
  expect(plan.now).toEqual(['p3/display.webp']);
  expect([...plan.soon].sort()).toEqual(['p1/display.webp', 'p2/display.webp', 'p4/display.webp', 'p5/display.webp', 'v4/poster.webp']);
  expect(plan.soonHls).toEqual(['v4/hls/master.m3u8']);
  expect([...plan.idle].sort()).toEqual(['p0', 'p6', 'p7', 'p8', 'p9'].map((p) => `${p}/thumb.webp`));
  const all = [...plan.now, ...plan.soon, ...plan.soonHls, ...plan.idle];
  expect(all.some((k) => /original\./.test(k))).toBe(false);
  expect(all.some((k) => k.startsWith('proc'))).toBe(false);
});

test('runPreload: soon waits for now to decode, idle goes one at a time, abort stops the rest', async () => {
  vi.useFakeTimers();
  const requested: string[] = [];
  let release!: () => void;
  const nowDecoded = new Promise<void>((r) => { release = r; });
  vi.stubGlobal('Image', class {
    set src(v: string) { requested.push(v); }
    decode() { return requested.length === 1 ? nowDecoded : Promise.resolve(); }
  });
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  const ac = new AbortController();
  runPreload({ now: ['a/display.webp'], soon: ['b/display.webp'], soonHls: [], idle: ['c/thumb.webp', 'd/thumb.webp'] }, ac.signal);
  expect(requested).toEqual(['/media/a/display.webp']);
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(requested).toEqual(['/media/a/display.webp', '/media/b/display.webp']);
  await vi.advanceTimersByTimeAsync(200);
  expect(requested.at(-1)).toBe('/media/c/thumb.webp');
  ac.abort();
  await vi.advanceTimersByTimeAsync(1000);
  expect(requested).not.toContain('/media/d/thumb.webp');
});

test('warmHls fetches master, first variant playlist, then the first N segments', async () => {
  const body: Record<string, string> = {
    '/media/v/hls/master.m3u8': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2\n1080p.m3u8\n',
    '/media/v/hls/720p.m3u8': '#EXTM3U\n#EXTINF:4,\n720p_0000.ts\n#EXTINF:4,\n720p_0001.ts\n#EXTINF:4,\n720p_0002.ts\n#EXT-X-ENDLIST\n',
  };
  const fetched: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    const path = new URL(u).pathname;
    fetched.push(path);
    return new Response(body[path] ?? 'seg');
  }));
  await warmHls('/media/v/hls/master.m3u8', 2, new AbortController().signal);
  expect(fetched).toEqual(['/media/v/hls/master.m3u8', '/media/v/hls/720p.m3u8', '/media/v/hls/720p_0000.ts', '/media/v/hls/720p_0001.ts']);
});
