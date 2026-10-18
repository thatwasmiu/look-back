import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import Viewer from '../src/pages/Viewer';

let reduced = false;
let wide = false; // two-page spreads
beforeEach(() => {
  reduced = false;
  wide = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduced-motion') ? reduced : wide, // default phone: single-page mode
    addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null, mode: 'scrapbook', readingDirection: 'ltr' },
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

test('the built-in example album opens without the server and has no Edit button', async () => {
  const { EXAMPLE_ALBUM_ID } = await import('../src/example/lookBack');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={[`/albums/${EXAMPLE_ALBUM_ID}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/albums/:id" element={<Viewer />} /></Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText('Look Back — a tribute')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/albums/'), expect.anything());
});

test('album music: ♪ appears when the track is ready; the first tap starts it, the button pauses it', async () => {
  const song = { id: 'm9', albumId: 'a1', kind: 'audio', status: 'ready', width: null, height: null, durationSec: 120, blurDataUrl: null, error: null, variants: { audio: 'm9/audio.m4a', original: 'm9/audio.m4a' } };
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
  setup(vi.fn().mockResolvedValue(json(200, { ...bundle, album: { ...bundle.album, musicMediaId: 'm9' }, media: [song] })));
  const btn = await screen.findByRole('button', { name: 'Play music' });
  expect(document.querySelector('audio')!.getAttribute('src')).toBe('/media/m9/audio.m4a');
  fireEvent.pointerDown(document.body);
  expect(play).toHaveBeenCalledTimes(1);
  await userEvent.click(await screen.findByRole('button', { name: 'Pause music' }));
  expect(pause).toHaveBeenCalled();
  expect(btn.getAttribute('aria-pressed')).toBe('false');
});

const rtl = { ...bundle, album: { ...bundle.album, mode: 'manga' as const, readingDirection: 'rtl' as const } };

test('right-to-left manga, one page at a time: ← reads forward to the last page, → goes back, nothing skipped', async () => {
  reduced = true;
  setup(vi.fn().mockResolvedValue(json(200, rtl)));
  await screen.findByText('1 / 5');
  for (const n of [2, 3, 4, 5]) {
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(`${n} / 5`)).toBeTruthy();
  }
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(screen.getByText('5 / 5')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByText('4 / 5')).toBeTruthy();
  // the left edge button is "next" when reading right-to-left
  expect(screen.getByRole('button', { name: 'Next page' }).className).toContain('edge-prev');
});

test('right-to-left spreads: the cover sits alone on the left, then the earlier page of a spread is on the right', async () => {
  reduced = true;
  wide = true;
  const { container } = setup(vi.fn().mockResolvedValue(json(200, rtl)));
  await screen.findByText('1 / 5');
  expect(container.querySelector('[data-page="0"]')!.className).toContain('left');
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(screen.getByText('2–3 / 5')).toBeTruthy();
  expect(container.querySelector('[data-page="1"]')!.className).toContain('right');
  expect(container.querySelector('[data-page="2"]')!.className).toContain('left');
});
