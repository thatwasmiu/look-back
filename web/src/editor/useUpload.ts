import { useEffect, useRef, useState } from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import type { MediaDTO } from '@scrapbook/shared';

export const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

export type UploadItem = {
  localId: string; name: string; progress: number; mediaId: string | null;
  state: 'uploading' | 'paused' | 'error' | 'done'; error?: string;
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

// Resumable uploads through tus (Uppy core + tus plugin, no Uppy UI). The tus upload id is the media row id,
// so the media id is the last segment of the upload URL. tus-js-client keeps each upload's URL in
// localStorage under the file's fingerprint, so re-adding / retrying an interrupted file resumes it.
export function useUpload(albumId: string, onCreated: (mediaId: string, targetFrameId?: string) => void): Uploader {
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
    uppy.on('upload-progress', (f, p) => patch(f?.id, { progress: p.bytesTotal ? p.bytesUploaded / p.bytesTotal : 0 }));
    uppy.on('upload-pause', (f, paused) => patch(f?.id, { state: paused ? 'paused' : 'uploading' }));
    uppy.on('upload-success', (f, res) => {
      if (!f) return;
      const mediaId = res.uploadURL?.split('/').pop() ?? null;
      patch(f.id, { state: 'done', progress: 1, mediaId });
      const target = (uppy.getFile(f.id)?.meta as { targetFrameId?: string } | undefined)?.targetFrameId;
      // Done: drop the File so memory doesn't grow. Not synchronously: @uppy/tus emits this event before releasing
      // the upload, and a removal then terminates (DELETEs) the finished upload on the server.
      setTimeout(() => { if (uppy.getFile(f.id)) uppy.removeFile(f.id); });
      if (mediaId) cb.current(mediaId, target);
    });
    uppy.on('upload-error', (f, err, res) => {
      const r = res as Resp;
      const error = r?.status === 413 ? 'File too large' : r?.status === 400 && r.body?.xhr?.responseText || err.message;
      patch(f?.id, { state: 'error', error });
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
        setItems((xs) => [...xs, { localId: `x${Date.now()}${xs.length}`, name: file.name, progress: 0, mediaId: null, state: 'error', error: (e as Error).message }]);
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
