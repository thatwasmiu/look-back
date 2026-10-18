import sharp from 'sharp';
import { copyFile, mkdir } from 'node:fs/promises';
import type { Variants } from '@scrapbook/shared';
import { absPath, keyFor } from '../storage';

export type ProcessResult = {
  width: number | null; height: number | null; durationSec: number | null; blurDataUrl: string | null; variants: Variants;
};

/** Tiny 20px-wide webp as a data URL. Input is auto-rotated; no metadata is written. */
export async function makeBlur(input: Buffer | string): Promise<string> {
  const buf = await sharp(input).rotate().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

/** Auto-rotated webp scaled to fit longEdge (never enlarged). Returns the written size. */
export async function writeWebp(input: Buffer | string, outPath: string, longEdge: number, quality: number) {
  const info = await sharp(input).rotate()
    .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality }).toFile(outPath);
  return { width: info.width, height: info.height };
}

export async function processImage(srcPath: string, mediaId: string, mediaDir: string, ext: string): Promise<ProcessResult> {
  const dir = absPath(mediaDir, mediaId);
  await mkdir(dir, { recursive: true });
  const out = (name: string) => absPath(mediaDir, keyFor(mediaId, name));

  // Header-only probe; throws on undecodable input (upload filetype is client-supplied).
  const meta = await sharp(srcPath).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width)!;
  const height = (swap ? meta.width : meta.height)!;

  // Decode the (possibly 48MP) source once; every derivative comes from this upright buffer.
  const big = await sharp(srcPath).rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 1 }).toBuffer();

  await copyFile(srcPath, out(`original.${ext}`));
  await Promise.all([
    writeWebp(big, out('thumb.webp'), 400, 75),
    writeWebp(big, out('display.webp'), 2048, 82),
    sharp(big).avif({ quality: 55, effort: 4 }).toFile(out('display.avif')),
  ]);

  return {
    width, height, durationSec: null,
    blurDataUrl: await makeBlur(big),
    variants: {
      original: keyFor(mediaId, `original.${ext}`),
      thumb: keyFor(mediaId, 'thumb.webp'),
      display: keyFor(mediaId, 'display.webp'),
      displayAvif: keyFor(mediaId, 'display.avif'),
    },
  };
}
