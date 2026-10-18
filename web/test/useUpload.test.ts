import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MediaDTO } from '@scrapbook/shared';
import { pollUntilSettled, useUpload } from '../src/editor/useUpload';

// Minimal Uppy stand-in: records the instance so the test can fire Uppy events at the hook.
const h = vi.hoisted(() => ({
  uppy: null as null | { emit(ev: string, ...a: unknown[]): void }, removed: [] as string[], created: 0, killed: [] as string[],
}));
vi.mock('@uppy/tus', () => ({ default: class {} }));
vi.mock('@uppy/core', () => ({
  default: class {
    handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    files: Record<string, unknown> = {};
    n = 0;
    constructor() { h.uppy = this; h.created++; }
    use() { return this; }
    on(ev: string, f: (...a: unknown[]) => void) { (this.handlers[ev] ??= []).push(f); return this; }
    emit(ev: string, ...a: unknown[]) { this.handlers[ev]?.forEach((f) => f(...a)); }
    addFile(f: { name: string; meta: object }) { const id = `f${this.n++}`; this.files[id] = { id, ...f }; return id; }
    getFile(id: string) { return this.files[id]; }
    removeFile(id: string) { h.removed.push(id); delete this.files[id]; }
    retryUpload() { return Promise.resolve(); }
    // Any of these sends a tus DELETE (or drops resume state) for unfinished uploads.
    destroy() { h.killed.push('destroy'); }
    cancelAll() { h.killed.push('cancelAll'); }
    clear() { h.killed.push('clear'); }
  },
}));

afterEach(cleanup);
let n = 0;
const album = () => `album${++n}`;
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
  const { result } = renderHook((a: string) => useUpload(a, onCreated), { initialProps: album() });
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

test('mediaId is known as soon as tus has the upload URL: onCreated fires then (once), not only on success', () => {
  const onCreated = vi.fn();
  const { result } = renderHook((a: string) => useUpload(a, onCreated), { initialProps: album() });
  act(() => result.current.add([file('big.mp4', 'video/mp4')], 'frame1'));
  const id = result.current.items[0].localId;
  const url = '/api/uploads/11111111-2222-4333-8444-555555555555';
  act(() => h.uppy!.emit('upload-progress', { id, tus: { uploadUrl: url } }, { bytesUploaded: 10, bytesTotal: 100 }));
  expect(onCreated).toHaveBeenCalledWith('11111111-2222-4333-8444-555555555555', 'frame1');
  expect(result.current.items[0]).toMatchObject({ state: 'uploading', mediaId: '11111111-2222-4333-8444-555555555555', progress: 0.1 });
  act(() => h.uppy!.emit('upload-progress', { id, tus: { uploadUrl: url } }, { bytesUploaded: 50, bytesTotal: 100 }));
  act(() => h.uppy!.emit('upload-success', { id }, { uploadURL: url }));
  expect(onCreated).toHaveBeenCalledTimes(1);
  expect(result.current.items[0].state).toBe('done');
});

test('onCreated returning false (target frame no longer on the page) leaves a notice on the item', () => {
  const { result } = renderHook((a: string) => useUpload(a, () => false), { initialProps: album() });
  act(() => result.current.add([file('a.jpg')], 'frame1'));
  const id = result.current.items[0].localId;
  act(() => h.uppy!.emit('upload-progress', { id, tus: { uploadUrl: '/api/uploads/u1' } }, { bytesUploaded: 1, bytesTotal: 2 }));
  expect(result.current.items[0].notice).toBe('đã vào Photos — trang đã đổi');
});

test("upload-error: the server's HEIC 400 message is shown on the item", () => {
  const { result } = renderHook((a: string) => useUpload(a, vi.fn()), { initialProps: album() });
  act(() => result.current.add([file('IMG_1.jpg')]));
  const id = result.current.items[0].localId;
  const msg = "HEIC not supported — choose 'Most Compatible' or let the browser convert to JPEG";
  act(() => h.uppy!.emit('upload-error', { id }, { name: 'Error', message: `tus: unexpected response while creating upload, response code: 400, response text: ${msg}` },
    { status: 400, body: { xhr: { responseText: msg } } }));
  expect(result.current.items[0]).toMatchObject({ state: 'error', error: msg, retryable: false });
});

test('the uploader outlives the editor: unmount never destroys/cancels, remount reuses it and shows its items', () => {
  const albumId = album();
  const first = renderHook(() => useUpload(albumId, vi.fn()));
  act(() => first.result.current.add([file('big.mp4', 'video/mp4')]));
  const made = h.created;
  first.unmount();
  expect(h.killed).toEqual([]);
  const second = renderHook(() => useUpload(albumId, vi.fn()));
  expect(h.created).toBe(made);
  expect(second.result.current.items).toMatchObject([{ name: 'big.mp4', state: 'uploading' }]);
  // Progress made while no editor was mounted is kept.
  const id = second.result.current.items[0].localId;
  second.unmount();
  act(() => h.uppy!.emit('upload-progress', { id, tus: { uploadUrl: '/api/uploads/u9' } }, { bytesUploaded: 1, bytesTotal: 4 }));
  const third = renderHook(() => useUpload(albumId, vi.fn()));
  expect(third.result.current.items[0]).toMatchObject({ progress: 0.25, mediaId: 'u9' });
  expect(renderHook((a: string) => useUpload(a, vi.fn()), { initialProps: album() }).result.current.items).toEqual([]); // other albums: not shown
  expect(h.killed).toEqual([]);
});

test('beforeunload warns only while an upload is unfinished', () => {
  const { result } = renderHook((a: string) => useUpload(a, vi.fn()), { initialProps: album() });
  act(() => result.current.add([file('w.jpg')]));
  const id = result.current.items[0].localId;
  const fire = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
  expect(fire()).toBe(true);
  expect(id).toBeTruthy();
  // The uploader is app-wide: finish every file still in it (earlier tests' too).
  const files = Object.keys((h.uppy as unknown as { files: object }).files);
  act(() => files.forEach((f, i) => h.uppy!.emit('upload-success', { id: f }, { uploadURL: `/api/uploads/w${i}` })));
  expect(fire()).toBe(false);
});
