// One-off: npx tsx server/test/fixtures/make-fixtures.ts  (outputs are committed)
import sharp from 'sharp';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const bg = (w: number, h: number) => ({ create: { width: w, height: h, channels: 3 as const, background: '#c0392b' } });

await sharp(bg(400, 300))
  .composite([{ input: { create: { width: 100, height: 100, channels: 3, background: '#2980b9' } }, left: 0, top: 0 }])
  .withMetadata({ orientation: 6, exif: { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 30/1 0/1' } } })
  .jpeg().toFile(`${dir}/rotated.jpg`);
await sharp(bg(300, 200)).png().toFile(`${dir}/small.png`);
