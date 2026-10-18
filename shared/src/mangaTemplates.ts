import type { FrameEl, PageElement, TextEl } from './layout'
import type { Template } from './templates'

// Manga page layouts: panels (frames with frameStyle 'panel') on white paper. Page is 3:4; margin 0.04,
// gutter 0.025. Slanted panels use `shape` (polygon within the box); boxes of neighbouring slanted panels overlap
// only in the thin band their slant needs. Ids only need to be unique within a layout.
type Box = [x: number, y: number, w: number, h: number]
const panel = (id: string, [x, y, w, h]: Box, extra: Partial<FrameEl> = {}, z = 1): PageElement => ({
  type: 'frame', id, x, y, w, h, rotation: 0, z, frameStyle: 'panel', mediaId: null,
  crop: { x: 0.5, y: 0.5, scale: 1 }, border: 'normal', ...extra,
})
const m = 0.04, g = 0.025, full = 1 - 2 * m
const third = (full - 2 * g) / 3, half = (full - g) / 2
const row = (i: number) => m + i * (third + g)
const page = (elements: PageElement[]) => ({ background: 'paper-white' as const, elements })
const title = (id: string, [x, y, w, h]: Box, text: string, size: number, extra: Partial<TextEl> = {}): PageElement =>
  ({ type: 'text', id, x, y, w, h, rotation: 0, z: 3, text, font: 'bangers', color: '#111111', size, ...extra })

export const mangaTemplates: Template[] = [
  // Like the scrapbook cover: the album's title over one big image. New manga albums start with it.
  { id: 'manga-cover', name: 'Cover', layout: page([
    title('title', [m, m, full, 0.13], 'Tiêu đề', 0.1),
    panel('p1', [m, 0.19, full, 0.7]),
    title('vol', [0.62, 0.9, 0.34, 0.06], 'Tập 1', 0.035, { font: 'patrick-hand', textStyle: 'narration' }),
  ]) },
  { id: 'manga-grid', name: 'Classic grid', layout: page([
    panel('p1', [m, row(0), full, third]),
    panel('p2', [m, row(1), half, third]),
    panel('p3', [m + half + g, row(1), half, third]),
    panel('p4', [m, row(2), full, third]),
  ]) },
  { id: 'manga-slants', name: 'Dynamic slants', layout: page([
    panel('p1', [m, m, full, 0.34], { shape: [[0, 0], [1, 0], [1, 0.82], [0, 1]] }),
    panel('p2', [m, 0.355, 0.52, 0.31], { shape: [[0, 0.1], [1, 0.02], [0.86, 1], [0, 1]] }),
    panel('p3', [0.515, 0.355, 0.445, 0.31], { shape: [[0.17, 0.02], [1, 0], [1, 1], [0, 1]] }),
    panel('p4', [m, 0.69, full, 0.27], { shape: [[0, 0.1], [1, 0], [1, 1], [0, 1]] }),
  ]) },
  { id: 'manga-splash', name: 'Splash + insets', layout: page([
    panel('p1', [m, m, full, full]),
    panel('p2', [0.54, 0.07, 0.38, 0.26], {}, 2),
    panel('p3', [0.08, 0.64, 0.4, 0.3], {}, 2),
  ]) },
  { id: 'manga-tall-stack', name: 'Tall + stacked', layout: page([
    panel('p1', [m, m, 0.3, full]),
    panel('p2', [m + 0.3 + g, m, full - 0.3 - g, half]),
    panel('p3', [m + 0.3 + g, m + half + g, full - 0.3 - g, half]),
  ]) },
  { id: 'manga-columns', name: 'Two tall columns', layout: page([
    panel('p1', [m, m, half, full]),
    panel('p2', [m + half + g, m, half, full]),
  ]) },
  { id: 'manga-strips', name: 'Three horizontal strips', layout: page([0, 1, 2].map((i) => panel(`p${i}`, [m, row(i), full, third]))) },
  { id: 'manga-diagonal', name: 'Diagonal split', layout: page([
    panel('p1', [m, m, full, 0.52], { shape: [[0, 0], [1, 0], [1, 0.78], [0, 1]] }),
    panel('p2', [m, 0.44, full, 0.52], { shape: [[0, 0.24], [1, 0.02], [1, 1], [0, 1]] }),
  ]) },
  { id: 'manga-six', name: 'Six-panel grid', layout: page([0, 1, 2].flatMap((r) => [0, 1].map((c) =>
    panel(`p${r}${c}`, [m + c * (half + g), row(r), half, third])))) },
  { id: 'manga-bleed', name: 'Full-bleed single panel', layout: page([panel('p1', [0, 0, 1, 1], { border: 'none' })]) },
]
