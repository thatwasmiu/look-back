import type { FrameEl, PageElement, PageLayout, TapeEl, TextEl } from './layout'
import { mangaTemplates } from './mangaTemplates'
import { STICKER_IDS } from './stickerIds'

// ai: what the AI album generator may do with the page. about: one line on what the page is for. texts: extra text
// boxes it may fill (bubbles, narration, sfx aligned with the panels) after the layout's own text elements.
// stickers: extra sticker spots after the layout's own stickers. A template without `ai` is never offered to it.
export type SlotStyle = 'plain' | 'speech' | 'shout' | 'thought' | 'narration' | 'sfx'
type SlotBox = [x: number, y: number, w: number, h: number, rotation?: number]
export type TextSlot = { box: SlotBox; style: SlotStyle; max: number; tail?: TextEl['tail'] }
export type TemplateAi = { about: string; texts?: TextSlot[]; stickers?: SlotBox[] }
export type Template = { id: string; name: string; layout: PageLayout; ai?: TemplateAi }

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

const INK_LIGHT = '#f5efe4', INK_SOFT = '#cfc6b6';
const booth = (id: string, name: string, elements: PageElement[]): Template[] => [{ id, name, layout: { background: 'paper-black', elements } }];

// What each page is good for, for the AI album prompt. Its texts are the layout's own (title, note).
const SCRAPBOOK_AI: Record<string, TemplateAi> = Object.fromEntries(Object.entries({
  cover: 'Album cover: big title over one photo',
  'one-hero': 'One big photo with a caption, for a key moment',
  'two-tilted': 'Two tilted photos and a short note, a before/after or pair',
  'three-collage': 'Collage of three photos with a title',
  'four-grid-loose': 'Four photos in a loose grid, several small moments',
  'hero-plus-two': 'One big photo above two small ones, no text',
  'video-feature': 'One wide photo or video with title and note',
  memories: 'Two overlapping photos, big title and a note',
  'film-day': 'Two film-strip photos, travel or outing vibe',
  postcard: 'Postcard: three stamp photos, "greetings from" title',
  'sweet-heart': 'Heart photo plus two round ones, love or friendship',
  'old-album': 'Four photos with photo corners, nostalgic',
  vintage: 'Two scalloped photos, old-days mood',
  journal: 'Journal page: three photos, "today" title and note',
  'instant-fan': 'Three instant photos fanned out, a fun group moment',
  'six-grid': 'Six small photos in a grid, a busy day or many steps',
  'round-stickers': 'Four round photos, cute details or faces',
  photobooth: 'Photobooth strip of three photos with title and note',
  'hero-note': 'Tall photo with a long note card, a story moment',
  'tilted-pair': 'Two big tilted photos, a pair or two people',
  journey: 'Journey: four stamp photos along a path, travel steps',
  'quote-photo': 'Big quote with one photo below',
  'the-end': 'Closing page: The End, one heart photo',
  'booth-strips-3': 'Photobooth: two strips of three shots on black, a fun booth moment',
  'booth-strips-4': 'Photobooth: two strips of four shots on black, many poses',
  'booth-big-3': 'Photobooth: one big shot and three small ones on black',
  'booth-grid-4': 'Photobooth: four shots in a 2×2 grid on black',
  'booth-grid-3': 'Photobooth: three shots and a title card in a 2×2 grid on black',
  'booth-pair': 'Photobooth: title on top, two portrait shots side by side',
  'booth-stack': 'Photobooth: two wide shots stacked, title below',
}).map(([id, about]) => [id, { about }]))

