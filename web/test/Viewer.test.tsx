import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import Viewer from '../src/pages/Viewer';

let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduced-motion') ? reduced : false, // phone: single-page mode
    addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut' },
  pages: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, albumId: 'a1', position: i, layout: { background: 'paper-cream', elements: [] } })),
  media: [],
};
const setup = (fetchMock: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetchMock);
  return render(
    <MemoryRouter initialEntries={['/albums/a1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/albums/:id" element={<Viewer />} /></Routes>
    </MemoryRouter>,
  );
};

test('load error shows retry, retry loads the album', async () => {
  setup(vi.fn().mockResolvedValueOnce(json(500, { error: 'boom' })).mockResolvedValueOnce(json(200, bundle)));
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('1 / 5')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/albums/a1/edit');
});

test('flip keeps the neighbour page mounted and only toggles it visible', async () => {
  reduced = true; // instant swap: no outgoing page lingering
  const { container } = setup(vi.fn().mockResolvedValue(json(200, bundle)));
  await screen.findByText('1 / 5');
  const leaf = (i: number) => container.querySelector(`[data-page="${i}"]`);
  const next = leaf(1)!;
  expect(next.className).toContain('hidden'); // pre-mounted, hidden
  expect(leaf(2)).toBeNull(); // only one flip ahead is mounted
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByText('2 / 5')).toBeTruthy();
  expect(leaf(1)).toBe(next); // same DOM node: images were not re-mounted
  expect(next.className).toContain('shown');
  expect(leaf(2)!.className).toContain('hidden');
  await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(screen.getByText('1 / 5')).toBeTruthy();
});

test('swipe left flips forward; short or vertical drags do not', async () => {
  reduced = true;
  const { container } = setup(vi.fn().mockResolvedValue(json(200, bundle)));
  await screen.findByText('1 / 5');
  // jsdom has no PointerEvent; a MouseEvent with isPrimary is enough here.
  vi.stubGlobal('PointerEvent', class extends MouseEvent { isPrimary = true; });
  const book = container.querySelector('.book')!;
  const drag = (dx: number, dy: number) => {
    fireEvent.pointerDown(book, { clientX: 200, clientY: 200, isPrimary: true });
    fireEvent.pointerUp(book, { clientX: 200 + dx, clientY: 200 + dy, isPrimary: true });
  };
  drag(-40, 0);
  drag(-60, -80);
  expect(screen.getByText('1 / 5')).toBeTruthy();
  drag(-60, 5);
  expect(screen.getByText('2 / 5')).toBeTruthy();
});

test("the album's background effect plays behind the book", async () => {
  const withFx = { ...bundle, album: { ...bundle.album, backgroundEffect: 'stars' as const } };
  const { container } = setup(vi.fn().mockResolvedValue(json(200, withFx)));
  await screen.findByText('1 / 5');
  expect(container.querySelector('main.viewer > .bgfx-stars')).not.toBeNull();
});

test("the viewer's desk uses the album's color", async () => {
  const withColor = { ...bundle, album: { ...bundle.album, backgroundColor: 'plum' as const } };
  const { container } = setup(vi.fn().mockResolvedValue(json(200, withColor)));
  await screen.findByText('1 / 5');
  expect(container.querySelector('main.viewer.desk-plum')).not.toBeNull();
});
