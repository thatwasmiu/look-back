import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import GuestEdit from '../src/pages/GuestEdit';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Đi chơi', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null,
    mode: 'scrapbook', readingDirection: 'ltr', editToken: null, editExpiresAt: new Date(Date.now() + 3600_000).toISOString() },
  pages: [{ id: 'p0', albumId: 'a1', position: 0, layout: { background: 'paper-cream', elements: [] } }],
  media: [],
};
const open = (fetchMock: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter initialEntries={['/e/TOKEN']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/e/:token" element={<GuestEdit />} /></Routes></MemoryRouter>);
};

test('an edit link opens the album in the guest editor', async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(200, bundle));
  open(fetchMock);
  expect(await screen.findByText(/Edit link · until/)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith('/api/edit/TOKEN', expect.anything());
  expect(screen.queryByRole('button', { name: 'Add page' })).toBeNull();
});

test('an expired or revoked link says so', async () => {
  open(vi.fn().mockResolvedValue(json(404, { error: 'not found' })));
  expect(await screen.findByText(/hết hạn hoặc đã bị thu hồi/)).toBeTruthy();
});
