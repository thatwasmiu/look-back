import { expect, test } from 'vitest';
import { pageLayoutSchema, spaceLayout, type FrameEl, type PageLayout } from '@scrapbook/shared';
import { arrange, minLength, resizeSpace, setShape } from '../src/editor/spaceOps';

const frames = (l: PageLayout) => l.elements.filter((e): e is FrameEl => e.type === 'frame');

test('Longer / Shorter: a tile more or less, never cutting off an item, never past 30', () => {
  const wall = spaceLayout('vertical', 3);
  expect(resizeSpace(wall, 1).space?.rows).toBe(4);
  expect(resizeSpace(wall, -1).space?.rows).toBe(2);
  const busy = { ...wall, elements: [...wall.elements, { ...wall.elements[0], id: 'low', y: 2.5 }] };
  expect(minLength(busy)).toBe(3);
  expect(resizeSpace(busy, -1)).toBe(busy); // the item at 2.5–2.6 keeps 3 tiles
  expect(resizeSpace({ ...wall, space: { shape: 'vertical', cols: 1, rows: 30 } }, 1).space?.rows).toBe(30);
  expect(resizeSpace(spaceLayout('horizontal', 3), 1).space).toMatchObject({ cols: 4, rows: 1 });
});

test('vertical ↔ horizontal: tile i of the wall becomes tile i of the strip, items keep their place in it', () => {
  const wall = { ...spaceLayout('vertical', 3), elements: [{ ...spaceLayout('vertical').elements[0], id: 't2', x: 0.1, y: 2.3 }] };
  const strip = setShape(wall, 'horizontal');
  expect(strip.space).toEqual({ shape: 'horizontal', cols: 3, rows: 1 });
  expect(strip.elements[0]).toMatchObject({ x: 2.1 });
  expect(strip.elements[0].y).toBeCloseTo(0.3);
  // an item over the edge of its tile is pulled inside the strip
  const over = setShape({ ...wall, elements: [{ ...wall.elements[0], id: 'o', y: 0.9, h: 0.3 }] }, 'horizontal');
  expect(over.elements[0].y + over.elements[0].h).toBeLessThanOrEqual(1);
  const back = setShape(strip, 'vertical');
  expect(back.elements[0].x).toBeCloseTo(0.1);
  expect(back.elements[0].y).toBeCloseTo(2.3);
});

test('Arrange: the photos not on the space yet, after what is there; the space grows; the result is a valid page', () => {
  const wall = spaceLayout('vertical', 2);
  const ids = Array.from({ length: 14 }, (_, i) => `m${i}`);
  const grid = arrange(wall, ids, 'grid');
  expect(frames(grid)).toHaveLength(14);
  expect(Math.min(...frames(grid).map((f) => f.y))).toBeGreaterThan(wall.elements[0].y + wall.elements[0].h); // below the title
  expect(grid.space!.rows).toBeGreaterThanOrEqual(Math.ceil(Math.max(...frames(grid).map((f) => f.y + f.h))));
  expect(pageLayoutSchema.safeParse(grid).success).toBe(true);
  // again: nothing new to place; a new photo goes after the others
  expect(arrange(grid, ids, 'grid')).toBe(grid);
  const more = arrange(grid, [...ids, 'm14'], 'scatter');
  const last = frames(more).at(-1)!;
  expect(last.mediaId).toBe('m14');
  expect(last.frameStyle).toBe('polaroid');
  expect(arrange(grid, [...ids, 'm14'], 'scatter').elements.at(-1)!.rotation).toBe(last.rotation); // same picture twice
  const strip = arrange(spaceLayout('horizontal', 2), ids, 'grid');
  expect(Math.max(...frames(strip).map((f) => f.y + f.h))).toBeLessThanOrEqual(1);
  expect(pageLayoutSchema.safeParse(strip).success).toBe(true);
});

