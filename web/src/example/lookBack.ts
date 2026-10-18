// Built-in example album: a tribute inspired by Tatsuki Fujimoto's manga "Look Back". All artwork is original
// (simple vector scenes in web/public/example/look-back/) — no manga panels, dialogue or character likenesses.
// It is read-only and lives only in the web bundle: not in the database, never editable or deletable.
import type { AlbumBundle, FrameEl, MediaDTO, PageElement, PageLayout, TapeEl, TextEl } from '@scrapbook/shared';

export const EXAMPLE_ALBUM_ID = 'example-look-back';
const ART = '/example/look-back';

const art = (id: string, file: string, portrait = false): MediaDTO => ({
  id, albumId: EXAMPLE_ALBUM_ID, kind: 'image', status: 'ready', width: portrait ? 900 : 1200, height: portrait ? 1200 : 900,
  durationSec: null, blurDataUrl: null, error: null,
  variants: { thumb: `${ART}/${file}`, display: `${ART}/${file}`, original: `${ART}/${file}` },
});
const media: MediaDTO[] = [
  art('lb-cover', 'cover.svg'), art('lb-desk', 'desk-night.svg'), art('lb-snow', 'snow-road.svg'),
  art('lb-4koma', 'four-panel.svg', true), art('lb-desks', 'two-desks.svg'), art('lb-summer', 'summer-fields.svg'),
  art('lb-sakura', 'sakura.svg'), art('lb-sunset', 'sunset-town.svg'), art('lb-door', 'door.svg'),
];

let n = 0;
type Box = [x: number, y: number, w: number, h: number, rotation: number];
const at = ([x, y, w, h, rotation]: Box, z: number) => ({ id: `lb${n++}`, x, y, w, h, rotation, z });
const frame = (b: Box, mediaId: string, frameStyle: FrameEl['frameStyle'] = 'polaroid', z = 1): PageElement =>
  ({ type: 'frame', ...at(b, z), frameStyle, mediaId, crop: { x: 0.5, y: 0.5, scale: 1 } });
const tape = (b: Box, tapeStyle: TapeEl['tapeStyle']): PageElement => ({ type: 'tape', ...at(b, 6), tapeStyle });
const sticker = (b: Box, stickerId: string): PageElement => ({ type: 'sticker', ...at(b, 7), stickerId });
const text = (b: Box, t: string, size: number, color = '#4a3b2c', font: TextEl['font'] = 'dancing-script'): PageElement =>
  ({ type: 'text', ...at(b, 8), text: t, font, size, color });
const effect = (b: Box, e: Extract<PageElement, { type: 'effect' }>['effect']): PageElement => ({ type: 'effect', ...at(b, 9), effect: e });
const page = (background: PageLayout['background'], elements: PageElement[]): PageLayout => ({ background, elements });

