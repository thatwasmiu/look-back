import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Manage, { fmtBytes } from '../src/pages/Manage';
import type { ManageInfo } from '../src/api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const file = (id: string, bytes: number, used: boolean, status = 'ready') => ({
  id, albumId: 'a1', albumTitle: 'Đà Lạt', kind: 'image' as const, status, name: `${id}.jpg`, error: null,
  createdAt: '2026-10-19T00:00:00Z', bytes, used, thumb: null, location: null, movingTo: null, moveError: null,
});
const info: ManageInfo = {
  disk: { total: 100 * 2 ** 30, free: 60 * 2 ** 30 }, mediaBytes: 7 * 2 ** 20, dbBytes: 2 ** 20,
  files: [file('used1', 5 * 2 ** 20, true), file('old1', 2 ** 20, false), file('bad1', 2 ** 20, false, 'failed')],
};

test('fmtBytes', () => {
  expect(fmtBytes(512)).toBe('512 B');
  expect(fmtBytes(1536)).toBe('1.5 KB');
  expect(fmtBytes(40 * 2 ** 30)).toBe('40 GB');
});

test('/manage: storage, backup link, unused files by default; deleting asks first, then removes and reloads', async () => {
  const user = userEvent.setup();
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (url === '/api/manage/locations') return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(info), { status: 200 });
  }));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Manage /></MemoryRouter>);
  expect(await screen.findByText(/còn trống/)).toBeTruthy();
  expect(screen.getByText('60 GB', { selector: 'b' })).toBeTruthy();
  expect(screen.getByRole('link', { name: '⬇ Download backup' }).getAttribute('href')).toBe('/api/manage/backup');
  // Default filter: not used anywhere (the failed upload counts too).
  expect(screen.getByText('old1.jpg')).toBeTruthy();
  expect(screen.getByText('bad1.jpg')).toBeTruthy();
  expect(screen.queryByText('used1.jpg')).toBeNull();

  await user.click(screen.getByLabelText('Chọn tất cả'));
  await user.click(screen.getByRole('button', { name: /^Xóa 2 file/ }));
  expect(screen.getByRole('alert').textContent).toContain('Không hoàn tác được');
  await user.click(screen.getByRole('button', { name: 'Xóa' }));
  await waitFor(() => expect(calls.filter((c) => c.startsWith('DELETE'))).toEqual(['DELETE /api/media/old1', 'DELETE /api/media/bad1']));
  await waitFor(() => expect(calls.filter((c) => c === 'GET /api/manage')).toHaveLength(2)); // reloaded after deleting
});
