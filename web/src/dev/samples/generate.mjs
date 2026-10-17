// Dev-only: draws the /dev/preview sample media procedurally (no third-party art).
// Run in the dev container: node web/src/dev/samples/generate.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = dirname(fileURLToPath(import.meta.url));
const hills = (n, w, h, colors) => colors.map((c, i) => {
  const base = h * (0.55 + i * 0.12);
  let d = `M0 ${h} L0 ${base}`;
  for (let x = 0; x <= w; x += w / 8) d += ` Q${x + w / 16} ${base - (40 + ((x * 7 + i * 53 + n) % 90))} ${x + w / 8} ${base - ((x * 3 + i * 29) % 40)}`;
  return `<path d="${d} L${w} ${h} Z" fill="${c}"/>`;
}).join('');
const scenes = {
  'sunset-hills': [1200, 900, `<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#f6b37f"/><stop offset=".6" stop-color="#f3d4a6"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#s)"/><circle cx="820" cy="430" r="110" fill="#fff1c9"/>${hills(1, 1200, 900, ['#d98b6f', '#a8705e', '#6e4f4a'])}`],
  'lake-mountains': [1200, 900, `<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#8fb8d8"/><stop offset="1" stop-color="#dfeaf0"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#s)"/><path d="M0 560 L220 260 L380 430 L560 180 L800 470 L960 300 L1200 520 L1200 560 Z" fill="#6f8796"/>
    <path d="M520 230 L560 180 L600 235 L575 225 L560 245 Z M190 300 L220 260 L250 305 Z" fill="#f4f7f8"/>
    <rect y="560" width="1200" height="340" fill="#5d87a3"/><path d="M0 560 L220 760 L380 640 L560 820 L800 630 L960 740 L1200 600 L1200 560 Z" fill="#4f7287" opacity=".7"/>
    <path d="M100 640 h140 M600 700 h220 M300 780 h120" stroke="#cfe0ea" stroke-width="4" opacity=".6"/>`],
  'pine-forest': [900, 1200, `<rect width="900" height="1200" fill="#cfe1d4"/>${[0, 1, 2].map((r) => Array.from({ length: 9 }, (_, i) => {
      const x = i * 110 + (r * 47) % 90 - 40, y = 520 + r * 220, s = 1 + r * 0.45;
      return `<path d="M${x} ${y + 300 * s} L${x + 60 * s} ${y} L${x + 120 * s} ${y + 300 * s} Z" fill="${['#8fb39c', '#5f8a70', '#355945'][r]}"/>`;
    }).join('')).join('')}<rect y="1130" width="900" height="70" fill="#2f4a3a"/>`],
  'beach': [900, 1200, `<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#9ccbe3"/><stop offset="1" stop-color="#e4f1f4"/></linearGradient></defs>
    <rect width="900" height="1200" fill="url(#s)"/><circle cx="660" cy="260" r="70" fill="#fff6d8"/>
    <rect y="560" width="900" height="300" fill="#4fa3b5"/><path d="M0 800 Q 220 760 450 820 T 900 790 L900 1200 L0 1200 Z" fill="#ecd7aa"/>
    <path d="M0 790 Q 220 750 450 810 T 900 780" stroke="#fff" stroke-width="10" fill="none" opacity=".8"/>`],
};

const blur = {};
const blurOf = async (input) => `data:image/webp;base64,${(await sharp(input).resize(20).webp({ quality: 50 }).toBuffer()).toString('base64')}`;
for (const [name, [w, h, body]] of Object.entries(scenes)) {
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).png().toBuffer();
  await sharp(png).webp({ quality: 80 }).toFile(join(dir, `${name}.webp`));
  await sharp(png).avif({ quality: 55 }).toFile(join(dir, `${name}.avif`));
  blur[name] = await blurOf(png);
}

// Short HLS clip. fMP4 segments, not .ts: Vite would try to compile .ts files.
const hls = join(dir, 'hls');
rmSync(hls, { recursive: true, force: true });
mkdirSync(hls);
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'gradients=s=640x480:c0=0xf4a6b8:c1=0x9fc3d9:c2=0xf7d26a:speed=0.03:d=6',
  '-f', 'lavfi', '-i', 'sine=f=330:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-g', '48', '-c:a', 'aac', '-shortest',
  '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4', '-hls_segment_filename', join(hls, '720p_%03d.m4s'), join(hls, '720p.m3u8')]);
writeFileSync(join(hls, 'master.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=640x480\n720p.m3u8\n');
const frame = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-f', 'lavfi', '-i', 'gradients=s=640x480:c0=0xf4a6b8:c1=0x9fc3d9:c2=0xf7d26a:speed=0.03:d=6',
  '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
await sharp(frame).webp({ quality: 80 }).toFile(join(dir, 'poster.webp'));
blur.poster = await blurOf(frame);

writeFileSync(join(dir, 'blur.json'), JSON.stringify(blur, null, 1) + '\n');
