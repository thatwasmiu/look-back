import type { FrameEl, PageElement, PageLayout, TapeEl, TextEl } from './layout'

export type Template = { id: string; name: string; layout: PageLayout }

// Geometry is page-relative (page is 3:4). A polaroid's padding is 4% / 4% / 14% of its width, so for a frame
// of page-width w the photo window is landscape 4:3 at h = 0.6525w, square at h = 0.825w, portrait 3:4 at h = 1.055w.
// Ids only need to be unique within a template: instantiateTemplate replaces them.
type Box = [x: number, y: number, w: number, h: number, rotation: number]
const at = (id: string, [x, y, w, h, rotation]: Box, z: number) => ({ id, x, y, w, h, rotation, z })
const frame = (id: string, b: Box, frameStyle: FrameEl['frameStyle'] = 'polaroid', z = 1): PageElement =>
  ({ type: 'frame', ...at(id, b, z), frameStyle, mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } })
const tape = (id: string, b: Box, tapeStyle: TapeEl['tapeStyle']): PageElement => ({ type: 'tape', ...at(id, b, 3), tapeStyle })
const sticker = (id: string, b: Box, stickerId: string): PageElement => ({ type: 'sticker', ...at(id, b, 4), stickerId })
const text = (id: string, b: Box, t: string, font: TextEl['font'], size: number, color = '#4a3b2c'): PageElement =>
  ({ type: 'text', ...at(id, b, 5), text: t, font, size, color })