export const templates: Template[] = ([
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
  { id: 'six-grid', name: 'Grid of six', layout: { background: 'paper-grid', elements: [
    text('title', [0.1, 0.02, 0.8, 0.08, -1], 'Tiêu đề', 'dancing-script', 0.055),
    ...[0, 1, 2].flatMap((r) => [0, 1].map((c) =>
      frame(`f${r}${c}`, [0.08 + c * 0.46, 0.11 + r * 0.28, 0.38, 0.25, (r + c) % 2 ? 2 : -2], 'plain'))),
  ] } },
  { id: 'round-stickers', name: 'Round photos', layout: { background: 'paper-dots', elements: [
    text('title', [0.1, 0.025, 0.8, 0.08, -2], 'Tiêu đề', 'dancing-script', 0.06, '#7a4a2e'),
    frame('f1', [0.08, 0.12, 0.4, 0.3, -4], 'circle'),
    frame('f2', [0.52, 0.2, 0.4, 0.3, 5], 'circle'),
    frame('f3', [0.1, 0.5, 0.36, 0.27, 3], 'circle'),
    frame('f4', [0.54, 0.58, 0.36, 0.27, -5], 'circle'),
    text('note', [0.08, 0.84, 0.44, 0.08, -2], 'ghi chú…', 'patrick-hand', 0.04),
    sticker('s1', [0.78, 0.86, 0.14, 0.1, 6], 'sparkle'),
  ] } },
  { id: 'photobooth', name: 'Photobooth strip', layout: { background: 'paper-cream', elements: [
    frame('f1', [0.1, 0.08, 0.4, 0.25, -2], 'plain'),
    frame('f2', [0.1, 0.36, 0.4, 0.25, -2], 'plain'),
    frame('f3', [0.1, 0.64, 0.4, 0.25, -2], 'plain'),
    tape('t1', [0.22, 0.06, 0.16, 0.04, -3], 'pink'),
    text('title', [0.56, 0.12, 0.38, 0.14, 3], 'Tiêu đề', 'dancing-script', 0.06, '#7a4a2e'),
    text('note', [0.56, 0.5, 0.36, 0.12, 2], 'ghi chú…', 'patrick-hand', 0.04),
    sticker('s1', [0.62, 0.72, 0.2, 0.15, 6], 'camera'),
  ] } },
  { id: 'hero-note', name: 'Photo + note card', layout: { background: 'paper-kraft', elements: [
    frame('f1', [0.08, 0.07, 0.6, 0.633, -3]),
    tape('t1', [0.28, 0.05, 0.2, 0.045, 4], 'yellow'),
    sticker('s1', [0.74, 0.12, 0.16, 0.12, 8], 'star'),
    text('title', [0.08, 0.78, 0.4, 0.1, -2], 'Tiêu đề', 'dancing-script', 0.055, '#3b2a1a'),
    text('note', [0.5, 0.72, 0.42, 0.18, 3], 'ghi chú…', 'patrick-hand', 0.04, '#3b2a1a'),
  ] } },
  { id: 'tilted-pair', name: 'Tilted pair', layout: { background: 'paper-grid', elements: [
    frame('f1', [0.07, 0.1, 0.5, 0.4125, -7]),
    frame('f2', [0.42, 0.36, 0.5, 0.4125, 6], 'polaroid', 2),
    tape('t1', [0.5, 0.34, 0.18, 0.04, -30], 'mint'),
    text('title', [0.08, 0.8, 0.6, 0.09, -2], 'Tiêu đề', 'dancing-script', 0.055),
    sticker('s1', [0.72, 0.82, 0.16, 0.12, -6], 'heart'),
  ] } },
  { id: 'journey', name: 'Journey', layout: { background: 'paper-cream', elements: [
    text('title', [0.5, 0.04, 0.44, 0.1, -2], 'Hành trình', 'dancing-script', 0.06, '#2f5d7c'),
    frame('f1', [0.07, 0.08, 0.34, 0.26, -4], 'stamp'),
    frame('f2', [0.58, 0.2, 0.34, 0.26, 5], 'stamp'),
    frame('f3', [0.1, 0.45, 0.34, 0.26, 3], 'stamp'),
    frame('f4', [0.56, 0.66, 0.34, 0.26, -4], 'stamp'),
    sticker('s1', [0.44, 0.14, 0.1, 0.1, 0], 'pin'),
    sticker('s2', [0.44, 0.44, 0.14, 0.1, 8], 'arrow'),
    sticker('s3', [0.1, 0.78, 0.18, 0.12, -6], 'plane'),
    text('note', [0.12, 0.9, 0.4, 0.07, -1], 'ghi chú…', 'patrick-hand', 0.04),
  ] } },
  { id: 'quote-photo', name: 'Quote + photo', layout: { background: 'paper-cream', elements: [
    text('title', [0.08, 0.06, 0.84, 0.26, -2], '“Một câu nói…”', 'dancing-script', 0.06, '#7a4a2e'),
    frame('f1', [0.14, 0.36, 0.72, 0.47, 3]),
    tape('t1', [0.4, 0.34, 0.2, 0.045, -3], 'kraft'),
    sticker('s1', [0.78, 0.28, 0.14, 0.1, 8], 'leaf'),
    text('note', [0.3, 0.87, 0.4, 0.07, -1], 'ghi chú…', 'patrick-hand', 0.04),
  ] } },
  { id: 'the-end', name: 'The End', layout: { background: 'paper-kraft', elements: [
    text('title', [0.1, 0.08, 0.8, 0.14, -2], 'The End', 'dancing-script', 0.1, '#3b2a1a'),
    frame('f1', [0.25, 0.3, 0.5, 0.375, 0], 'heart'),
    text('note', [0.2, 0.74, 0.6, 0.08, -1], 'ghi chú…', 'patrick-hand', 0.04, '#3b2a1a'),
    sticker('s1', [0.12, 0.82, 0.14, 0.1, -6], 'sparkle'),
    sticker('s2', [0.74, 0.82, 0.14, 0.1, 6], 'heart'),
  ] } },
  // Photobooth prints (strips and 4R boards): black card, white-bordered shots, white lettering.
  ...booth('booth-strips-3', 'Booth: 2 strips × 3', [
    ...[0.08, 0.53].flatMap((x, s) => [0.05, 0.27, 0.49].map((y, i) => frame(`f${s * 3 + i}`, [x, y, 0.39, 0.2, 0], 'plain'))),
    ...[0.08, 0.53].flatMap((x, s) => [
      text(`title${s}`, [x, 0.72, 0.39, 0.1, 0], 'Tiêu đề', 'dancing-script', 0.05, INK_LIGHT),
      text(`date${s}`, [x, 0.83, 0.39, 0.06, 0], 'dd/mm/yyyy', 'patrick-hand', 0.03, INK_SOFT),
    ]),
  ]),
  ...booth('booth-strips-4', 'Booth: 2 strips × 4', [
    ...[0.08, 0.53].flatMap((x, s) => [0.05, 0.225, 0.4, 0.575].map((y, i) => frame(`f${s * 4 + i}`, [x, y, 0.39, 0.165, 0], 'plain'))),
    ...[0.08, 0.53].flatMap((x, s) => [
      text(`title${s}`, [x, 0.77, 0.39, 0.09, 0], 'Tiêu đề', 'dancing-script', 0.045, INK_LIGHT),
      text(`date${s}`, [x, 0.87, 0.39, 0.06, 0], 'dd/mm/yyyy', 'patrick-hand', 0.03, INK_SOFT),
    ]),
  ]),
  ...booth('booth-big-3', 'Booth: 1 big + 3', [
    frame('f1', [0.06, 0.05, 0.88, 0.5, 0], 'plain'),
    ...[0.06, 0.36, 0.66].map((x, i) => frame(`f${i + 2}`, [x, 0.58, 0.28, 0.2, 0], 'plain')),
    text('title', [0.06, 0.81, 0.6, 0.09, 0], 'Tiêu đề', 'dancing-script', 0.055, INK_LIGHT),
    text('date', [0.66, 0.84, 0.28, 0.06, 0], 'dd/mm/yyyy', 'patrick-hand', 0.03, INK_SOFT),
  ]),
  ...booth('booth-grid-4', 'Booth: 2 × 2', [
    ...[0.05, 0.42].flatMap((y, r) => [0.06, 0.51].map((x, c) => frame(`f${r * 2 + c}`, [x, y, 0.43, 0.34, 0], 'plain'))),
    text('title', [0.06, 0.8, 0.6, 0.1, 0], 'Tiêu đề', 'dancing-script', 0.06, INK_LIGHT),
    text('date', [0.66, 0.84, 0.28, 0.06, 0], 'dd/mm/yyyy', 'patrick-hand', 0.03, INK_SOFT),
  ]),
  ...booth('booth-grid-3', 'Booth: 3 + title card', [
    frame('f1', [0.06, 0.08, 0.43, 0.4, 0], 'plain'),
    frame('f2', [0.51, 0.08, 0.43, 0.4, 0], 'plain'),
    frame('f3', [0.06, 0.51, 0.43, 0.4, 0], 'plain'),
    text('title', [0.53, 0.6, 0.39, 0.14, 0], 'Tiêu đề', 'dancing-script', 0.06, INK_LIGHT),
    text('date', [0.53, 0.76, 0.39, 0.06, 0], 'dd/mm/yyyy', 'patrick-hand', 0.03, INK_SOFT),
  ]),
  ...booth('booth-pair', 'Booth: title + 2', [
    text('title', [0.1, 0.07, 0.8, 0.12, 0], 'Tiêu đề', 'dancing-script', 0.07, INK_LIGHT),
    frame('f1', [0.06, 0.24, 0.43, 0.44, 0], 'plain'),
    frame('f2', [0.51, 0.24, 0.43, 0.44, 0], 'plain'),
    text('date', [0.3, 0.76, 0.4, 0.06, 0], 'dd/mm/yyyy', 'patrick-hand', 0.035, INK_SOFT),
  ]),
  ...booth('booth-stack', 'Booth: 2 stacked', [
    frame('f1', [0.08, 0.05, 0.84, 0.36, 0], 'plain'),
    frame('f2', [0.08, 0.43, 0.84, 0.36, 0], 'plain'),
    text('title', [0.1, 0.81, 0.8, 0.09, 0], 'Tiêu đề', 'dancing-script', 0.055, INK_LIGHT),
    text('date', [0.3, 0.9, 0.4, 0.05, 0], 'dd/mm/yyyy', 'patrick-hand', 0.03, INK_SOFT),
  ]),
] satisfies Template[]).map((t) => ({ ...t, ai: SCRAPBOOK_AI[t.id] }))

