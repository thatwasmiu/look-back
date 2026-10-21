import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiSettings } from '../src/manage/AiSettings';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

function serve(handlers: Record<string, (body: any) => unknown>) {
  const calls: { method: string; url: string; body: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    return json(handlers[`${method} ${url}`]?.(body) ?? { hasKey: true, last4: 'abcd', model: 'gemini-3.8-flash' });
  }));
  render(<AiSettings />);
  return calls;
}

test('shows only the last 4 chars of the saved key', async () => {
  serve({});
  expect(await screen.findByText(/••••abcd/)).toBeTruthy();
  expect((screen.getByLabelText('Gemini model') as HTMLInputElement).value).toBe('gemini-3.8-flash');
});

test('saving a key sends it once and clears the input', async () => {
  const calls = serve({ 'GET /api/manage/ai': () => ({ hasKey: false, last4: null, model: 'gemini-3.8-flash' }) });
  expect(await screen.findByText('No key yet')).toBeTruthy();
  const input = screen.getByLabelText('Gemini API key') as HTMLInputElement;
  expect(input.type).toBe('password');
  await userEvent.type(input, 'AIzaSyTESTKEY-0123456789wxyz');
  await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ key: 'AIzaSyTESTKEY-0123456789wxyz' }));
  expect(input.value).toBe('');
  expect(await screen.findByText(/••••abcd/)).toBeTruthy();
});

test('Thử shows the result', async () => {
  serve({ 'POST /api/manage/ai/test': () => ({ ok: false, error: 'Key Gemini không hợp lệ.' }) });
  await userEvent.click(await screen.findByRole('button', { name: 'Test' }));
  expect(await screen.findByText('Key Gemini không hợp lệ.')).toBeTruthy();
});
