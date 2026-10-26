import { expect, test } from 'vitest';
import { FADE_SEC, pickVideoType, SLIDE_SEC, slideAt } from '../src/viewer/slideshow';

test('MP4 is preferred, WebM is the fallback, nothing when the browser records neither', () => {
  expect(pickVideoType(() => true)).toMatch(/^video\/mp4/);
  expect(pickVideoType((t) => t.startsWith('video/webm'))).toMatch(/^video\/webm/);
  expect(pickVideoType(() => false)).toBeNull();
});

test('each page shows for its slot, the next fades in at the end, the last one holds', () => {
  expect(slideAt(0, 3)).toMatchObject({ i: 0, next: null, alpha: 0 });
  expect(slideAt(SLIDE_SEC - FADE_SEC / 2, 3)).toMatchObject({ i: 0, next: 1 });
  expect(slideAt(SLIDE_SEC - FADE_SEC / 2, 3).alpha).toBeCloseTo(0.5);
  expect(slideAt(SLIDE_SEC + 0.1, 3)).toMatchObject({ i: 1, next: null });
  expect(slideAt(3 * SLIDE_SEC - 0.1, 3)).toMatchObject({ i: 2, next: null }); // nothing after the last page
  expect(slideAt(99, 3).i).toBe(2);
});

test('a boomerang plays the shots forward then back, without repeating the ends, three times', async () => {
  const { boomerangOrder } = await import('../src/viewer/slideshow');
  expect(boomerangOrder(['a', 'b', 'c', 'd'], 1)).toEqual(['a', 'b', 'c', 'd', 'c', 'b']);
  expect(boomerangOrder(['a', 'b'], 2)).toEqual(['a', 'b', 'a', 'b']);
  expect(boomerangOrder(['a', 'b', 'c'])).toHaveLength(12);
});
