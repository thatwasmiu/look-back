import type { FrameEl, PageElement, TextEl } from './layout'
import type { SlotStyle, Template, TemplateAi, TextSlot } from './templates'

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

// AI album: what each page is for, and bubble / narration / sfx boxes that sit inside its panels.
type B = [x: number, y: number, w: number, h: number, rotation?: number]
const MAX: Record<SlotStyle, number> = { plain: 40, speech: 40, thought: 40, shout: 20, narration: 40, sfx: 12 }
// A narration box gets room for two lines: up to 40 characters don't fit on one at caption size.
const at = (style: SlotStyle, [x, y, w, h, r]: B, tail?: TextSlot['tail']): TextSlot =>
  ({ box: [x, y, w, style === 'narration' ? Math.max(h, 0.075) : h, r], style, max: MAX[style], ...(tail ? { tail } : {}) })
const koma = (full - 3 * g) / 4
const MANGA_AI: Record<string, TemplateAi> = {
  'manga-cover': { about: 'Cover: album title over one big panel', stickers: [[0.06, 0.76, 0.18, 0.135, -8], [0.78, 0.035, 0.16, 0.12]] },
  'manga-grid': { about: 'Classic 4-panel grid, a scene told step by step',
    texts: [at('speech', [0.62, 0.06, 0.3, 0.12], 'br'), at('narration', [0.06, 0.675, 0.3, 0.05]), at('speech', [0.6, 0.82, 0.32, 0.11], 'br')],
    stickers: [[0.08, 0.5, 0.14, 0.105, -6]] },
  'manga-slants': { about: 'Four slanted panels, energetic movement',
    texts: [at('shout', [0.07, 0.06, 0.3, 0.16, -4]), at('speech', [0.08, 0.4, 0.36, 0.12]), at('sfx', [0.6, 0.74, 0.32, 0.14, -10])] },
  'manga-splash': { about: 'One huge panel with two insets, a big reveal',
    texts: [at('thought', [0.08, 0.07, 0.4, 0.15]), at('narration', [0.52, 0.9, 0.42, 0.06])] },
  'manga-tall-stack': { about: 'Tall panel beside two stacked, a person and what they see',
    texts: [at('narration', [0.06, 0.05, 0.26, 0.05]), at('thought', [0.45, 0.07, 0.42, 0.15]), at('speech', [0.45, 0.55, 0.42, 0.12])] },
  'manga-columns': { about: 'Two tall columns, two people or two sides',
    texts: [at('thought', [0.08, 0.08, 0.36, 0.15]), at('speech', [0.55, 0.6, 0.36, 0.12], 'br')] },
  'manga-strips': { about: 'Three wide strips, a calm sequence',
    texts: [at('speech', [0.08, 0.07, 0.36, 0.12]), at('sfx', [0.65, 0.42, 0.28, 0.12, 6]), at('speech', [0.55, 0.72, 0.38, 0.12], 'br')] },
  'manga-diagonal': { about: 'Two panels split by a diagonal, a clash or surprise',
    texts: [at('shout', [0.08, 0.06, 0.34, 0.16, -3]), at('sfx', [0.55, 0.62, 0.36, 0.16, -12])] },
  'manga-six': { about: 'Six small panels, many quick moments',
    texts: [at('narration', [0.06, 0.05, 0.4, 0.05]), at('speech', [0.55, 0.36, 0.36, 0.1]), at('speech', [0.08, 0.68, 0.36, 0.1])] },
  'manga-bleed': { about: 'One full-page image, a climax or a view',
    texts: [at('narration', [0.06, 0.88, 0.3, 0.06]), at('sfx', [0.55, 0.1, 0.36, 0.16, -8])] },
  'manga-yonkoma': { about: '4-koma: four stacked panels, a short gag or routine',
    texts: [0, 1, 2, 3].map((i) => at('speech', [0.6, m + i * (koma + g) + 0.015, 0.32, 0.09])) },
  'manga-five-slash': { about: 'Five panels with slants, a lively scene',
    texts: [at('speech', [0.07, 0.06, 0.3, 0.1]), at('narration', [0.06, 0.36, 0.34, 0.05]), at('shout', [0.6, 0.36, 0.32, 0.12, 4]), at('sfx', [0.62, 0.78, 0.28, 0.12, -8])] },
  'manga-inset': { about: 'Big panel with two close-up insets, then one wide panel',
    texts: [at('narration', [0.06, 0.05, 0.36, 0.05]), at('thought', [0.55, 0.07, 0.38, 0.14]), at('speech', [0.55, 0.78, 0.38, 0.12], 'br')] },
  'manga-dialogue': { about: 'Five panels for a conversation between two people',
    texts: [at('speech', [0.07, 0.06, 0.34, 0.1]), at('speech', [0.64, 0.06, 0.3, 0.1], 'br'), at('speech', [0.07, 0.38, 0.3, 0.1]),
      at('speech', [0.6, 0.38, 0.34, 0.1], 'br'), at('narration', [0.06, 0.69, 0.4, 0.05])] },
  'manga-action': { about: 'Three steep slashes, fast action or a rush',
    texts: [at('shout', [0.08, 0.06, 0.34, 0.14, -4]), at('sfx', [0.58, 0.44, 0.34, 0.14, -10]), at('sfx', [0.1, 0.82, 0.3, 0.12, 8])] },
  'manga-flashback': { about: 'A soft round panel in the middle, a memory',
    texts: [at('narration', [0.06, 0.05, 0.4, 0.05]), at('thought', [0.06, 0.82, 0.4, 0.12])] },
  'manga-chapter': { about: 'Chapter opener: chapter title, a wide panel, two small',
    texts: [at('narration', [0.06, 0.21, 0.4, 0.05])] },
  'manga-ending': { about: 'Ending page: a last big panel, a short one, then the end',
    texts: [at('narration', [0.06, 0.05, 0.4, 0.05]), at('speech', [0.55, 0.7, 0.38, 0.12], 'br')] },
}