// Scrapbook page templates first, then manga page layouts.
export const findTemplate = (id: string): Template | undefined => templates.find((x) => x.id === id) ?? mangaTemplates.find((x) => x.id === id)

export function instantiateTemplate(id: string, newId: () => string): PageLayout {
  const t = findTemplate(id)
  if (!t) throw new Error(`unknown template: ${id}`)
  const layout = structuredClone(t.layout) // deep: nested crop objects must not be shared with the template
  for (const e of layout.elements) e.id = newId()
  return layout
}

// ---- AI album: the text slots and sticker spots of a template, and a page filled from the AI's answer.
const TITLE_MAX = 30, TEXT_MAX = 60
const layoutTextMax = (e: TextEl) => (e.font === 'patrick-hand' && e.size < 0.05 ? TEXT_MAX : TITLE_MAX)

export function textSlots(t: Template): { style: SlotStyle; max: number }[] {
  const own = t.layout.elements.flatMap((e) => (e.type === 'text' ? [{ style: e.textStyle ?? 'plain', max: layoutTextMax(e) }] : []))
  return [...own, ...(t.ai?.texts ?? []).map(({ style, max }) => ({ style, max }))]
}

export const stickerSpotCount = (t: Template): number =>
  t.layout.elements.filter((e) => e.type === 'sticker').length + (t.ai?.stickers?.length ?? 0)

