import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DriveBackup } from '../src/manage/DriveBackup';
import type { DriveStatus } from '../src/api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const status = (over: Partial<DriveStatus>): DriveStatus => ({
  configured: true, connected: true, email: 'owner@example.com', schedule: 'weekly', status: 'ok', message: null,
  startedAt: '2026-10-18T20:00:00Z', finishedAt: '2026-10-18T20:05:00Z', bytesSent: 2 ** 30, lastBytes: 2 ** 30,
  nextRun: '2026-10-25T20:00:00Z', ...over,
});

function serve(s: DriveStatus, handlers: Record<string, () => Response> = {}) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handlers[`${method} ${url}`]?.() ?? new Response(JSON.stringify(s));
  }));
  render(<DriveBackup />);
  return calls;
}

test('not configured shows the setup link', async () => {
  serve(status({ configured: false, connected: false, email: null }));
  const link = await screen.findByRole('link', { name: 'Hướng dẫn cài đặt' });
  expect(link.getAttribute('href')).toContain('docs/google-drive-backup.md');
  expect(screen.queryByRole('button', { name: 'Kết nối Google Drive' })).toBeNull();
});

test('not connected offers Kết nối Google Drive', async () => {
  serve(status({ connected: false, email: null }));
  expect(await screen.findByRole('button', { name: 'Kết nối Google Drive' })).toBeTruthy();
});

test('connected shows email, schedule and last run; changing schedule PATCHes', async () => {
  const user = userEvent.setup();
  const calls = serve(status({}));
  expect(await screen.findByText(/owner@example.com/)).toBeTruthy();
  expect(screen.getByText(/1\.0 GB/)).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Hằng tuần' }).getAttribute('aria-checked')).toBe('true');
  await user.click(screen.getByRole('radio', { name: 'Hằng ngày' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ schedule: 'daily' }));
});

test('running shows progress and disables Backup ngay', async () => {
  serve(status({ status: 'running', bytesSent: 512 * 2 ** 20 }));
  expect(await screen.findByText(/Đang backup… 512 MB/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Backup ngay' })).toHaveProperty('disabled', true);
});

test('needs-reconnect shows the reason and Kết nối lại', async () => {
  serve(status({ status: 'needs-reconnect', message: 'Quyền truy cập Drive đã hết — bấm Kết nối lại.' }));
  expect(await screen.findByText('Quyền truy cập Drive đã hết — bấm Kết nối lại.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Kết nối lại' })).toBeTruthy();
});

test('Backup ngay 409 shows "Đang backup…"', async () => {
  const user = userEvent.setup();
  serve(status({}), { 'POST /api/manage/drive/run': () => new Response(JSON.stringify({ error: 'Đang backup…' }), { status: 409 }) });
  await user.click(await screen.findByRole('button', { name: 'Backup ngay' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Đang backup…');
});
