// Dev-only visual check of PageRenderer (route /dev/preview, registered only when import.meta.env.DEV).
// Sample files live in ./samples; keys "dev-samples/<file>" go through mediaUrl() → /media/dev-samples/<file>,
// which the Vite dev proxy rewrites to /src/dev/samples/<file> (see vite.config.ts) instead of the API.
import type { FrameEl, MediaDTO, PageElement, PageLayout } from '@scrapbook/shared';
import { PageRenderer } from '../render/PageRenderer';
import blur from './samples/blur.json';

const img = (id: string, name: keyof typeof blur, over: Partial<MediaDTO> = {}): MediaDTO => ({
  id, albumId: 'dev', kind: 'image', status: 'ready', width: 1200, height: 900, durationSec: null, error: null,
  blurDataUrl: blur[name],
  variants: { display: `dev-samples/${name}.webp`, displayAvif: `dev-samples/${name}.avif`, original: `dev-samples/${name}.webp` },
  ...over,
});
export const media = new Map<string, MediaDTO>(([
  img('sunset', 'sunset-hills'), img('lake', 'lake-mountains'), img('pine', 'pine-forest'), img('beach', 'beach'),
  img('processing', 'beach', { status: 'processing', variants: null }),
  img('failed', 'beach', { status: 'failed', blurDataUrl: null, variants: null, error: 'ffmpeg exited 1' }),
  {
    id: 'video', albumId: 'dev', kind: 'video', status: 'ready', width: 640, height: 480, durationSec: 6, error: null,
    blurDataUrl: blur.poster,
    variants: { poster: 'dev-samples/poster.webp', hls: 'dev-samples/hls/master.m3u8', original: 'dev-samples/poster.webp' },
  },
] satisfies MediaDTO[]).map((m) => [m.id, m]));

let n = 0;
const g = (x: number, y: number, w: number, h: number, rotation: number, z: number) => ({ id: `e${n++}`, x, y, w, h, rotation, z });
const frame = (geo: ReturnType<typeof g>, frameStyle: FrameEl['frameStyle'], mediaId: string | null, cx = 0.5, cy = 0.5, scale = 1): PageElement =>
  ({ type: 'frame', ...geo, frameStyle, mediaId, crop: { x: cx, y: cy, scale } });
const tape = (geo: ReturnType<typeof g>, tapeStyle: 'yellow' | 'pink' | 'mint' | 'kraft'): PageElement => ({ type: 'tape', ...geo, tapeStyle });
const sticker = (geo: ReturnType<typeof g>, stickerId: string): PageElement => ({ type: 'sticker', ...geo, stickerId });
const text = (geo: ReturnType<typeof g>, t: string, font: 'dancing-script' | 'patrick-hand', size: number, color = '#4a3b2c'): PageElement =>
  ({ type: 'text', ...geo, text: t, font, size, color });

