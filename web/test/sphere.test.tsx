import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { spaceLayout, type MediaDTO } from '@scrapbook/shared';
import { drawGlobe, spherePoints, turn } from '../src/render/sphere';
import { SpaceView } from '../src/viewer/SpaceView';
import { SphereEditor } from '../src/editor/SphereEditor';
import { arrange } from '../src/editor/spaceOps';

afterEach(cleanup);
const m = (id: string): MediaDTO => ({ id, albumId: 'a', kind: 'image', status: 'ready', width: 800, height: 600, durationSec: null, blurDataUrl: null,
  variants: { thumb: `${id}/thumb.webp`, display: `${id}/display.webp`, original: `${id}/o.jpg` }, error: null });
const media = new Map(['a', 'b', 'c', 'd'].map((k) => [k, m(k)]));

test('photos spread over the whole globe, top to bottom, on its surface; turning keeps them on it', () => {
  const pts = spherePoints(40);
  expect(pts).toHaveLength(40);
  expect(Math.max(...pts.map((p) => p.lat))).toBeGreaterThan(1.2); // near the top
  expect(Math.min(...pts.map((p) => p.lat))).toBeLessThan(-1.2); // and the bottom
  for (const p of pts) {
    const q = turn(p, 0.4, 1.3);
    expect(Math.hypot(q.x, q.y, q.z)).toBeCloseTo(1);
  }
  expect(spherePoints(1)[0].lat).toBe(0);
});

test('drawn flat: only the front of the globe, far photos first', () => {
  const calls: number[] = [];
  const g = { drawImage: vi.fn((..._a: unknown[]) => calls.push(1)), fillRect: vi.fn(), set globalAlpha(_v: number) {}, set fillStyle(_v: unknown) {} } as unknown as CanvasRenderingContext2D;
  const img = { naturalWidth: 100, naturalHeight: 80 } as HTMLImageElement;
  drawGlobe(g, Array.from({ length: 30 }, () => img), 1080, 1350, 0, 0);
  expect(calls.length).toBeGreaterThan(10);
  expect(calls.length).toBeLessThan(30); // the back half is left out
});

test('a globe album shows its photos round a globe; a card opens the photo viewer', () => {
  const layout = arrange(spaceLayout('sphere'), ['a', 'b', 'c'], 'grid');
  const { container } = render(<SpaceView layout={layout} media={media} />);
  const cards = container.querySelectorAll('.sphere-card');
  expect(cards).toHaveLength(3);
  expect(cards[0].querySelector('img')!.getAttribute('src')).toContain('a/thumb.webp'); // small images on the globe
  fireEvent.keyDown(cards[1], { key: 'Enter' });
  expect(screen.getByRole('dialog', { name: 'Photo 2 of 3' })).toBeTruthy();
});

test('editing a globe: the photos in order, moved and taken off', () => {
  const layout = arrange(spaceLayout('sphere'), ['a', 'b', 'c'], 'grid');
  const commit = vi.fn();
  render(<SphereEditor layout={layout} media={media} commit={commit} />);
  const list = screen.getByRole('list', { name: 'Photos on the globe, in order' });
  expect(list.querySelectorAll('li')).toHaveLength(3);
  fireEvent.click(screen.getAllByRole('button', { name: 'Move later' })[0]);
  const after = commit.mock.calls[0][0];
  expect(after.elements.filter((e: { type: string }) => e.type === 'frame').map((f: { mediaId: string }) => f.mediaId)).toEqual(['b', 'a', 'c']);
  fireEvent.click(screen.getAllByRole('button', { name: 'Take off the globe' })[2]);
  expect(commit.mock.calls[1][0].elements.filter((e: { type: string }) => e.type === 'frame')).toHaveLength(2);
});