test('free board: square, Bigger / Smaller a tile each way (2–5), never cutting items', () => {
  const board = spaceLayout('free', 3);
  expect(board.space).toEqual({ shape: 'free', cols: 3, rows: 3 });
  expect(resizeSpace(board, 1).space).toEqual({ shape: 'free', cols: 4, rows: 4 });
  expect(resizeSpace(resizeSpace(board, 1), 1).space?.cols).toBe(5);
  expect(resizeSpace({ ...board, space: { shape: 'free', cols: 5, rows: 5 } }, 1).space?.cols).toBe(5); // 25 tiles: the most
  expect(resizeSpace(board, -1).space?.cols).toBe(2);
  expect(resizeSpace(resizeSpace(board, -1), -1).space?.cols).toBe(2); // never below 2 × 2
  const far = { ...board, elements: [{ ...board.elements[0], id: 'far', x: 2.2 }] };
  expect(resizeSpace(far, -1)).toBe(far); // an item reaching into the third column keeps 3 × 3
});

test('wall → board → wall: tile k stays tile k (row by row across the board), nothing outside the board', () => {
  const wall = { ...spaceLayout('vertical', 5), elements: [{ ...spaceLayout('vertical').elements[0], id: 't4', x: 0.1, y: 4.2 }] };
  const board = setShape(wall, 'free');
  expect(board.space).toEqual({ shape: 'free', cols: 3, rows: 3 }); // 5 tiles fit 3 × 3
  expect(board.elements[0].x).toBeCloseTo(1.1); // tile 4 = column 1, row 1
  expect(board.elements[0].y).toBeCloseTo(1.2);
  const back = setShape(board, 'vertical');
  expect(back.space).toEqual({ shape: 'vertical', cols: 1, rows: 9 });
  expect(back.elements[0].y).toBeCloseTo(4.2);
  expect(pageLayoutSchema.safeParse(board).success).toBe(true);
});

test('Arrange on a board: rows run across all its tiles; it grows square to fit', () => {
  const board = spaceLayout('free', 2);
  const ids = Array.from({ length: 30 }, (_, i) => `m${i}`);
  const out = arrange(board, ids, 'grid');
  const fs = frames(out);
  expect(fs.length).toBeGreaterThan(0);
  expect(Math.max(...fs.map((f) => f.x + f.w))).toBeGreaterThan(1.5); // across both columns of tiles
  expect(out.space!.cols).toBe(out.space!.rows);
  expect(Math.max(...fs.map((f) => f.y + f.h))).toBeLessThanOrEqual(out.space!.rows);
  expect(pageLayoutSchema.safeParse(out).success).toBe(true);
});

test('onto a globe: photos keep reading order, boxes tucked in one tile, empty frames dropped; and back to a wall as a grid', async () => {
  const { moveOnSphere, sphereOrder } = await import('../src/editor/spaceOps');
  const wall = arrange(spaceLayout('vertical', 2), ['a', 'b', 'c', 'd'], 'grid');
  const withEmpty = { ...wall, elements: [...wall.elements, { ...frames(wall)[0], id: 'empty', mediaId: null }] };
  const globe = setShape(withEmpty, 'sphere');
  expect(globe.space).toEqual({ shape: 'sphere', cols: 1, rows: 1 });
  expect(sphereOrder(globe).map((f) => f.mediaId)).toEqual(['a', 'b', 'c', 'd']);
  expect(frames(globe).some((f) => !f.mediaId)).toBe(false);
  expect(pageLayoutSchema.safeParse(globe).success).toBe(true);
  // add the rest of the album, reorder, take one off
  const more = arrange(globe, ['a', 'b', 'c', 'd', 'e'], 'grid');
  expect(sphereOrder(more).map((f) => f.mediaId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  const moved = moveOnSphere(more, sphereOrder(more)[4].id, -1);
  expect(sphereOrder(moved).map((f) => f.mediaId)).toEqual(['a', 'b', 'c', 'e', 'd']);
  expect(moveOnSphere(moved, sphereOrder(moved)[0].id, -1)).toBe(moved); // already first
  // back to a wall: laid out again as a grid, in the globe's order
  const back = setShape(moved, 'vertical');
  expect(back.space?.shape).toBe('vertical');
  const order = frames(back).slice().sort((p, q) => Math.round(p.y * 10) - Math.round(q.y * 10) || p.x - q.x).map((f) => f.mediaId);
  expect(order).toEqual(['a', 'b', 'c', 'e', 'd']);
  expect(pageLayoutSchema.safeParse(back).success).toBe(true);
  expect(resizeSpace(globe, 1)).toBe(globe); // a globe has no size
});
