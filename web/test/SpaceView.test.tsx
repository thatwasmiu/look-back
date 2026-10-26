import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { spaceLayout, type FrameEl, type MediaDTO } from '@scrapbook/shared';
import { SpaceView, spaceShots } from '../src/viewer/SpaceView';

afterEach(cleanup);
const m = (id: string): MediaDTO => ({ id, albumId: 'a', kind: 'image', status: 'ready', width: 800, height: 600, durationSec: null, blurDataUrl: null,
  variants: { display: `${id}/display.webp`, original: `${id}/o.jpg` }, error: null });
const f = (id: string, x: number, y: number): FrameEl => ({ type: 'frame', id, x, y, w: 0.4, h: 0.3, rotation: 0, z: 1, frameStyle: 'plain', mediaId: `m-${id}`, crop: { x: 0.5, y: 0.5, scale: 1 } });
const media = new Map(['a', 'b', 'c'].map((k) => [`m-${k}`, m(`m-${k}`)]));

test('photos in reading order: rows down a wall, columns along a strip', () => {
  const els = [f('c', 0.1, 1.2), f('b', 0.55, 0.2), f('a', 0.1, 0.21)];
  expect(spaceShots({ ...spaceLayout('vertical'), elements: els }, media).map((s) => s.frame.id)).toEqual(['a', 'b', 'c']);
  const strip = [f('c', 2.1, 0.2), f('a', 0.1, 0.5), f('b', 0.12, 0.1)];
  expect(spaceShots({ ...spaceLayout('horizontal'), elements: strip }, media).map((s) => s.frame.id)).toEqual(['b', 'a', 'c']);
});

test('the space is placed in tiles; tapping a photo opens it big, then ← → walk through, Esc closes', () => {
  const layout = { ...spaceLayout('vertical', 2), elements: [f('a', 0.1, 0.2), f('b', 0.1, 1.2)] };
  const { container } = render(<SpaceView layout={layout} media={media} />);
  const b = container.querySelector<HTMLElement>('[data-el="b"]')!;
  expect(b.style.top).toBe('60%'); // 1.2 of 2 tiles
  expect(container.querySelector<HTMLElement>('.page')!.style.aspectRatio).toBe('3 / 8');
  fireEvent.click(container.querySelector('[data-el="a"]')!);
  expect(screen.getByRole('dialog', { name: 'Photo 1 of 2' })).toBeTruthy();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByRole('dialog', { name: 'Photo 2 of 2' }).querySelector('img')!.getAttribute('src')).toContain('m-b/display.webp');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
