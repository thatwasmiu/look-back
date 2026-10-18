// Dev-only editor against a fake api (route /dev/editor). Pages persist in sessionStorage so "reload → layout
// persisted" can be checked; ?reset starts over from the /dev/preview sample pages.
// Uploads are faked too: a media row in 'uploading' as soon as the upload "starts" (like tus create), progress
// ticks, then 'processing' that turns 'ready' (showing one of the sample photos) ~4 s later. A file named *.heic fails like the server's HEIC check.
import { useEffect, useRef, useState } from 'react';
import type { BackgroundColor, BackgroundEffect, AlbumBundle, MediaDTO, PageDTO } from '@scrapbook/shared';
import { instantiateTemplate } from '@scrapbook/shared';
import { EditorView, type EditorApi } from '../pages/Editor';
import type { Uploader, UploadItem } from '../editor/useUpload';
import { media as sampleMedia, pages as samples } from './Preview';
import blur from './samples/blur.json';

const KEY = 'dev-editor-pages';
const MKEY = 'dev-editor-media';
if (new URLSearchParams(location.search).has('reset')) { sessionStorage.removeItem(KEY); sessionStorage.removeItem(MKEY); }
let pages: PageDTO[] = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
  ?? samples.slice(0, 3).map((p, i) => ({ id: `page${i}`, albumId: 'dev', position: i, layout: p.layout }));
const media = new Map<string, MediaDTO & { readyAt?: number }>(JSON.parse(sessionStorage.getItem(MKEY) ?? 'null') ?? [...sampleMedia]);
let cover: string | null = null;
let bg: BackgroundEffect = 'snow';
let desk: BackgroundColor = 'walnut';
const store = () => {
  sessionStorage.setItem(KEY, JSON.stringify(pages));
  sessionStorage.setItem(MKEY, JSON.stringify([...media]));
};
const looks = ['sunset-hills', 'lake-mountains', 'pine-forest', 'beach'] as const;
let n = 0;
const wait = () => new Promise((r) => setTimeout(r, 150));

const fakeApi: EditorApi = {
  async addPage(albumId, templateId, position = pages.length) {
    await wait();
    const p: PageDTO = { id: `new${Date.now()}`, albumId, position, layout: instantiateTemplate(templateId, () => `d${Date.now()}${n++}`) };
    pages.splice(position, 0, p);
    store();
    return p;
  },
  async savePage(id, layout) {
    await wait();
    const p = pages.find((x) => x.id === id)!;
    p.layout = layout;
    store();
    console.info('[fake api] savePage', id, layout.elements.length, 'elements');
    return p;
  },
  async deletePage(id) { await wait(); pages = pages.filter((p) => p.id !== id); store(); },
  async reorderPages(_albumId, ids) { await wait(); pages = ids.map((id) => pages.find((p) => p.id === id)!); store(); },
  async getMedia(id) {
    await wait();
    const m = media.get(id);
    if (!m) throw new Error('404');
    if (m.status === 'processing' && m.readyAt && Date.now() > m.readyAt) {
      const look = looks[n++ % looks.length];
      Object.assign(m, { status: 'ready', width: 1200, height: 900, blurDataUrl: blur[look],
        variants: { thumb: `dev-samples/${look}.webp`, display: `dev-samples/${look}.webp`, displayAvif: `dev-samples/${look}.avif`, original: `dev-samples/${look}.webp` } });
      store();
    }
    return structuredClone(m);
  },
  async deleteMedia(id) {
    await wait();
    media.delete(id);
    for (const p of pages) p.layout.elements.forEach((e) => { if (e.type === 'frame' && e.mediaId === id) e.mediaId = null; });
    if (cover === id) cover = null;
    store();
  },
  async updateAlbum(id, patch) {
    await wait(); cover = patch.coverMediaId ?? cover; bg = patch.backgroundEffect ?? bg; desk = patch.backgroundColor ?? desk;
    return { id, title: 'dev', coverMediaId: cover, backgroundEffect: bg, backgroundColor: desk, shareToken: null, musicMediaId: null };
  },
};

function useFakeUpload(albumId: string, onCreated: (mediaId: string, targetFrameId?: string) => boolean | void): Uploader {
  const [items, setItems] = useState<UploadItem[]>([]);
  const cb = useRef(onCreated);
  cb.current = onCreated;
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(() => () => timers.current.forEach(clearInterval), []);
  const patch = (id: string, p: Partial<UploadItem>) => setItems((xs) => xs.map((x) => (x.localId === id ? { ...x, ...p } : x)));
  const run = (localId: string, file: File, frameId?: string) => {
    if (/heic|heif/i.test(file.name + file.type)) {
      patch(localId, { state: 'error', error: "HEIC not supported — choose 'Most Compatible' or let the browser convert to JPEG" });
      return;
    }
    const id = `fake-${Date.now()}-${n++}`;
    media.set(id, { id, albumId, kind: file.type.startsWith('video/') ? 'video' : 'image', status: 'uploading', width: null, height: null,
      durationSec: null, blurDataUrl: null, variants: null, error: null });
    store();
    const placed = cb.current(id, frameId);
    patch(localId, { mediaId: id, ...(frameId && placed === false && { notice: 'added to tray — page changed' }) });
    let progress = 0;
    const t = setInterval(() => {
      progress = Math.min(1, progress + 0.1);
      patch(localId, { progress });
      if (progress < 1) return;
      clearInterval(t);
      Object.assign(media.get(id) ?? {}, { status: 'processing', readyAt: Date.now() + 4000 });
      store();
      patch(localId, { state: 'done' });
    }, 400);
    timers.current.push(t);
  };
  return {
    items,
    add(files, frameId) {
      for (const f of files) {
        const localId = `l${Date.now()}${n++}`;
        setItems((xs) => [...xs, { localId, name: f.name, progress: 0, mediaId: null, state: 'uploading' }]);
        run(localId, f, frameId);
      }
    },
    retry() {},
  };
}

export default function EditorPreview() {
  const bundle: AlbumBundle = { album: { id: 'dev', title: 'Đà Lạt (dev editor)', coverMediaId: cover, backgroundEffect: bg, backgroundColor: desk, shareToken: null, musicMediaId: null }, pages: structuredClone(pages), media: structuredClone([...media.values()]) };
  return <EditorView bundle={bundle} api={fakeApi} uploader={useFakeUpload} />;
}
