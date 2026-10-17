import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { processImage } from '../src/processing/image';
import { absPath } from '../src/storage';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'img-')); });

describe('processImage', () => {
  it('fixture really has orientation 6 and GPS', async () => {
    const m = await sharp(join(fx, 'rotated.jpg')).metadata();
    expect([m.width, m.height, m.orientation]).toEqual([400, 300, 6]);
    expect(m.exif).toBeDefined();
  });

  it('auto-rotates, strips metadata, writes all variants', async () => {
    const r = await processImage(join(fx, 'rotated.jpg'), 'm1', dir, 'jpg');
    expect([r.width, r.height, r.durationSec]).toEqual([300, 400, null]);
    const d = absPath(dir, 'm1/display.webp');
    const m = await sharp(d).metadata();
    expect(m.orientation).toBeUndefined();
    expect(m.exif).toBeUndefined();
    for (const f of ['original.jpg', 'thumb.webp', 'display.avif']) expect(existsSync(absPath(dir, `m1/${f}`))).toBe(true);
    expect(r.blurDataUrl.startsWith('data:image/webp;base64,')).toBe(true);
    expect(r.blurDataUrl.length).toBeLessThan(2048);
    for (const k of Object.values(r.variants)) expect(k.startsWith('m1/')).toBe(true);
    expect(r.variants.original).toBe('m1/original.jpg');
  });

  it('does not enlarge small images', async () => {
    const r = await processImage(join(fx, 'small.png'), 'm2', dir, 'png');
    expect([r.width, r.height]).toEqual([300, 200]);
    const m = await sharp(absPath(dir, 'm2/display.webp')).metadata();
    expect([m.width, m.height]).toEqual([300, 200]);
  });

  it('rejects non-image files', async () => {
    const p = join(dir, 'bad.jpg');
    await writeFile(p, randomBytes(2000));
    await expect(processImage(p, 'm3', dir, 'jpg')).rejects.toThrow();
  });
});
