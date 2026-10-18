import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import type { MediaDTO } from '@scrapbook/shared';

export const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

export type UploadItem = {
  localId: string; name: string; progress: number; mediaId: string | null;
  state: 'uploading' | 'paused' | 'error' | 'done'; error?: string;
  retryable?: boolean; // false for 4xx (HEIC, too large): retrying can't help
  notice?: string;
};
export type Uploader = { items: UploadItem[]; add(files: File[], targetFrameId?: string): void; retry(localId: string): void };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolves once the worker has finished with the media (ready or failed). Errors from `get` propagate.
export async function pollUntilSettled(id: string, get: (id: string) => Promise<MediaDTO>, intervalMs = 3000): Promise<MediaDTO> {
  for (;;) {
    await sleep(intervalMs);
    const m = await get(id);
    if (m.status === 'ready' || m.status === 'failed') return m;
  }
}

type Resp = { status?: number; body?: { xhr?: { responseText?: string } } } | undefined;

// Resumable uploads through tus (Uppy core + tus plugin, no Uppy UI). The tus upload id is the media row id
// (created server-side with status 'uploading'), so the media id is the last segment of the upload URL and is
// known as soon as tus has that URL: onCreated fires then, once per item, if an editor for that album is mounted.
// It may return false to say the target frame wasn't available (the item then gets a notice). tus-js-client keeps
// each upload's URL in localStorage under the file's fingerprint, so re-adding / retrying an interrupted file resumes it.
//
// One Uppy for the whole app, created on first use and never destroyed: destroy()/cancelAll() would send a tus
// DELETE for every unfinished upload. Uploads keep going while the user browses; the editor only subscribes.
const PAGE_CHANGED = 'đã vào Photos — trang đã đổi';
const idOf = (url: string | null | undefined) => url?.split('/').pop() || null;

type Item = UploadItem & { albumId: string };
type OnCreated = (mediaId: string, targetFrameId?: string) => boolean | void;
let uppy: Uppy | null = null;
let items: Item[] = []; // ponytail: never pruned; fine for a session's worth of uploads
const subs = new Set<() => void>();
const editors = new Map<string, { current: OnCreated }>(); // albumId → mounted editor's onCreated
const set = (next: Item[]) => { items = next; subs.forEach((f) => f()); };
const patch = (id: string | undefined, p: Partial<UploadItem>) => set(items.map((x) => (x.localId === id ? { ...x, ...p } : x)));
export const uploadsInProgress = () => items.some((x) => x.state === 'uploading' || x.state === 'paused');

function getUppy(): Uppy {
  if (uppy) return uppy;
  const u = new Uppy({ autoProceed: true }).use(Tus, {
    endpoint: '/api/uploads',
    chunkSize: 50 * 1024 * 1024,
    retryDelays: [0, 1000, 3000, 5000, 10000],
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    allowedMetaFields: ['albumId', 'filename', 'filetype'],
    limit: 3,
  });
  uppy = u;
  const created = new Set<string>();
  const announce = (fileId: string, mediaId: string | null) => {
    if (!mediaId || created.has(fileId)) return;
    created.add(fileId);
    const meta = u.getFile(fileId)?.meta as { albumId?: string; targetFrameId?: string } | undefined;
    const target = meta?.targetFrameId;
    const editor = meta?.albumId ? editors.get(meta.albumId) : undefined;
    const placed = editor ? editor.current(mediaId, target) : false;
    patch(fileId, { mediaId, ...(target && placed === false && { notice: PAGE_CHANGED }) });
  };
  // @uppy/tus stores file.tus.uploadUrl right before each progress event (tus-js-client's own
  // onUploadUrlAvailable has no per-file context).
  u.on('upload-progress', (f, p) => {
    if (!f) return;
    patch(f.id, { progress: p.bytesTotal ? p.bytesUploaded / p.bytesTotal : 0 });
    announce(f.id, idOf((f as { tus?: { uploadUrl?: string } }).tus?.uploadUrl));
  });
  u.on('upload-pause', (f, paused) => patch(f?.id, { state: paused ? 'paused' : 'uploading' }));
  u.on('upload-success', (f, res) => {
    if (!f) return;
    announce(f.id, idOf(res.uploadURL)); // no-op if progress already announced it
    patch(f.id, { state: 'done', progress: 1 });
    // Done: drop the File so memory doesn't grow. Not synchronously: @uppy/tus emits this event before releasing
    // the upload, and a removal then terminates (DELETEs) the finished upload on the server.
    setTimeout(() => { if (u.getFile(f.id)) u.removeFile(f.id); });
  });
  u.on('upload-error', (f, err, res) => {
    const r = res as Resp;
    const error = r?.status === 413 ? 'File quá lớn' : r?.status === 400 && r.body?.xhr?.responseText || err.message;
    const status = r?.status ?? 0;
    const retryable = !(status >= 400 && status < 500);
    patch(f?.id, { state: 'error', error, retryable });
    // A 4xx can't succeed on retry: drop the file from Uppy, or choosing the same file again is refused as a
    // duplicate. (Deferred like on success, so @uppy/tus has released the upload first.)
    if (!retryable && f) setTimeout(() => { if (u.getFile(f.id)) u.removeFile(f.id); });
  });
  window.addEventListener('beforeunload', (e) => {
    if (!uploadsInProgress()) return;
    e.preventDefault();
    e.returnValue = ''; // older browsers
  });
  return u;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => items;

export function useUpload(albumId: string, onCreated: OnCreated): Uploader {
  const all = useSyncExternalStore(subscribe, snapshot);
  const albumItems = useMemo(() => all.filter((x) => x.albumId === albumId), [all, albumId]);
  const cb = useRef(onCreated);
  cb.current = onCreated;
  useEffect(() => {
    editors.set(albumId, cb);
    return () => { if (editors.get(albumId) === cb) editors.delete(albumId); };
  }, [albumId]);

  const add = (files: File[], targetFrameId?: string) => {
    const u = getUppy();
    for (const file of files) {
      try {
        const localId = u.addFile({
          name: file.name, type: file.type, data: file,
          meta: { albumId, filename: file.name, filetype: file.type, targetFrameId },
        });
        set([...items, { albumId, localId, name: file.name, progress: 0, mediaId: null, state: 'uploading' }]);
      } catch { // Uppy refuses a file that is still in its queue: the same file is already uploading
        set([...items, { albumId, localId: `x${Date.now()}${items.length}`, name: file.name, progress: 0, mediaId: null, state: 'error', error: 'File này đang được tải lên', retryable: false }]);
      }
    }
  };
  const retry = (localId: string) => {
    if (!uppy?.getFile(localId)) return;
    patch(localId, { state: 'uploading', error: undefined });
    void uppy.retryUpload(localId);
  };
  return { items: albumItems, add, retry };
}
