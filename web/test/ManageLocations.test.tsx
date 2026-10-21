import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Manage from '../src/pages/Manage';
import type { ManageInfo, StorageLocation } from '../src/api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const loc = (over: Partial<StorageLocation>): StorageLocation => ({
  id: 'l1', name: 'R2', kind: 's3', endpoint: 'https://x', region: 'auto', bucket: 'b', accessKeyId: 'AK', capBytes: 10 * 2 ** 30,
  status: 'ok', statusMessage: null, checkedAt: null, files: 0, bytes: 0, pendingDeletes: 0, ...over,
});
const file = (id: string) => ({ id, albumId: 'a1', albumTitle: 'Đà Lạt', kind: 'image' as const, status: 'ready', name: `${id}.jpg`, error: null,
  createdAt: '2026-10-19T00:00:00Z', bytes: 1000, used: false, thumb: null, location: null, movingTo: null, moveError: null });
const info: ManageInfo = { disk: { total: 100, free: 50 }, mediaBytes: 2000, dbBytes: 1, files: [file('f1'), file('f2')] };

function serve(locations: StorageLocation[], handlers: Record<string, (body: unknown) => Response> = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const h = handlers[`${method} ${url}`];
    if (h) return h(body);
    if (url === '/api/manage/locations') return new Response(JSON.stringify(locations));
    return new Response(JSON.stringify(info));
  }));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Manage /></MemoryRouter>);
  return calls;
}

test('locations list has no secret and shows status copy', async () => {
  serve([loc({ id: 'l1', name: 'R2', status: 'error', statusMessage: 'InvalidAccessKeyId' }), loc({ id: 'l2', name: 'B2', status: 'needs-keys' })]);
  expect(await screen.findByText(/Can't connect: InvalidAccessKeyId/)).toBeTruthy();
  expect(screen.getByText(/keys needed again/)).toBeTruthy();
});

test('adding shows the server error and keeps the form', async () => {
  const user = userEvent.setup();
  serve([], { 'POST /api/manage/locations': () => new Response(JSON.stringify({ error: 'put: 403 InvalidAccessKeyId' }), { status: 400 }) });
  await user.click(await screen.findByRole('button', { name: '+ Add a location' }));
  await user.type(screen.getByLabelText('Name'), 'R2');
  await user.clear(screen.getByLabelText('Endpoint'));
  await user.type(screen.getByLabelText('Endpoint'), 'https://acc.r2.cloudflarestorage.com');
  await user.type(screen.getByLabelText('Bucket'), 'photos');
  await user.type(screen.getByLabelText('Access key ID'), 'AK');
  await user.type(screen.getByLabelText('Secret key'), 'SK');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('put: 403 InvalidAccessKeyId')).toBeTruthy();
  expect((screen.getByLabelText('Bucket') as HTMLInputElement).value).toBe('photos');
});

test('drop needs the exact name', async () => {
  const user = userEvent.setup();
  const calls = serve([loc({ id: 'l1', name: 'R2', files: 3 })], { 'POST /api/manage/locations/l1/drop': () => new Response(JSON.stringify({ dropped: 3 })) });
  await user.click(await screen.findByRole('button', { name: 'Drop this location' }));
  const go = screen.getByRole('button', { name: 'Drop location' });
  expect(go).toHaveProperty('disabled', true);
  await user.type(screen.getByLabelText('Location name'), 'R2');
  expect(go).toHaveProperty('disabled', false);
  await user.click(go);
  await waitFor(() => expect(calls.find((c) => c.url === '/api/manage/locations/l1/drop')?.body).toEqual({ confirmName: 'R2' }));
});

test('move selected files; a refusal is shown verbatim', async () => {
  const user = userEvent.setup();
  const calls = serve([loc({ id: 'l1', name: 'R2' })], {
    'POST /api/manage/move': () => new Response(JSON.stringify({ error: 'Vượt giới hạn dung lượng của R2' }), { status: 409 }),
  });
  await user.click(await screen.findByLabelText('Select all'));
  await user.click(screen.getByRole('button', { name: 'Move to…' }));
  await user.click(screen.getByRole('menuitem', { name: 'R2' }));
  await waitFor(() => expect(calls.find((c) => c.url === '/api/manage/move')?.body).toEqual({ mediaIds: ['f1', 'f2'], to: 'l1' }));
  expect(await screen.findByText('Vượt giới hạn dung lượng của R2')).toBeTruthy();
});

test('Manage is a lazy chunk', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  expect(app).toContain("lazy(() => import('./pages/Manage'))");
  expect(app).not.toMatch(/^import Manage /m);
});
