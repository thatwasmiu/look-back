import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AlbumList from '../src/pages/AlbumList';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AlbumList /></MemoryRouter>);
}

test('500 on load shows an error, not the empty state', async () => {
  setup(vi.fn().mockResolvedValue(json(500, { error: 'boom' })));
  expect(await screen.findByText(/Couldn't load albums/)).toBeTruthy();
  expect(screen.queryByText('No albums yet.')).toBeNull();
});

test('create failure shows an inline error', async () => {
  setup(vi.fn().mockResolvedValueOnce(json(200, [])).mockResolvedValueOnce(json(500, { error: 'boom' })));
  await userEvent.click(await screen.findByRole('button', { name: 'New album' }));
  await userEvent.type(screen.getByLabelText('Album title'), 'Trip');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByText("Couldn't create album")).toBeTruthy();
});

test('the built-in example album is listed (view only) after your albums', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AlbumList /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: /Look Back — a tribute/ });
  expect(link.getAttribute('href')).toBe('/albums/example-look-back');
  expect(screen.getByText(/Example/)).toBeTruthy();
});

test('Delete asks first; Cancel keeps the album, Delete removes it via the API', async () => {
  const album = { id: 'a1', title: 'Trip', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', coverThumb: null, pageCount: 2 };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, [album])).mockResolvedValueOnce(new Response(null, { status: 204 }));
  setup(fetchMock);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Trip' }));
  expect(screen.getByRole('alertdialog').textContent).toContain("can't be undone");
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole('button', { name: 'Delete Trip' }));
  await userEvent.click(screen.getByRole('button', { name: 'Delete album' }));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/albums/a1', expect.objectContaining({ method: 'DELETE' }));
  await waitFor(() => expect(screen.queryByRole('link', { name: /^Trip/ })).toBeNull());
});
