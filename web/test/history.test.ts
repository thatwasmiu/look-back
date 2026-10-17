import { expect, test } from 'vitest';
import { initHistory, push, redo, undo } from '../src/editor/history';

test('push x3, undo x2, redo x1 → present is the 2nd value', () => {
  let h = initHistory(0);
  h = push(push(push(h, 1), 2), 3);
  h = redo(undo(undo(h)));
  expect(h.present).toBe(2);
});

test('push after undo clears future', () => {
  const h = push(undo(push(push(initHistory(0), 1), 2)), 9);
  expect(h.future).toEqual([]);
  expect(redo(h)).toBe(h);
  expect(h.present).toBe(9);
});

test('undo / redo at the ends are no-ops', () => {
  const h = initHistory(0);
  expect(undo(h)).toBe(h);
  expect(redo(h)).toBe(h);
});

test('past is capped at 100', () => {
  let h = initHistory(0);
  for (let i = 1; i <= 101; i++) h = push(h, i);
  expect(h.past.length).toBe(100);
  expect(h.past[0]).toBe(1);
});
