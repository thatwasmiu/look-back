import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import SharedAlbum from '../src/pages/SharedAlbum';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null, mode: 'scrapbook', readingDirection: 'ltr' },
  pages: [{ id: 'p0', albumId: 'a1', position: 0, layout: { background: 'paper-cream', elements: [] } }], media: [],
};
const open = (token: string) => render(
  <MemoryRouter initialEntries={[`/s/${token}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/s/:token" element={<SharedAlbum />} /></Routes>
  </MemoryRouter>,
);

test('a share link opens the album read-only: no login, no Edit, no link to the album list', async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(200, bundle));
  vi.stubGlobal('fetch', fetchMock);
  open('tok');
  expect(await screen.findByText('Trip')).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith('/api/share/tok', expect.anything());
  expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  expect(screen.queryByRole('link', { name: /Albums/ })).toBeNull();
});

test('a dead or wrong link says so instead of sending people to the login page', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { error: 'not found' })));
  open('dead');
  expect(await screen.findByText(/không còn được chia sẻ/)).toBeTruthy(); // quiet request: no redirect to /login
});
