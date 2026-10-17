import { expect, test } from 'vitest';
import { pageLayoutSchema, type PageElement, type PageLayout } from '@scrapbook/shared';
import {
  addElement, assignMedia, bringForward, newFrame, newSticker, newTape, newText, removeElement, sendBackward, updateElement,
} from '../src/editor/layoutOps';

const tape = (id: string, z: number): PageElement => ({ type: 'tape', id, x: 0.1, y: 0.1, w: 0.2, h: 0.05, rotation: 0, z, tapeStyle: 'yellow' });
const layout: PageLayout = {
  background: 'paper-cream',
  elements: [
    tape('a', 1), tape('b', 3),
    { type: 'frame', id: 'f', x: 0, y: 0, w: 0.5, h: 0.5, rotation: 0, z: 2, frameStyle: 'polaroid', mediaId: 'm1', crop: { x: 0.2, y: 0.8, scale: 2 } },
  ],
};
const z = (l: PageLayout, id: string) => l.elements.find((e) => e.id === id)!.z;

test('addElement puts the new element on top (z = max + 1)', () => {
  const l = addElement(layout, tape('n', 0));
  expect(z(l, 'n')).toBe(4);
  expect(layout.elements).toHaveLength(3); // pure
  expect(z(addElement({ background: 'paper-cream', elements: [] }, tape('n', 0)), 'n')).toBe(1);
});

test('bringForward swaps with the next element above; on the top element it is a no-op', () => {
  expect(bringForward(layout, 'b')).toBe(layout);
  const l = bringForward(layout, 'a');
  expect(z(l, 'a')).toBeGreaterThan(z(l, 'f'));
  expect(z(l, 'b')).toBeGreaterThan(z(l, 'a'));
});

test('bringForward / sendBackward also separate elements that share a z', () => {
  const tied: PageLayout = { background: 'paper-cream', elements: [tape('a', 1), tape('b', 1)] };
  const l = bringForward(tied, 'a');
  expect(z(l, 'a')).toBeGreaterThan(z(l, 'b'));
  const back = sendBackward(l, 'a');
  expect(z(back, 'a')).toBeLessThan(z(back, 'b'));
  expect(sendBackward(tied, 'a')).toBe(tied); // bottom already
});

test('assignMedia sets mediaId and resets crop', () => {
  const f = assignMedia(layout, 'f', 'm2').elements.find((e) => e.id === 'f');
  expect(f).toMatchObject({ mediaId: 'm2', crop: { x: 0.5, y: 0.5, scale: 1 } });
  expect(assignMedia(layout, 'f', null).elements.find((e) => e.id === 'f')).toMatchObject({ mediaId: null });
});

test('removeElement with an unknown id returns the same layout', () => {
  expect(removeElement(layout, 'nope')).toBe(layout);
  expect(removeElement(layout, 'a').elements.map((e) => e.id)).toEqual(['b', 'f']);
});

test('updateElement patches and clamps geometry to the schema bounds', () => {
  const l = updateElement(layout, 'a', { x: 2, y: -1, w: 0, h: 3, rotation: 270 });
  expect(l.elements[0]).toMatchObject({ x: 1.5, y: -0.5, h: 1.5, rotation: -90 });
  expect(l.elements[0].w).toBeGreaterThan(0);
  expect(pageLayoutSchema.safeParse(l).success).toBe(true);
});

test('new elements are centered, slightly tilted and valid', () => {
  for (const el of [newSticker('heart'), newTape('mint'), newText(), newFrame()]) {
    expect(el.x + el.w / 2).toBeCloseTo(0.5);
    expect(el.y + el.h / 2).toBeCloseTo(0.5);
    expect(Math.abs(el.rotation)).toBeLessThanOrEqual(4);
    expect(pageLayoutSchema.safeParse({ background: 'paper-cream', elements: [el] }).success).toBe(true);
  }
  expect(newSticker('a').id).not.toBe(newSticker('a').id);
});
