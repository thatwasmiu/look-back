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
