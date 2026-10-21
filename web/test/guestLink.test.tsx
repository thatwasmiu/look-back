import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Login from '../src/pages/Login';
import GuestEdit from '../src/pages/GuestEdit';
import { lastGuestLink, parseShareInput } from '../src/guestLink';

const T = 'A'.repeat(43);
beforeEach(() => { localStorage.clear(); document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest">'; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const app = (at: string) => render(
  <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/e/:token" element={<><GuestEdit /><Where /></>} />
      <Route path="/s/:token" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);
const bundle = {
  album: { id: 'a1', title: 'Đi chơi', coverMediaId: null, backgroundEffect: 'none', backgroundColor: 'walnut', shareToken: null, musicMediaId: null,
    mode: 'scrapbook', readingDirection: 'ltr', editToken: null, editExpiresAt: new Date(Date.now() + 3600_000).toISOString() },
  pages: [{ id: 'p0', albumId: 'a1', position: 0, layout: { background: 'paper-cream', elements: [] } }], media: [],
};

test('parseShareInput takes a full link, a path or a bare code', () => {
  expect(parseShareInput(`https://lookback.daste.io.vn/e/${T}`)).toBe(`/e/${T}`);
  expect(parseShareInput(` /s/${T}?app `)).toBe(`/s/${T}`);
  expect(parseShareInput(T)).toBe(T);
  expect(parseShareInput('hello')).toBeNull();
});

test('an edit link points "Add to Home Screen" at itself and is remembered', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, bundle)));
  app(`/e/${T}`);
  await screen.findByText(/Link sửa · đến/);
  expect(document.querySelector('link[rel="manifest"]')!.getAttribute('href')).toBe(`/api/manifest/e/${T}`);
  expect(lastGuestLink()).toBe(`/e/${T}`);
});

test('an expired edit link is forgotten', async () => {
  localStorage.setItem('lb.guestLink', `/e/${T}`);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { error: 'not found' })));
  app(`/e/${T}`);
  await screen.findByText(/hết hạn hoặc đã bị thu hồi/);
  expect(lastGuestLink()).toBeNull();
});

test('login: continue with the last shared album, or paste a link or code', async () => {
  localStorage.setItem('lb.guestLink', `/e/${T}`);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, {})));
  app('/login');
  await userEvent.click(screen.getByRole('button', { name: 'Mở album được chia sẻ lần trước' }));
  expect(screen.getByTestId('where').textContent).toBe(`/e/${T}`);
});

test('login: a pasted view link opens it; a bare code tries edit first, then view', async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(404, {}));
  vi.stubGlobal('fetch', fetchMock);
  app('/login');
  await userEvent.type(screen.getByLabelText('Link hoặc mã chia sẻ'), T);
  await userEvent.click(screen.getByRole('button', { name: 'Mở' }));
  expect(await screen.findByTestId('where')).toHaveProperty('textContent', `/s/${T}`);
  expect(fetchMock).toHaveBeenCalledWith(`/api/edit/${T}`, expect.anything());
});

test('login: rubbish in the code box says so', async () => {
  vi.stubGlobal('fetch', vi.fn());
  app('/login');
  await userEvent.type(screen.getByLabelText('Link hoặc mã chia sẻ'), 'abc');
  await userEvent.click(screen.getByRole('button', { name: 'Mở' }));
  expect(screen.getByText(/Link hoặc mã không đúng/)).toBeTruthy();
});
