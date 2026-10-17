import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MediaDTO } from '@scrapbook/shared';
import { pollUntilSettled, useUpload } from '../src/editor/useUpload';

// Minimal Uppy stand-in: records the instance so the test can fire Uppy events at the hook.
const h = vi.hoisted(() => ({ uppy: null as null | { emit(ev: string, ...a: unknown[]): void }, removed: [] as string[] }));
vi.mock('@uppy/tus', () => ({ default: class {} }));
vi.mock('@uppy/core', () => ({
  default: class {
    handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    files: Record<string, unknown> = {};
    n = 0;
    constructor() { h.uppy = this; }
    use() { return this; }
    on(ev: string, f: (...a: unknown[]) => void) { (this.handlers[ev] ??= []).push(f); return this; }
    emit(ev: string, ...a: unknown[]) { this.handlers[ev]?.forEach((f) => f(...a)); }
    addFile(f: { name: string; meta: object }) { const id = `f${this.n++}`; this.files[id] = { id, ...f }; return id; }
    getFile(id: string) { return this.files[id]; }
    removeFile(id: string) { h.removed.push(id); delete this.files[id]; }
    retryUpload() { return Promise.resolve(); }
    destroy() {}
  },
}));

afterEach(cleanup);
const media = (status: MediaDTO['status']): MediaDTO => ({
  id: 'm1', albumId: 'a1', kind: 'image', status, width: null, height: null, durationSec: null, blurDataUrl: null, variants: null, error: null,
});

test('pollUntilSettled polls on the interval until ready', async () => {
  vi.useFakeTimers();
  const get = vi.fn().mockResolvedValueOnce(media('processing')).mockResolvedValueOnce(media('processing')).mockResolvedValue(media('ready'));
  let out: MediaDTO | undefined;
  void pollUntilSettled('m1', get, 3000).then((m) => { out = m; });
  await vi.advanceTimersByTimeAsync(2999);
  expect(get).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(6000);
  expect(get).toHaveBeenCalledTimes(3);
  expect(out?.status).toBe('ready');
  vi.useRealTimers();
});

test('pollUntilSettled also settles on failed', async () => {
  vi.useFakeTimers();
  const get = vi.fn().mockResolvedValue(media('failed'));
  const p = pollUntilSettled('m1', get, 3000);
  await vi.advanceTimersByTimeAsync(3000);
  expect((await p).status).toBe('failed');
  vi.useRealTimers();
});

const file = (name: string, type = 'image/jpeg') => new File(['x'], name, { type });

test('upload-success: mediaId is the last segment of uploadURL, passed to onCreated with the target frame', async () => {
  const onCreated = vi.fn();
  const { result } = renderHook(() => useUpload('a1', onCreated));
  act(() => result.current.add([file('a.jpg')], 'frame1'));
  const id = result.current.items[0].localId;
  act(() => h.uppy!.emit('upload-success', { id }, { uploadURL: '/api/uploads/0b8e2f6c-1d2a-4c3b-9e8f-7a6b5c4d3e2f' }));
  expect(onCreated).toHaveBeenCalledWith('0b8e2f6c-1d2a-4c3b-9e8f-7a6b5c4d3e2f', 'frame1');
  expect(result.current.items[0]).toMatchObject({ state: 'done', mediaId: '0b8e2f6c-1d2a-4c3b-9e8f-7a6b5c4d3e2f', progress: 1 });
  // Removing the file inside the success event makes @uppy/tus terminate (DELETE) the finished upload on the
  // server before the worker reads it: removal must wait until the plugin has released the upload.
  expect(h.removed).not.toContain(id);
  await new Promise((r) => setTimeout(r, 0));
  expect(h.removed).toContain(id);
});

test("upload-error: the server's HEIC 400 message is shown on the item", () => {
  const { result } = renderHook(() => useUpload('a1', vi.fn()));
  act(() => result.current.add([file('IMG_1.jpg')]));
  const id = result.current.items[0].localId;
  const msg = "HEIC not supported — choose 'Most Compatible' or let the browser convert to JPEG";
  act(() => h.uppy!.emit('upload-error', { id }, { name: 'Error', message: `tus: unexpected response while creating upload, response code: 400, response text: ${msg}` },
    { status: 400, body: { xhr: { responseText: msg } } }));
  expect(result.current.items[0]).toMatchObject({ state: 'error', error: msg });
});