export const templates: Template[] = [
  { id: 'cover', name: 'Cover', layout: { background: 'paper-kraft', elements: [
    text('title', [0.1, 0.06, 0.8, 0.13, -2], 'Tiêu đề', 'dancing-script', 0.1, '#3b2a1a'),
    frame('f1', [0.15, 0.22, 0.7, 0.5775, -3]),
    tape('t1', [0.4, 0.2, 0.2, 0.045, 4], 'mint'),
    sticker('s1', [0.74, 0.79, 0.16, 0.12, 6], 'flower'),
  ] } },
  { id: 'blank', name: 'Blank', layout: { background: 'paper-cream', elements: [] } },
  { id: 'one-hero', name: 'One photo', layout: { background: 'paper-cream', elements: [
    frame('f1', [0.14, 0.08, 0.72, 0.76, 2]),
    tape('t1', [0.4, 0.06, 0.2, 0.045, -4], 'yellow'),
    text('title', [0.2, 0.86, 0.6, 0.07, -1], 'Tiêu đề', 'dancing-script', 0.05),
    sticker('s1', [0.8, 0.84, 0.13, 0.1, 8], 'heart'),
  ] } },
  { id: 'two-tilted', name: 'Two tilted', layout: { background: 'paper-dots', elements: [
    frame('f1', [0.07, 0.12, 0.6, 0.39, -4]),
    frame('f2', [0.33, 0.52, 0.6, 0.39, 3]),
    tape('t1', [0.27, 0.1, 0.2, 0.045, 5], 'pink'),
    tape('t2', [0.53, 0.5, 0.2, 0.045, -3], 'mint'),
    text('note', [0.06, 0.72, 0.26, 0.1, -3], 'ghi chú', 'patrick-hand', 0.04),
    sticker('s1', [0.76, 0.14, 0.15, 0.11, 6], 'leaf'),
  ] } },
  { id: 'three-collage', name: 'Collage of three', layout: { background: 'paper-grid', elements: [
    frame('f1', [0.07, 0.08, 0.62, 0.405, -3]),
    frame('f2', [0.52, 0.4, 0.42, 0.3465, 5]),
    frame('f3', [0.1, 0.52, 0.4, 0.42, -2]),
    tape('t1', [0.27, 0.06, 0.2, 0.045, 4], 'yellow'),
    tape('t2', [0.63, 0.38, 0.18, 0.04, -6], 'kraft'),
    tape('t3', [0.21, 0.5, 0.18, 0.04, 3], 'pink'),
    text('title', [0.54, 0.77, 0.4, 0.12, -3], 'Tiêu đề', 'dancing-script', 0.05),
    sticker('s1', [0.77, 0.08, 0.15, 0.11, 8], 'star'),
  ] } },
  { id: 'four-grid-loose', name: 'Loose grid of four', layout: { background: 'paper-cream', elements: [
    frame('f1', [0.07, 0.08, 0.4, 0.33, -3]),
    frame('f2', [0.53, 0.11, 0.4, 0.33, 4]),
    frame('f3', [0.07, 0.48, 0.4, 0.33, 2]),
    frame('f4', [0.53, 0.51, 0.4, 0.33, -4]),
    tape('t1', [0.19, 0.06, 0.16, 0.04, 5], 'pink'),
    tape('t2', [0.65, 0.09, 0.16, 0.04, -4], 'mint'),
    tape('t3', [0.65, 0.49, 0.16, 0.04, 3], 'yellow'),
    text('title', [0.07, 0.85, 0.5, 0.08, -2], 'Tiêu đề', 'dancing-script', 0.05),
    sticker('s1', [0.79, 0.85, 0.12, 0.09, -6], 'butterfly'),
  ] } },
  { id: 'hero-plus-two', name: 'Hero plus two', layout: { background: 'paper-kraft', elements: [
    frame('f1', [0.11, 0.08, 0.78, 0.509, -2]),
    frame('f2', [0.08, 0.63, 0.36, 0.297, 4]),
    frame('f3', [0.56, 0.6, 0.36, 0.297, -3]),
    tape('t1', [0.39, 0.06, 0.22, 0.045, 3], 'mint'),
    tape('t2', [0.17, 0.61, 0.18, 0.04, -5], 'yellow'),
    tape('t3', [0.65, 0.58, 0.18, 0.04, 4], 'pink'),
  ] } },
  { id: 'video-feature', name: 'Video feature', layout: { background: 'paper-grid', elements: [
    text('title', [0.1, 0.05, 0.8, 0.09, -1], 'Tiêu đề', 'dancing-script', 0.055),
    frame('f1', [0.08, 0.18, 0.84, 0.548, -2]),
    tape('t1', [0.39, 0.16, 0.22, 0.045, 3], 'kraft'),
    text('note', [0.1, 0.78, 0.5, 0.1, 2], 'ghi chú', 'patrick-hand', 0.04),
    sticker('s1', [0.72, 0.77, 0.18, 0.14, -6], 'camera'),
  ] } },
  // ---- "Đà Lạt" style: big handwritten title, overlapping tilted photos, tape across corners, a note, a few stickers.
  { id: 'memories', name: 'Memories', layout: { background: 'paper-cream', elements: [
    text('title', [0.08, 0.035, 0.84, 0.1, -2], 'Tiêu đề ✿', 'dancing-script', 0.075, '#7a4a2e'),
    frame('f1', [0.07, 0.15, 0.62, 0.405, -4]),
    frame('f2', [0.4, 0.5, 0.53, 0.346, 5], 'polaroid', 2),
    tape('t1', [0.28, 0.13, 0.22, 0.045, -6], 'yellow'),
    tape('t2', [0.35, 0.5, 0.16, 0.04, -38], 'pink'),
    tape('t3', [0.82, 0.49, 0.15, 0.04, 40], 'pink'),
    text('note', [0.06, 0.6, 0.32, 0.1, -3], 'ghi chú…', 'patrick-hand', 0.04),
    sticker('s1', [0.76, 0.13, 0.15, 0.11, 8], 'heart'),
    sticker('s2', [0.08, 0.8, 0.15, 0.11, -6], 'flower'),
    sticker('s3', [0.25, 0.85, 0.08, 0.06, 0], 'star'),
  ] } },
  { id: 'film-day', name: 'Film day', layout: { background: 'paper-kraft', elements: [
    text('title', [0.08, 0.04, 0.84, 0.1, -2], 'Một ngày', 'dancing-script', 0.07, '#3b2a1a'),
    frame('f1', [0.07, 0.17, 0.66, 0.33, -3], 'film'),
    frame('f2', [0.27, 0.47, 0.66, 0.33, 4], 'film', 2),
    tape('t1', [0.32, 0.155, 0.18, 0.04, 5], 'kraft'),
    sticker('s1', [0.73, 0.17, 0.2, 0.1, 8], 'ticket'),
    sticker('s2', [0.08, 0.6, 0.15, 0.11, -6], 'plane'),
    text('note', [0.08, 0.84, 0.6, 0.08, -2], 'ghi chú…', 'patrick-hand', 0.04, '#3b2a1a'),
  ] } },
  { id: 'postcard', name: 'Postcard', layout: { background: 'paper-cream', elements: [
    text('title', [0.1, 0.035, 0.8, 0.1, -2], 'Gửi từ …', 'dancing-script', 0.07, '#7a4a2e'),
    frame('f1', [0.08, 0.15, 0.58, 0.5, -3], 'stamp'),
    frame('f2', [0.6, 0.48, 0.32, 0.28, 6], 'stamp', 2),
    frame('f3', [0.12, 0.68, 0.3, 0.26, -5], 'stamp', 2),
    tape('t1', [0.26, 0.13, 0.2, 0.042, 4], 'mint'),
    sticker('s1', [0.72, 0.17, 0.2, 0.15, -6], 'plane'),
    sticker('s2', [0.66, 0.8, 0.2, 0.12, 4], 'cloud'),
    text('note', [0.46, 0.88, 0.48, 0.07, -2], 'ghi chú…', 'patrick-hand', 0.04),
  ] } },
  { id: 'sweet-heart', name: 'Sweet heart', layout: { background: 'paper-dots', elements: [
    text('title', [0.1, 0.035, 0.8, 0.1, -2], 'Thương ♡', 'dancing-script', 0.075, '#a33a2a'),
    frame('f1', [0.18, 0.16, 0.64, 0.48, 0], 'heart'),
    frame('f2', [0.06, 0.64, 0.3, 0.225, -6], 'circle', 2),
    frame('f3', [0.64, 0.66, 0.3, 0.225, 6], 'circle', 2),
    sticker('s1', [0.4, 0.73, 0.18, 0.135, 6], 'flower'),
    sticker('s2', [0.78, 0.13, 0.14, 0.1, -8], 'butterfly'),
    text('note', [0.3, 0.88, 0.4, 0.07, -2], 'ghi chú…', 'patrick-hand', 0.04),
  ] } },
  { id: 'old-album', name: 'Old album', layout: { background: 'paper-kraft', elements: [
    frame('f1', [0.08, 0.08, 0.4, 0.3, -2], 'corners'),
    frame('f2', [0.52, 0.11, 0.4, 0.3, 3], 'corners'),
    frame('f3', [0.08, 0.46, 0.4, 0.3, 2], 'corners'),
    frame('f4', [0.52, 0.49, 0.4, 0.3, -3], 'corners'),
    text('title', [0.08, 0.82, 0.56, 0.1, -2], 'Album cũ', 'dancing-script', 0.065, '#3b2a1a'),
    sticker('s1', [0.74, 0.82, 0.14, 0.1, 8], 'leaf'),
  ] } },
  { id: 'vintage', name: 'Vintage', layout: { background: 'paper-cream', elements: [
    frame('f1', [0.08, 0.07, 0.56, 0.5, -4], 'scallop'),
    frame('f2', [0.48, 0.48, 0.44, 0.4, 5], 'scallop', 2),
    tape('t1', [0.25, 0.055, 0.2, 0.042, 5], 'kraft'),
    tape('t2', [0.6, 0.47, 0.18, 0.04, -4], 'yellow'),
    text('title', [0.06, 0.62, 0.4, 0.12, -4], 'Ngày xưa', 'dancing-script', 0.065, '#7a4a2e'),
    sticker('s1', [0.12, 0.78, 0.16, 0.12, -6], 'coffee'),
    sticker('s2', [0.74, 0.12, 0.14, 0.1, 8], 'star'),
  ] } },
  { id: 'journal', name: 'Journal', layout: { background: 'paper-grid', elements: [
    frame('f1', [0.07, 0.07, 0.52, 0.44, -3], 'kraft-mat'),
    frame('f2', [0.46, 0.42, 0.46, 0.38, 4], 'double-line', 2),
    frame('f3', [0.08, 0.6, 0.34, 0.3, -2], 'doodle'),
    tape('t1', [0.24, 0.055, 0.18, 0.04, -4], 'yellow'),
    text('title', [0.62, 0.1, 0.32, 0.12, 4], 'Hôm nay', 'dancing-script', 0.06, '#2f5d7c'),
    text('note', [0.46, 0.84, 0.46, 0.08, -2], 'ghi chú…', 'patrick-hand', 0.04),
    sticker('s1', [0.7, 0.26, 0.16, 0.12, 6], 'arrow'),
  ] } },
  { id: 'instant-fan', name: 'Instant fan', layout: { background: 'paper-dots', elements: [
    text('title', [0.1, 0.05, 0.8, 0.1, -2], 'Tiêu đề', 'dancing-script', 0.07, '#7a4a2e'),
    frame('f1', [0.07, 0.24, 0.38, 0.4, -7], 'instant-mini'),
    frame('f2', [0.31, 0.21, 0.38, 0.4, 0], 'instant-mini', 2),
    frame('f3', [0.55, 0.24, 0.38, 0.4, 7], 'instant-mini', 3),
    tape('t1', [0.18, 0.225, 0.14, 0.035, -8], 'pink'),
    tape('t2', [0.43, 0.195, 0.14, 0.035, 3], 'yellow'),
    tape('t3', [0.68, 0.225, 0.14, 0.035, 8], 'mint'),
    sticker('s1', [0.12, 0.74, 0.18, 0.135, -6], 'sun'),
    sticker('s2', [0.68, 0.76, 0.22, 0.13, 4], 'cloud'),
    text('note', [0.3, 0.8, 0.4, 0.08, -1], 'ghi chú…', 'patrick-hand', 0.04),
  ] } },
]

export function instantiateTemplate(id: string, newId: () => string): PageLayout {
  const t = templates.find((x) => x.id === id)
  if (!t) throw new Error(`unknown template: ${id}`)
  const layout = structuredClone(t.layout) // deep: nested crop objects must not be shared with the template
  for (const e of layout.elements) e.id = newId()
  return layout
}
