import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '../src/pages/Login';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return fetchMock;
}

async function submit() {
  await userEvent.type(screen.getByLabelText(/password/i), 'secret');
  await userEvent.click(screen.getByRole('button', { name: /enter/i }));
}

test('204 posts the password and navigates to /', async () => {
  const f = setup(204);
  await submit();
  expect(await screen.findByText('home')).toBeTruthy();
  const [url, init] = f.mock.calls[0];
  expect(url).toBe('/api/auth/login');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ password: 'secret' });
});

test('401 shows Wrong password', async () => {
  setup(401);
  await submit();
  expect(await screen.findByText('Wrong password')).toBeTruthy();
});
