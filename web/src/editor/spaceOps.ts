// Edits of a space (a space album's one page, layout.space): its size, its shape, and arranging photos on it.
// Items are in tile units (a tile is one 3:4 page): x, w in tile widths; y, h in tile heights.
// Shapes: a wall (1 × rows, scrolled down), a strip (cols × 1, sideways), a free board (n × n, any direction), and a
// sphere (1 × 1): its photos go round a globe in the order of their frames; their boxes don't matter there.
import { MAX_TILES, type FrameEl, type PageLayout, type SpaceShape } from '@scrapbook/shared';

export type FlatShape = Exclude<SpaceShape, 'sphere'>;
export const MAX_BOARD = Math.floor(Math.sqrt(MAX_TILES)); // a free board is at most 5 × 5
const MIN_BOARD = 2;

// How far the items reach (in tiles), across and down.
const reachX = (l: PageLayout) => Math.max(0, ...l.elements.map((e) => e.x + e.w));
const reachY = (l: PageLayout) => Math.max(0, ...l.elements.map((e) => e.y + e.h));
const tilesFor = (v: number) => Math.ceil(v - 0.001);

// The size the space may not go below: what its items reach (a board stays square, at least 2 × 2).
export function minLength(l: PageLayout): number {
  const s = l.space;
  if (s?.shape === 'free') return Math.max(MIN_BOARD, tilesFor(reachX(l)), tilesFor(reachY(l)));
  return Math.max(1, tilesFor(s?.shape === 'horizontal' ? reachX(l) : reachY(l)));
}
// The space's length: a wall's rows, a strip's columns, a board's side.
export const lengthOf = (l: PageLayout) => (l.space?.shape === 'horizontal' ? l.space.cols : l.space?.rows ?? 1);
const maxLength = (shape: SpaceShape) => (shape === 'free' ? MAX_BOARD : MAX_TILES);
const sized = (shape: FlatShape, n: number) => ({ shape, cols: shape === 'vertical' ? 1 : n, rows: shape === 'horizontal' ? 1 : n });

// Longer / Shorter (a board: Bigger / Smaller, a tile each way): never past the limit, never cutting off an item.
export function resizeSpace(l: PageLayout, delta: number): PageLayout {
  const s = l.space;
  if (!s || s.shape === 'sphere') return l;
  const len = lengthOf(l);
  const next = Math.min(maxLength(s.shape), Math.max(minLength(l), len + delta));
  return next === len ? l : { ...l, space: sized(s.shape, next) };
}

// Tiles count along the space: down a wall, along a strip, row by row across a board.
const tileAt = (shape: FlatShape, n: number, k: number) =>
  shape === 'vertical' ? [0, k] : shape === 'horizontal' ? [k, 0] : [k % n, Math.floor(k / n)];
const indexOf = (shape: FlatShape, n: number, tx: number, ty: number) =>
  shape === 'vertical' ? ty : shape === 'horizontal' ? tx : ty * n + tx;

// Change the shape: tile k of the old space becomes tile k of the new one (a board is as small as holds them all, at
// most 5 × 5) and items keep their place in their tile; anything over the new space's edge is pulled back inside.
export function setShape(l: PageLayout, shape: SpaceShape): PageLayout {
  const s = l.space;
  if (!s || s.shape === shape) return l;
  if (shape === 'sphere') return toSphere(l);
  if (s.shape === 'sphere') return fromSphere(l, shape);
  const from = s.shape;
  const oldN = lengthOf(l);
  const tiles = s.cols * s.rows;
  const n = shape === 'free' ? Math.min(MAX_BOARD, Math.max(MIN_BOARD, Math.ceil(Math.sqrt(tiles)))) : tiles;
  const space = sized(shape, n);
  const last = space.cols * space.rows - 1;
  const inside = (v: number, size: number, room: number) => Math.min(Math.max(0, v), Math.max(0, room - size));
  const elements = l.elements.map((e) => {
    const tx = Math.min(s.cols - 1, Math.max(0, Math.floor(e.x))), ty = Math.min(s.rows - 1, Math.max(0, Math.floor(e.y)));
    const [nx, ny] = tileAt(shape, n, Math.min(last, indexOf(from, oldN, tx, ty)));
    return { ...e, x: inside(nx + (e.x - tx), e.w, space.cols), y: inside(ny + (e.y - ty), e.h, space.rows) };
  });
  return { ...l, elements, space };
}

