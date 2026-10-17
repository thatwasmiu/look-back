import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
