import { expect, test } from 'vitest';
import { nextIndex, prevIndex, visiblePages } from '../src/viewer/spread';

test('visiblePages: cover alone, then pairs [1,2], [3,4], …', () => {
  expect(visiblePages(0, 9, true)).toEqual([0]);
  expect(visiblePages(1, 9, true)).toEqual([1, 2]);
  expect(visiblePages(2, 9, true)).toEqual([1, 2]);
  expect(visiblePages(8, 9, true)).toEqual([7, 8]);
  expect(visiblePages(7, 8, true)).toEqual([7]); // odd last page: alone on the left
  expect(visiblePages(3, 9, false)).toEqual([3]);
});

test('nextIndex / prevIndex step by spread and clamp at the ends', () => {
  expect(nextIndex(0, 9, true)).toBe(1);
  expect(nextIndex(1, 9, true)).toBe(3);
  expect(nextIndex(2, 9, true)).toBe(3);
  expect(nextIndex(8, 9, true)).toBe(8);
  expect(nextIndex(3, 9, false)).toBe(4);
  expect(nextIndex(8, 9, false)).toBe(8);
  expect(prevIndex(3, 9, true)).toBe(1);
  expect(prevIndex(2, 9, true)).toBe(0);
  expect(prevIndex(0, 9, true)).toBe(0);
  expect(prevIndex(3, 9, false)).toBe(2);
  expect(prevIndex(0, 9, false)).toBe(0);
});
