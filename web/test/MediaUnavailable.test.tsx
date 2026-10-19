import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BlurImage } from '../src/render/BlurImage';

afterEach(cleanup);

test('a photo that fails to load shows the crying placeholder', () => {
  const { container } = render(<BlurImage blurDataUrl={null} src="/media/x/display.webp" objectPosition="50% 50%" scale={1} />);
  fireEvent.error(container.querySelector('img')!);
  expect(screen.getByText('Ảnh tạm thời không tải được')).toBeTruthy();
  expect(container.querySelector('img.sharp')).toBeNull();
});

test('media fetch falls back to a plain fetch when the CORS fetch fails (bucket without CORS)', async () => {
  let onFetch: ((e: unknown) => void) | undefined;
  const put = vi.fn();
  const fetchMock = vi.fn(async (r: { mode: string }) => {
    if (r.mode === 'cors') throw new TypeError('CORS');
    return new Response('plain');
  });
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { addEventListener: (type: string, f: (e: unknown) => void) => { if (type === 'fetch') onFetch = f; } },
    caches: { match: async () => undefined, open: async () => ({ put }), delete: async () => true },
    fetch: fetchMock, location: { origin: 'http://app.test' }, URL, Request, Response,
  });
  let responded: Promise<Response> | undefined;
  onFetch!({
    // what an <img> asks for: GET, no-cors
    request: { method: 'GET', mode: 'no-cors', url: 'http://app.test/media/abc/display.webp', headers: new Headers() },
    respondWith: (p: Promise<Response>) => { responded = p; },
  });
  expect(await (await responded!).text()).toBe('plain');
  expect(fetchMock.mock.calls[0][0].mode).toBe('cors');
  expect(put).not.toHaveBeenCalled();
});
