import sharp from 'sharp';
import { copyFile, mkdir } from 'node:fs/promises';
import type { Variants } from '@scrapbook/shared';
import { absPath, keyFor } from '../storage';

export type ProcessResult = {
  width: number; height: number; durationSec: number | null; blurDataUrl: string; variants: Variants;
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

  // Throws on undecodable input (the upload filetype is client-supplied).
  const { info } = await sharp(srcPath).rotate().toBuffer({ resolveWithObject: true });

  await copyFile(srcPath, out(`original.${ext}`));
  await writeWebp(srcPath, out('thumb.webp'), 400, 75);
  await writeWebp(srcPath, out('display.webp'), 2048, 82);
  await sharp(srcPath).rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .avif({ quality: 55, effort: 4 }).toFile(out('display.avif'));

  return {
    width: info.width, height: info.height, durationSec: null,
    blurDataUrl: await makeBlur(srcPath),
    variants: {
      original: keyFor(mediaId, `original.${ext}`),
      thumb: keyFor(mediaId, 'thumb.webp'),
      display: keyFor(mediaId, 'display.webp'),
      displayAvif: keyFor(mediaId, 'display.avif'),
    },
  };
}