// Lettering by style, as the built-in manga album templates draw it.
function slotText(slot: TextSlot, text: string, id: string): TextEl {
  const [x, y, w, h, rotation = 0] = slot.box
  const sfx = slot.style === 'sfx'
  return {
    type: 'text', id, x, y, w, h, rotation, z: 7, text, textStyle: slot.style,
    font: sfx ? 'bangers' : 'patrick-hand', color: sfx ? '#ffffff' : slot.style === 'plain' ? '#4a3b2c' : '#111111',
    size: sfx ? 0.075 : slot.style === 'narration' ? 0.028 : slot.style === 'plain' ? 0.04 : 0.032,
    ...(slot.style === 'speech' || slot.style === 'thought' ? { tail: slot.tail ?? 'bl' } : {}),
  }
}

// Texts fill the slots in order (cut to the slot's max); a slot with no text is left out, never kept as a
// placeholder. Stickers replace the layout's stickers in order, then fill the extra spots; unknown ids are skipped.
export function fillTemplate(id: string, texts: string[], stickers: string[], newId: () => string): PageLayout {
  const t = findTemplate(id)
  if (!t) throw new Error(`unknown template: ${id}`)
  const layout = instantiateTemplate(id, newId)
  const slots = textSlots(t)
  // Cut by characters, not UTF-16 units: half an emoji is not valid text (Postgres rejects it).
  const clean = (i: number) => Array.from((texts[i] ?? '').trim()).slice(0, slots[i]?.max ?? 0).join('')
  const known = (i: number) => (STICKER_IDS.has(stickers[i]) ? stickers[i] : null)
  let ti = 0, si = 0
  const elements: PageElement[] = []
  for (const e of layout.elements) {
    if (e.type === 'text') {
      const text = clean(ti++)
      if (text) elements.push({ ...e, text })
    } else if (e.type === 'sticker') {
      elements.push({ ...e, stickerId: known(si++) ?? e.stickerId })
    } else elements.push(e)
  }
  for (const slot of t.ai?.texts ?? []) {
    const text = clean(ti++)
    if (text) elements.push(slotText(slot, text, newId()))
  }
  for (const [x, y, w, h, rotation = 0] of t.ai?.stickers ?? []) {
    const stickerId = known(si++)
    if (stickerId) elements.push({ type: 'sticker', id: newId(), x, y, w, h, rotation, z: 8, stickerId })
  }
  return { ...layout, elements }
}