export const mangaTemplates: Template[] = ([
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
  { id: 'manga-yonkoma', name: '4-koma strip', layout: page([0, 1, 2, 3].map((i) => panel(`p${i}`, [m, m + i * (koma + g), full, koma]))) },
  { id: 'manga-five-slash', name: 'Five with slants', layout: page([
    panel('p1', [m, m, 0.52, 0.28], { shape: [[0, 0], [1, 0], [0.86, 1], [0, 1]] }),
    panel('p2', [0.515, m, 0.445, 0.28], { shape: [[0.17, 0], [1, 0], [1, 1], [0, 1]] }),
    panel('p3', [m, 0.345, full, 0.3]),
    panel('p4', [m, 0.67, 0.445, 0.29], { shape: [[0, 0], [1, 0], [0.83, 1], [0, 1]] }),
    panel('p5', [0.46, 0.67, 0.5, 0.29], { shape: [[0.14, 0], [1, 0], [1, 1], [0, 1]] }),
  ]) },
  { id: 'manga-inset', name: 'Big panel + insets', layout: page([
    panel('p1', [m, m, full, 0.6]),
    panel('p2', [0.08, 0.44, 0.4, 0.22], {}, 2),
    panel('p3', [0.52, 0.44, 0.4, 0.22], {}, 2),
    panel('p4', [m, 0.685, full, 0.275]),
  ]) },
  { id: 'manga-dialogue', name: 'Dialogue', layout: page([
    panel('p1', [m, row(0), 0.55, third]),
    panel('p2', [m + 0.55 + g, row(0), full - 0.55 - g, third]),
    panel('p3', [m, row(1), full - 0.55 - g, third]),
    panel('p4', [m + full - 0.55, row(1), 0.55, third]),
    panel('p5', [m, row(2), full, third]),
  ]) },
  // Two steep diagonals across the page (left 0.44 → right 0.28, left 0.62 → right 0.78), gutter g.
  { id: 'manga-action', name: 'Action slashes', layout: page([
    panel('p1', [m, m, full, 0.3875], { shape: [[0, 0], [1, 0], [1, 0.587], [0, 1]] }),
    panel('p2', [m, 0.2925, full, 0.475], { shape: [[0, 0.337], [1, 0], [1, 1], [0, 0.663]] }),
    panel('p3', [m, 0.6325, full, 0.3275], { shape: [[0, 0], [1, 0.489], [1, 1], [0, 1]] }),
  ]) },
  { id: 'manga-flashback', name: 'Flashback', layout: page([
    panel('p1', [m, m, full, 0.25]),
    panel('p2', [0.2, 0.32, 0.6, 0.45], { border: 'thin', shape: [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]] }),
    panel('p3', [m, 0.8, full, 0.16]),
  ]) },
  { id: 'manga-chapter', name: 'Chapter opener', layout: page([
    title('title', [m, 0.05, full, 0.12], 'Chương 1', 0.08),
    panel('p1', [m, 0.2, full, 0.45]),
    panel('p2', [m, 0.675, half, 0.285]),
    panel('p3', [m + half + g, 0.675, half, 0.285]),
  ]) },
  { id: 'manga-ending', name: 'Ending', layout: page([
    panel('p1', [m, m, full, 0.62]),
    panel('p2', [m, 0.685, full, 0.18]),
    title('end', [0.3, 0.885, 0.4, 0.08], 'HẾT', 0.06),
  ]) },
] satisfies Template[]).map((t) => ({ ...t, ai: MANGA_AI[t.id] }))
