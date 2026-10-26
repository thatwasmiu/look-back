// Edits of a space (a space album's one page, layout.space): its length, its shape, and arranging photos on it.
// Items are in tile units (a tile is one 3:4 page): x, w in tile widths; y, h in tile heights.
import { MAX_TILES, type FrameEl, type PageLayout, type SpaceShape } from '@scrapbook/shared';

const along = (l: PageLayout) => (l.space?.shape === 'horizontal' ? 'cols' : 'rows');
// How far the items reach along the space (in tiles), so it is never made shorter than its content.
const reach = (l: PageLayout) => Math.max(0, ...l.elements.map((e) => (along(l) === 'cols' ? e.x + e.w : e.y + e.h)));
export const minLength = (l: PageLayout) => Math.max(1, Math.ceil(reach(l) - 0.001));

// Longer / Shorter: a tile more or less along the space; never past MAX_TILES, never cutting off an item.
export function resizeSpace(l: PageLayout, delta: number): PageLayout {
  const s = l.space;
  if (!s) return l;
  const k = along(l);
  const next = Math.min(MAX_TILES, Math.max(minLength(l), s[k] + delta));
  return next === s[k] ? l : { ...l, space: { ...s, [k]: next } };
}

// Vertical ↔ horizontal: tile i of the wall becomes tile i of the strip (and back); items keep their place in it.
export function setShape(l: PageLayout, shape: Extract<SpaceShape, 'vertical' | 'horizontal'>): PageLayout {
  const s = l.space;
  if (!s || s.shape === shape) return l;
  const toStrip = shape === 'horizontal';
  const len = toStrip ? s.rows : s.cols;
  // An item that hung over the edge of its tile is pulled back inside the strip (a strip is one tile tall, a wall one
  // tile wide), so nothing ends up cut off.
  const inside = (v: number, size: number) => Math.min(Math.max(0, v), Math.max(0, 1 - size));
  const elements = l.elements.map((e) => {
    const k = Math.min(len - 1, Math.max(0, Math.floor(toStrip ? e.y : e.x)));
    return toStrip ? { ...e, x: e.x + k, y: inside(e.y - k, e.h) } : { ...e, x: inside(e.x - k, e.w), y: e.y + k };
  });
  return { ...l, elements, space: { shape, cols: toStrip ? len : 1, rows: toStrip ? 1 : len } };
}

// A repeatable 0..1 from a string (the photo's id): arranging twice gives the same picture.
const seeded = (s: string, salt: number) => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// 🧩 Arrange: the photos not on the space yet go after what is there — rows down a wall, columns along a strip — as
// a neat Grid (square photos, thin white frames) or a Scatter (tilted polaroids, a little jumbled). The space grows to
// fit (up to MAX_TILES; what doesn't fit is left out). Existing items stay where they are.
export function arrange(l: PageLayout, mediaIds: string[], kind: 'grid' | 'scatter'): PageLayout {
  const s = l.space;
  if (!s) return l;
  const placed = new Set(l.elements.flatMap((e) => (e.type === 'frame' && e.mediaId ? [e.mediaId] : [])));
  const todo = mediaIds.filter((m) => !placed.has(m));
  if (!todo.length) return l;
  const strip = s.shape === 'horizontal';
  const margin = 0.06, gap = 0.035;
  // Cells per row (wall) or per column (strip), and a cell's size: visually square (h = 0.75 w on a 3:4 tile).
  const k = strip ? 3 : todo.length >= 6 ? 3 : 2;
  const cw = strip ? (1 - 2 * margin - (k - 1) * gap) / k / 0.75 : (1 - 2 * margin - (k - 1) * gap) / k;
  const ch = cw * 0.75;
  const start = Math.max(strip ? margin : 0.16, reach(l) + gap); // after what is there (below the title, on a fresh wall)
  let z = Math.max(0, ...l.elements.map((e) => e.z));
  const frames: FrameEl[] = [];
  for (const [i, mediaId] of todo.entries()) {
    const line = Math.floor(i / k), cell = i % k;
    let x = strip ? start + line * (cw + gap / 0.75) : margin + cell * (cw + gap);
    let y = strip ? margin + cell * (ch + gap) : start + line * (ch + gap * 0.75);
    let w = cw, h = ch, rotation = 0;
    if (kind === 'scatter') { // a polaroid a bit bigger than its cell, nudged and tilted
      w = cw * 1.12; h = w * 0.825;
      x += (seeded(mediaId, 1) - 0.5) * cw * 0.25 - (w - cw) / 2;
      y += (seeded(mediaId, 2) - 0.5) * ch * 0.25 - (h - ch) / 2;
      rotation = Math.round((seeded(mediaId, 3) - 0.5) * 16 * 10) / 10;
    }
    if ((strip ? x + w : y + h) > MAX_TILES - 0.05) break;
    frames.push({
      type: 'frame', id: newId(), x, y, w, h, rotation, z: ++z, frameStyle: kind === 'grid' ? 'plain' : 'polaroid',
      mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
    });
  }
  const next = { ...l, elements: [...l.elements, ...frames] };
  const k2 = along(l);
  return { ...next, space: { ...s, [k2]: Math.min(MAX_TILES, Math.max(s[k2], Math.ceil(reach(next) + margin))) } };
}