const layouts: PageLayout[] = [
  page('paper-kraft', [
    text([0.08, 0.05, 0.84, 0.12, -2], 'Look Back', 0.09, '#2b2238'),
    frame([0.12, 0.2, 0.76, 0.627, -3], 'lb-cover'),
    tape([0.39, 0.18, 0.22, 0.045, 4], 'mint'),
    text([0.12, 0.85, 0.76, 0.07, -1], 'một album tưởng nhớ', 0.04, '#3b2a1a', 'patrick-hand'),
    sticker([0.76, 0.82, 0.13, 0.1, 8], 'star'),
  ]),
  page('paper-cream', [
    text([0.08, 0.035, 0.84, 0.1, -2], 'Bàn vẽ lúc nửa đêm', 0.065, '#2f3d66'),
    frame([0.07, 0.15, 0.62, 0.405, -4], 'lb-desk'),
    tape([0.28, 0.13, 0.22, 0.045, -6], 'yellow'),
    effect([0.12, 0.18, 0.4, 0.3, 0], 'sparkles'),
    frame([0.42, 0.53, 0.5, 0.33, 5], 'lb-4koma', 'plain', 2),
    tape([0.38, 0.53, 0.15, 0.04, -38], 'pink'),
    text([0.06, 0.62, 0.32, 0.12, -3], 'vẽ thêm một trang\nrồi mới ngủ', 0.035, '#4a3b2c', 'patrick-hand'),
    sticker([0.76, 0.13, 0.14, 0.1, 8], 'moon'),
  ]),
  page('paper-grid', [
    text([0.1, 0.04, 0.8, 0.1, -1], 'Con đường tuyết', 0.065, '#3d5a7a'),
    frame([0.08, 0.16, 0.84, 0.548, -2], 'lb-snow', 'plain'),
    tape([0.39, 0.14, 0.22, 0.045, 3], 'kraft'),
    text([0.1, 0.78, 0.55, 0.12, 2], 'dấu chân về nhà', 0.04, '#4a3b2c', 'patrick-hand'),
    sticker([0.72, 0.76, 0.2, 0.12, -6], 'cloud'),
  ]),
  page('paper-cream', [
    frame([0.17, 0.07, 0.66, 0.66, 2], 'lb-4koma', 'kraft-mat'),
    tape([0.42, 0.05, 0.18, 0.04, -4], 'yellow'),
    text([0.12, 0.78, 0.76, 0.1, -2], 'Bốn khung tranh', 0.065, '#7a4a2e'),
    sticker([0.08, 0.84, 0.12, 0.09, -8], 'heart'),
  ]),
  page('paper-dots', [
    text([0.08, 0.04, 0.84, 0.1, -2], 'Hai bàn vẽ cạnh nhau', 0.06, '#7a4a2e'),
    frame([0.07, 0.16, 0.62, 0.465, -3], 'lb-desks', 'double-line'),
    frame([0.55, 0.55, 0.38, 0.38, 6], 'lb-desk', 'corners', 2),
    text([0.08, 0.68, 0.42, 0.14, -3], 'mỗi ngày một chút', 0.04, '#4a3b2c', 'patrick-hand'),
    sticker([0.76, 0.16, 0.14, 0.1, 8], 'arrow'),
  ]),
  page('paper-cream', [
    text([0.08, 0.035, 0.84, 0.1, -2], 'Mùa hè · mùa xuân', 0.06, '#3f6b3a'),
    frame([0.07, 0.15, 0.52, 0.42, -6], 'lb-summer', 'instant-mini'),
    frame([0.42, 0.45, 0.5, 0.42, 6], 'lb-sakura', 'instant-mini', 2),
    tape([0.22, 0.135, 0.16, 0.035, -8], 'mint'),
    tape([0.6, 0.435, 0.16, 0.035, 6], 'pink'),
    effect([0.4, 0.42, 0.55, 0.5, 0], 'petals'),
    sticker([0.1, 0.72, 0.16, 0.12, -6], 'sun'),
  ]),
  page('paper-kraft', [
    text([0.08, 0.04, 0.84, 0.1, -2], 'Hoàng hôn', 0.07, '#3b2a1a'),
    frame([0.07, 0.17, 0.66, 0.33, -3], 'lb-sunset', 'film'),
    frame([0.27, 0.5, 0.66, 0.33, 4], 'lb-door', 'film', 2),
    tape([0.32, 0.155, 0.18, 0.04, 5], 'kraft'),
    text([0.08, 0.86, 0.6, 0.08, -2], 'một tờ giấy dưới cửa', 0.04, '#3b2a1a', 'patrick-hand'),
  ]),
  page('paper-cream', [
    effect([0, 0, 1, 1, 0], 'light-leak'),
    frame([0.15, 0.12, 0.7, 0.5775, -2], 'lb-desk', 'scallop'),
    tape([0.4, 0.105, 0.2, 0.042, 4], 'yellow'),
    text([0.1, 0.72, 0.8, 0.12, -2], 'Nhìn lại', 0.085, '#7a4a2e'),
    text([0.15, 0.84, 0.7, 0.07, 0], 'và tiếp tục vẽ', 0.04, '#4a3b2c', 'patrick-hand'),
    sticker([0.76, 0.86, 0.12, 0.09, 8], 'flower'),
  ]),
];

export const exampleAlbum: AlbumBundle = {
  album: { id: EXAMPLE_ALBUM_ID, title: 'Look Back — a tribute', coverMediaId: 'lb-cover', backgroundEffect: 'snow', backgroundColor: 'night', shareToken: null },
  pages: layouts.map((layout, i) => ({ id: `${EXAMPLE_ALBUM_ID}-p${i}`, albumId: EXAMPLE_ALBUM_ID, position: i, layout })),
  media,
};
export const exampleCover = `${ART}/cover.svg`;
