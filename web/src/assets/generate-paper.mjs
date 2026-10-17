// Pre-renders the seamless paper noise tiles (live SVG filters on page backgrounds are too slow to paint).
// Run in the dev container: node web/src/assets/generate-paper.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = dirname(fileURLToPath(import.meta.url));
// stitchTiles="stitch" makes each tile wrap seamlessly when repeated.
const tile = (size, freq, octaves, seed, rgb, alpha) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/>
  <feColorMatrix values="0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  ${alpha}"/></filter>
  <rect width="100%" height="100%" filter="url(#n)"/></svg>`;
const tiles = {
  'paper-grain': tile(256, '.9', 3, 1, [.3, .23, .15], '.75 0 0 0 -.34'),
  'paper-mottle': tile(256, '.016', 4, 3, [.45, .33, .16], '.5 0 0 0 -.18'),
  'paper-fibers': tile(256, '.06 .8', 2, 9, [.28, .18, .08], '.8 0 0 0 -.4'),
};
for (const [name, svg] of Object.entries(tiles)) {
  await sharp(Buffer.from(svg)).webp({ quality: 70, alphaQuality: 70 }).toFile(join(dir, `${name}.webp`));
}
