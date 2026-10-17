import { useEffect, useRef, useState } from 'react';
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
// known as soon as tus has that URL: onCreated fires then, once per item. It may return false to say the target
// frame wasn't available (the item then gets a notice). tus-js-client keeps each upload's URL in
// localStorage under the file's fingerprint, so re-adding / retrying an interrupted file resumes it.
const PAGE_CHANGED = 'added to tray — page changed';
const idOf = (url: string | null | undefined) => url?.split('/').pop() || null;

export function useUpload(albumId: string, onCreated: (mediaId: string, targetFrameId?: string) => boolean | void): Uploader {
  const [items, setItems] = useState<UploadItem[]>([]);
  const cb = useRef(onCreated);
  cb.current = onCreated;
  const ref = useRef<Uppy | null>(null);

  // Created in the effect (not in state) so StrictMode's mount → unmount → mount gets a live instance.
  useEffect(() => {
    const uppy = new Uppy({ autoProceed: true }).use(Tus, {
      endpoint: '/api/uploads',
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      allowedMetaFields: ['albumId', 'filename', 'filetype'],
      limit: 3,
    });
    ref.current = uppy;
    const patch = (id: string | undefined, p: Partial<UploadItem>) =>
      setItems((xs) => xs.map((x) => (x.localId === id ? { ...x, ...p } : x)));
    const created = new Set<string>();
    const announce = (fileId: string, mediaId: string | null) => {
      if (!mediaId || created.has(fileId)) return;
      created.add(fileId);
      const target = (uppy.getFile(fileId)?.meta as { targetFrameId?: string } | undefined)?.targetFrameId;
      const placed = cb.current(mediaId, target);
      patch(fileId, { mediaId, ...(target && placed === false && { notice: PAGE_CHANGED }) });
    };
    // @uppy/tus stores file.tus.uploadUrl right before each progress event (tus-js-client's own
    // onUploadUrlAvailable has no per-file context).
    uppy.on('upload-progress', (f, p) => {
      if (!f) return;
      patch(f.id, { progress: p.bytesTotal ? p.bytesUploaded / p.bytesTotal : 0 });
      announce(f.id, idOf((f as { tus?: { uploadUrl?: string } }).tus?.uploadUrl));
    });
    uppy.on('upload-pause', (f, paused) => patch(f?.id, { state: paused ? 'paused' : 'uploading' }));
    uppy.on('upload-success', (f, res) => {
      if (!f) return;
      announce(f.id, idOf(res.uploadURL)); // no-op if progress already announced it
      patch(f.id, { state: 'done', progress: 1 });
      // Done: drop the File so memory doesn't grow. Not synchronously: @uppy/tus emits this event before releasing
      // the upload, and a removal then terminates (DELETEs) the finished upload on the server.
      setTimeout(() => { if (uppy.getFile(f.id)) uppy.removeFile(f.id); });
    });
    uppy.on('upload-error', (f, err, res) => {
      const r = res as Resp;
      const error = r?.status === 413 ? 'File too large' : r?.status === 400 && r.body?.xhr?.responseText || err.message;
      const status = r?.status ?? 0;
      patch(f?.id, { state: 'error', error, retryable: !(status >= 400 && status < 500) });
    });
    return () => { uppy.destroy(); ref.current = null; };
  }, []);

  const add = (files: File[], targetFrameId?: string) => {
    const uppy = ref.current;
    if (!uppy) return;
    for (const file of files) {
      try {
        const localId = uppy.addFile({
          name: file.name, type: file.type, data: file,
          meta: { albumId, filename: file.name, filetype: file.type, targetFrameId },
        });
        setItems((xs) => [...xs, { localId, name: file.name, progress: 0, mediaId: null, state: 'uploading' }]);
      } catch (e) { // e.g. the same file is already uploading
        setItems((xs) => [...xs, { localId: `x${Date.now()}${xs.length}`, name: file.name, progress: 0, mediaId: null, state: 'error', error: (e as Error).message, retryable: false }]);
      }
    }
  };
  const retry = (localId: string) => {
    const uppy = ref.current;
    if (!uppy?.getFile(localId)) return;
    setItems((xs) => xs.map((x) => (x.localId === localId ? { ...x, state: 'uploading', error: undefined } : x)));
    void uppy.retryUpload(localId);
  };
  return { items, add, retry };
}