// Onto a globe: the photos keep their reading order (that is the globe's order); every box is tucked inside the one
// tile (a sphere has no size), so the page stays valid. Empty frames go — a globe only shows photos.
const SPHERE_BOX = { x: 0.45, y: 0.45, w: 0.1, h: 0.1, rotation: 0 };
function toSphere(l: PageLayout): PageLayout {
  const across = l.space?.shape === 'horizontal';
  const r = (v: number) => Math.round(v * 10);
  const photos = l.elements.filter((e): e is FrameEl => e.type === 'frame' && !!e.mediaId)
    .sort((a, b) => (across ? r(a.x) - r(b.x) || a.y - b.y : r(a.y) - r(b.y) || a.x - b.x));
  const rest = l.elements.filter((e) => e.type !== 'frame').map((e) => ({ ...e, x: Math.min(e.x, 1 - Math.min(e.w, 1)), y: Math.min(e.y, 1 - Math.min(e.h, 1)), w: Math.min(e.w, 1), h: Math.min(e.h, 1) }));
  return { ...l, space: { shape: 'sphere', cols: 1, rows: 1 }, elements: [...rest, ...photos.map((f) => ({ ...f, ...SPHERE_BOX }))] };
}
// Off a globe: the photos are laid out again, in the globe's order, as a grid on the new (empty) space; texts and
// stickers stay in its first tile.
function fromSphere(l: PageLayout, shape: FlatShape): PageLayout {
  const photos = sphereOrder(l);
  const base = { ...l, space: sized(shape, 3), elements: l.elements.filter((e) => e.type !== 'frame') };
  return arrange(base, photos.map((f) => f.mediaId!), 'grid');
}
// A globe's photos, in its order (the order of their frames).
export const sphereOrder = (l: PageLayout): FrameEl[] => l.elements.filter((e): e is FrameEl => e.type === 'frame' && !!e.mediaId);

// Move a photo one place earlier / later on the globe (the frames' order is the globe's order).
export function moveOnSphere(l: PageLayout, id: string, dir: -1 | 1): PageLayout {
  const order = sphereOrder(l);
  const at = order.findIndex((f) => f.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return l;
  [order[at], order[to]] = [order[to], order[at]];
  return { ...l, elements: [...l.elements.filter((e) => !(e.type === 'frame' && e.mediaId)), ...order] };
}

// A repeatable 0..1 from a string (the photo's id): arranging twice gives the same picture.
const seeded = (s: string, salt: number) => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// 🧩 Arrange: the photos not on the space yet go after what is there — rows down a wall or across a board, columns
// along a strip — as a neat Grid (square photos, thin white frames) or a Scatter (tilted polaroids, a little jumbled).
// The space grows to fit (a wall / strip up to 30 tiles, a board up to 5 × 5; what doesn't fit is left out).
// Existing items stay where they are.
export function arrange(l: PageLayout, mediaIds: string[], kind: 'grid' | 'scatter'): PageLayout {
  const s = l.space;
  if (!s) return l;
  const placed = new Set(l.elements.flatMap((e) => (e.type === 'frame' && e.mediaId ? [e.mediaId] : [])));
  const todo = mediaIds.filter((m) => !placed.has(m));
  if (!todo.length) return l;
  if (s.shape === 'sphere') { // onto the globe, after the photos already on it
    let z0 = Math.max(0, ...l.elements.map((e) => e.z));
    const add: FrameEl[] = todo.slice(0, 200 - l.elements.length).map((mediaId) => ({
      type: 'frame', id: newId(), ...SPHERE_BOX, z: ++z0, frameStyle: 'plain', mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
    }));
    return { ...l, elements: [...l.elements, ...add] };
  }
  const strip = s.shape === 'horizontal';
  const margin = 0.06, gap = 0.035;
  // Cells per tile across a wall / board (or down a strip), and a cell's size: visually square (h = 0.75 w on a tile).
  const perTile = strip || s.shape === 'free' || todo.length >= 6 ? 3 : 2;
  const k = perTile * (s.shape === 'free' ? s.cols : 1); // a board's rows run across all its tiles
  const across = s.shape === 'free' ? s.cols : 1;
  const cw = strip ? (1 - 2 * margin - (perTile - 1) * gap) / perTile / 0.75 : (across - 2 * margin - (k - 1) * gap) / k;
  const ch = cw * 0.75;
  const start = Math.max(strip ? margin : 0.16, (strip ? reachX(l) : reachY(l)) + gap); // after what is there (below a fresh space's title)
  const limit = s.shape === 'free' ? MAX_BOARD : MAX_TILES;
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
    if ((strip ? x + w : y + h) > limit - 0.05) break;
    frames.push({
      type: 'frame', id: newId(), x, y, w, h, rotation, z: ++z, frameStyle: kind === 'grid' ? 'plain' : 'polaroid',
      mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
    });
  }
  const next = { ...l, elements: [...l.elements, ...frames] };
  const need = tilesFor((strip ? reachX(next) : reachY(next)) + margin);
  return { ...next, space: sized(s.shape, Math.min(limit, Math.max(lengthOf(l), need))) };
}
