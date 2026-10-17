// Pure edits on a PageLayout: every function returns a new layout (or the same one when nothing changes).
import type { EffectEl, FrameEl, PageElement, PageLayout, StickerEl, TapeEl, TextEl } from '@scrapbook/shared';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Schema bounds: x,y ∈ [-0.5,1.5], w,h ∈ (0,1.5], rotation ∈ [-180,180].
const clampGeometry = <E extends PageElement>(e: E): E => ({
  ...e,
  x: clamp(e.x, -0.5, 1.5), y: clamp(e.y, -0.5, 1.5),
  w: clamp(e.w, 0.01, 1.5), h: clamp(e.h, 0.01, 1.5),
  rotation: e.rotation >= -180 && e.rotation <= 180 ? e.rotation : ((((e.rotation + 180) % 360) + 360) % 360) - 180,
});

export function addElement(l: PageLayout, el: PageElement): PageLayout {
  const z = Math.max(0, ...l.elements.map((e) => e.z)) + 1;
  return { ...l, elements: [...l.elements, { ...el, z }] };
}

export function updateElement(l: PageLayout, id: string, patch: Partial<PageElement>): PageLayout {
  if (!l.elements.some((e) => e.id === id)) return l;
  return { ...l, elements: l.elements.map((e) => (e.id === id ? clampGeometry({ ...e, ...patch } as PageElement) : e)) };
}

export function removeElement(l: PageLayout, id: string): PageLayout {
  const elements = l.elements.filter((e) => e.id !== id);
  return elements.length === l.elements.length ? l : { ...l, elements };
}

// Paint order is z, then array order (PageRenderer renders in array order). Restacking renumbers z to 1..n in
// that order and swaps the element with its neighbour, so elements that share a z still visibly move.
function restack(l: PageLayout, id: string, dir: 1 | -1): PageLayout {
  const order = l.elements.map((e, i) => ({ e, i })).sort((a, b) => a.e.z - b.e.z || a.i - b.i).map(({ e }) => e.id);
  const at = order.indexOf(id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return l;
  [order[at], order[to]] = [order[to], order[at]];
  return { ...l, elements: l.elements.map((e) => ({ ...e, z: order.indexOf(e.id) + 1 })) };
}
export const bringForward = (l: PageLayout, id: string) => restack(l, id, 1);
export const sendBackward = (l: PageLayout, id: string) => restack(l, id, -1);

export function assignMedia(l: PageLayout, frameId: string, mediaId: string | null): PageLayout {
  return { ...l, elements: l.elements.map((e) => (e.id === frameId && e.type === 'frame' ? { ...e, mediaId, crop: { x: 0.5, y: 0.5, scale: 1 } } : e)) };
}

// Media deleted from the album: empty every frame that showed it (same layout back if none did).
export function clearMedia(l: PageLayout, mediaId: string): PageLayout {
  if (!l.elements.some((e) => e.type === 'frame' && e.mediaId === mediaId)) return l;
  return { ...l, elements: l.elements.map((e) => (e.type === 'frame' && e.mediaId === mediaId ? { ...e, mediaId: null } : e)) };
}

// randomUUID needs a secure context; the app may be opened over plain http on the LAN.
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const tilt = () => Math.round((Math.random() * 8 - 4) * 10) / 10;
// Centered box; the page is 3:4, so a visually square box of page-width w has page-height h = 0.75w.
const box = (w: number, h: number) => ({ id: newId(), x: 0.5 - w / 2, y: 0.5 - h / 2, w, h, rotation: tilt(), z: 0 });

export const newSticker = (stickerId: string): StickerEl => ({ type: 'sticker', ...box(0.18, 0.135), stickerId });
export const newTape = (tapeStyle: TapeEl['tapeStyle']): TapeEl => ({ type: 'tape', ...box(0.22, 0.045), tapeStyle });
// Particle effects start as a visually square box; a light leak covers the whole page, untilted.
export const newEffect = (effect: EffectEl['effect']): EffectEl => effect === 'light-leak'
  ? { type: 'effect', id: newId(), x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, effect }
  : { type: 'effect', ...box(0.6, 0.45), rotation: 0, effect };
export const newText = (): TextEl =>
  ({ type: 'text', ...box(0.5, 0.08), text: 'ghi chú', font: 'patrick-hand', color: '#4a3b2c', size: 0.045 });
// Round shapes (circle, heart) are kept visually square: h = 0.75w on the 3:4 page.
const ROUND: FrameEl['frameStyle'][] = ['circle', 'heart'];
// Polaroid with a square photo window (h = 0.825w, see templates.ts); round shapes start square.
export const newFrame = (frameStyle: FrameEl['frameStyle'] = 'polaroid'): FrameEl =>
  ({ type: 'frame', ...(ROUND.includes(frameStyle) ? box(0.4, 0.3) : box(0.5, 0.4125)), frameStyle, mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } });

// Switch a frame's look; photo and crop stay. Round shapes become visually square around the same center.
export function setFrameStyle(l: PageLayout, id: string, frameStyle: FrameEl['frameStyle']): PageLayout {
  const f = l.elements.find((e) => e.id === id);
  if (f?.type !== 'frame') return l;
  if (!ROUND.includes(frameStyle)) return updateElement(l, id, { frameStyle });
  const h = f.w * 0.75;
  return updateElement(l, id, { frameStyle, h, y: f.y + (f.h - h) / 2 });
}
