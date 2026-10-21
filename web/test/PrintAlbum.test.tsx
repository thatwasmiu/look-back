import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import PrintAlbum from '../src/pages/PrintAlbum';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const bundle: AlbumBundle = {
  album: { id: 'a1', title: 'Đà Lạt', coverMediaId: null, musicMediaId: null, shareToken: null, backgroundEffect: 'none', backgroundColor: 'walnut', mode: 'scrapbook', readingDirection: 'ltr', createdAt: '', updatedAt: '' },
  pages: [0, 1, 2].map((i) => ({ id: `p${i}`, albumId: 'a1', position: i, layout: { background: 'paper-cream', elements: [] } })),
  media: [],
} as unknown as AlbumBundle;

test('print view: one sheet per page, then the print dialog opens once by itself', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(bundle), { status: 200 })));
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const { container } = render(
    <MemoryRouter initialEntries={['/albums/a1/print']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/albums/:id/print" element={<PrintAlbum />} /></Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Đà Lạt' })).toBeTruthy();
  expect(container.querySelectorAll('.print-sheet')).toHaveLength(3);
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeTruthy();
});

test('print leaves hidden pages out', async () => {
  const withHidden = { ...bundle, pages: bundle.pages.map((p, i) => (i === 0 ? { ...p, layout: { ...p.layout, hidden: true } } : p)) };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(withHidden), { status: 200 })));
  vi.spyOn(window, 'print').mockImplementation(() => {});
  const { container } = render(
    <MemoryRouter initialEntries={['/albums/a1/print']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/albums/:id/print" element={<PrintAlbum />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Đà Lạt' });
  expect(container.querySelectorAll('.print-sheet')).toHaveLength(2);
});
