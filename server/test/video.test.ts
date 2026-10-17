import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hlsArgs, probe, processVideo, type ProbeInfo } from '../src/processing/video';
import { absPath } from '../src/storage';

const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const lavfi = (size: string, withAudio = true) =>
  ['-f', 'lavfi', '-i', `testsrc2=s=${size}:d=3:r=15`, ...(withAudio ? ['-f', 'lavfi', '-i', 'sine=d=3'] : [])];
let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'vid-')); });

const info = (o: Partial<ProbeInfo> = {}): ProbeInfo => ({ width: 1920, height: 1080, rotation: 0, durationSec: 3, hasAudio: true, ...o });

describe('hlsArgs', () => {
  it('landscape scales short edge', () => {
    expect(hlsArgs('in.mp4', 'out', info(), [720], 'veryfast').join(' ')).toContain('scale=-2:720');
  });
  it('portrait scales short edge', () => {
    expect(hlsArgs('in.mp4', 'out', info({ width: 1080, height: 1920 }), [720], 'veryfast').join(' ')).toContain('scale=720:-2');
  });
  it('rotated 90 source is treated as portrait', () => {
    expect(hlsArgs('in.mp4', 'out', info({ rotation: -90 }), [720], 'veryfast').join(' ')).toContain('scale=720:-2');
  });
  it('no audio -> no -c:a', () => {
    expect(hlsArgs('in.mp4', 'out', info({ hasAudio: false }), [720], 'veryfast')).not.toContain('-c:a');
  });
  it('never upscales; falls back to source short edge', () => {
    const a = hlsArgs('in.mp4', 'out', info({ width: 640, height: 360 }), [720, 1080], 'veryfast').join(' ');
    expect(a).toContain('scale=-2:360');
    expect(a).not.toContain('720');
  });
});

describe('processVideo', () => {
  it('encodes hls + poster, with audio', async () => {
    const src = join(dir, 'a.mp4');
    ff(...lavfi('640x360'), '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src);
    const r = await processVideo(src, 'v1', dir, 'mp4', [720], 'ultrafast');
    expect([r.width, r.height]).toEqual([640, 360]);
    expect(r.durationSec).toBeCloseTo(3, 0);
    expect(r.blurDataUrl).toMatch(/^data:image\/webp/);
    expect(r.variants).toEqual({ poster: 'v1/poster.webp', hls: 'v1/hls/master.m3u8', original: 'v1/original.mp4' });
    expect(existsSync(absPath(dir, 'v1/poster.webp'))).toBe(true);
    expect(existsSync(absPath(dir, 'v1/original.mp4'))).toBe(true);
    const files = await readdir(absPath(dir, 'v1/hls'));
    expect(files).toContain('master.m3u8');
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true);
    expect(await readFile(absPath(dir, 'v1/hls/master.m3u8'), 'utf8')).toContain('360p.m3u8');
  });

  it('rotation metadata -> portrait output', async () => {
    const src = join(dir, 'rot.mp4');
    // ffmpeg 5.1 only honours rotate= on a stream-copy remux (-display_rotation needs 6.0)
    const plain = join(dir, 'plain.mp4');
    ff(...lavfi('640x360', false), '-c:v', 'libx264', plain);
    ff('-i', plain, '-c', 'copy', '-metadata:s:v', 'rotate=90', src);
    const p = await probe(src);
    expect(Math.abs(p.rotation)).toBe(90);
    const r = await processVideo(src, 'v2', dir, 'mp4', [720], 'ultrafast');
    expect(r.width).toBeLessThan(r.height);
    const seg = (await readdir(absPath(dir, 'v2/hls'))).find((f) => f.endsWith('.ts'))!;
    const s = await probe(absPath(dir, `v2/hls/${seg}`));
    expect(s.width).toBeLessThan(s.height);
  });

  it('10-bit input -> yuv420p output', async () => {
    const src = join(dir, '10.mp4');
    ff(...lavfi('320x180', false), '-c:v', 'libx264', '-pix_fmt', 'yuv420p10le', src);
    await processVideo(src, 'v3', dir, 'mp4', [720], 'ultrafast');
    const seg = (await readdir(absPath(dir, 'v3/hls'))).find((f) => f.endsWith('.ts'))!;
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt',
      '-of', 'csv=p=0', absPath(dir, `v3/hls/${seg}`)]).toString().trim().split('\n')[0];
    expect(out).toBe('yuv420p');
  });

  it('segments are ~4 s regardless of fps', async () => {
    const src = join(dir, 'long.mp4');
    ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=9:r=30', '-c:v', 'libx264', src);
    await processVideo(src, 'v7', dir, 'mp4', [720], 'ultrafast');
    const pl = await readFile(absPath(dir, 'v7/hls/180p.m3u8'), 'utf8');
    const durs = [...pl.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Number(m[1]));
    expect(durs.length).toBeGreaterThanOrEqual(3);
    for (const d of durs.slice(0, -1)) expect(Math.abs(d - 4)).toBeLessThanOrEqual(0.25);
  });

  it('video without audio succeeds', async () => {
    const src = join(dir, 'na.mp4');
    ff(...lavfi('320x180', false), '-c:v', 'libx264', src);
    const r = await processVideo(src, 'v4', dir, 'mp4', [720], 'ultrafast');
    expect(r.height).toBe(180);
  });

  it('rejects non-video input', async () => {
    const src = join(dir, 'x.mp4');
    await writeFile(src, 'not a video');
    await expect(processVideo(src, 'v5', dir, 'mp4', [720], 'ultrafast')).rejects.toThrow();
    const aud = join(dir, 'a.m4a');
    ff('-f', 'lavfi', '-i', 'sine=d=1', aud);
    await expect(processVideo(aud, 'v6', dir, 'mp4', [720], 'ultrafast')).rejects.toThrow(/no video stream/);
  });
});