export const pages: { label: string; mode: 'view' | 'edit'; layout: PageLayout }[] = [
  { label: 'paper-cream · polaroid · yellow/pink tape', mode: 'view', layout: { background: 'paper-cream', elements: [
    text(g(0.08, 0.035, 0.84, 0.1, -2, 5), 'Đà Lạt mùa hè ✿', 'dancing-script', 0.075, '#7a4a2e'),
    frame(g(0.07, 0.15, 0.62, 0.4, -4, 1), 'polaroid', 'sunset'),
    tape(g(0.28, 0.13, 0.22, 0.045, -6, 3), 'yellow'),
    frame(g(0.42, 0.5, 0.52, 0.34, 5, 2), 'polaroid', 'lake', 0.5, 0.6, 1.2),
    tape(g(0.36, 0.5, 0.16, 0.04, -38, 4), 'pink'),
    tape(g(0.84, 0.52, 0.16, 0.04, 40, 4), 'pink'),
    text(g(0.04, 0.6, 0.38, 0.14, -5, 5), 'sáng sớm sương mù,\ncà phê nóng', 'patrick-hand', 0.032),
    sticker(g(0.06, 0.77, 0.2, 0.15, -10, 6), 'flower'),
    sticker(g(0.76, 0.12, 0.17, 0.13, 12, 6), 'heart'),
    sticker(g(0.28, 0.82, 0.12, 0.09, 8, 6), 'star'),
  ] } },
  { label: 'paper-kraft · torn/plain · video · mint/kraft tape', mode: 'view', layout: { background: 'paper-kraft', elements: [
    frame(g(0.06, 0.06, 0.5, 0.48, 3, 1), 'torn', 'pine'),
    frame(g(0.52, 0.1, 0.42, 0.3, -6, 2), 'plain', 'beach'),
    tape(g(0.64, 0.085, 0.18, 0.04, 4, 3), 'mint'),
    frame(g(0.3, 0.5, 0.56, 0.36, -3, 2), 'polaroid', 'video'),
    tape(g(0.45, 0.485, 0.24, 0.045, 2, 3), 'kraft'),
    text(g(0.36, 0.875, 0.5, 0.06, -3, 5), 'thác Datanla', 'dancing-script', 0.045, '#fdf6e6'),
    sticker(g(0.06, 0.58, 0.2, 0.15, -12, 6), 'camera'),
    sticker(g(0.04, 0.78, 0.28, 0.17, 8, 6), 'ticket'),
    sticker(g(0.8, 0.42, 0.16, 0.12, 10, 6), 'coffee'),
    sticker(g(0.78, 0.84, 0.16, 0.12, -8, 6), 'plane'),
  ] } },
  { label: 'paper-grid · processing · failed · empty (view)', mode: 'view', layout: { background: 'paper-grid', elements: [
    text(g(0.1, 0.03, 0.8, 0.08, 1, 5), 'Weekend notes', 'patrick-hand', 0.055, '#3d5a7a'),
    frame(g(0.08, 0.13, 0.46, 0.3, -3, 1), 'polaroid', 'processing'),
    frame(g(0.5, 0.36, 0.44, 0.29, 4, 1), 'plain', 'failed'),
    frame(g(0.1, 0.62, 0.42, 0.28, 2, 1), 'polaroid', null),
    tape(g(0.22, 0.115, 0.18, 0.04, -3, 3), 'yellow'),
    tape(g(0.62, 0.345, 0.18, 0.04, 5, 3), 'kraft'),
    sticker(g(0.66, 0.1, 0.22, 0.17, 0, 6), 'sun'),
    sticker(g(0.62, 0.72, 0.16, 0.12, -14, 6), 'moon'),
    sticker(g(0.74, 0.8, 0.22, 0.13, 6, 6), 'cloud'),
    sticker(g(0.4, 0.89, 0.1, 0.075, 0, 6), 'nope-unknown'),
  ] } },
  { label: 'paper-dots · edit mode · empty slots', mode: 'edit', layout: { background: 'paper-dots', elements: [
    frame(g(0.08, 0.06, 0.5, 0.33, -3, 1), 'polaroid', null),
    frame(g(0.5, 0.3, 0.42, 0.28, 5, 1), 'torn', null),
    frame(g(0.1, 0.56, 0.5, 0.33, 2, 1), 'plain', 'sunset', 0.3, 0.5, 1.5),
    tape(g(0.2, 0.045, 0.2, 0.042, -4, 3), 'pink'),
    tape(g(0.24, 0.545, 0.2, 0.042, 3, 3), 'mint'),
    sticker(g(0.7, 0.06, 0.2, 0.15, 14, 6), 'leaf'),
    sticker(g(0.62, 0.62, 0.22, 0.15, -6, 6), 'arrow'),
    sticker(g(0.72, 0.7, 0.2, 0.15, 10, 6), 'butterfly'),
    text(g(0.56, 0.9, 0.4, 0.06, -4, 5), 'ghi chú ở đây…', 'dancing-script', 0.04),
  ] } },
];

export default function Preview() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
      {pages.map((p) => (
        <figure key={p.label} style={{ margin: 0 }}>
          <PageRenderer layout={p.layout} media={media} mode={p.mode} />
          <figcaption style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{p.label}</figcaption>
        </figure>
      ))}
    </main>
  );
}
