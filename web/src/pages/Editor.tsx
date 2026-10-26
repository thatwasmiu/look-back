import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MODES, pageLayoutSchema, type AlbumBundle, type ReadingDirection, type BackgroundColor, type BackgroundEffect, type FrameEl, type MediaDTO, type PageDTO, type PageElement, type PageLayout } from '@scrapbook/shared';
import { api as realApi, ApiError } from '../api';
import { PageRenderer } from '../render/PageRenderer';
import { EditCanvas } from '../editor/EditCanvas';
import { Toolbar, stepZoom } from '../editor/Toolbar';
import { LangSwitch, useT } from '../i18n';
import { BackgroundEffectView } from '../render/effects';
import { initHistory, push, redo, undo } from '../editor/history';
import { addElement, assignMedia, clearMedia, duplicate, removeElement, updateElement } from '../editor/layoutOps';
import { useAutosave } from '../editor/useAutosave';
import { MediaTray, thumbOf } from '../editor/MediaTray';
import { mediaUrl } from '../mediaUrl';
import { ACCEPT, pollUntilSettled, useUpload } from '../editor/useUpload';
import { FrameCamera, frameWindowShape, type CameraTarget, type WindowShape, inlineVideoBlocked } from '../editor/FrameCamera';
import { dropLocalPreview, LocalPreview } from '../localPreview';

export type EditorApi = Pick<typeof realApi,
  'addPage' | 'savePage' | 'deletePage' | 'reorderPages' | 'getMedia' | 'deleteMedia' | 'updateAlbum'>;

const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export default function Editor() {
  const { id = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [loadError, setLoadError] = useState(false);
  const tr = useT();
  const load = useCallback(() => {
    setLoadError(false);
    realApi.getAlbum(id).then(setBundle, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) setLoadError(true);
    });
  }, [id]);
  useEffect(load, [load]);
  if (bundle) return <EditorView bundle={bundle} api={realApi} />;
  return (
    <main className="editor">
      <header className="editor-bar"><Link to="/">← {tr('Albums')}</Link></header>
      {loadError && <p role="alert" className="empty">{tr("Couldn't load the album")} <button onClick={load}>{tr('Retry')}</button></p>}
    </main>
  );
}

const EMPTY: PageLayout = { background: 'paper-cream', elements: [] };
const noMedia = new Map();
const PAGE_DRAG = 'application/x-scrapbook-page';
const POLLS = 3; // media polled at once
const UPLOADING_POLL_MS = 15_000;
const placeholder = (id: string, albumId: string): MediaDTO => ({
  id, albumId, kind: 'image', status: 'uploading', width: null, height: null, durationSec: null, blurDataUrl: null, variants: null, error: null,
});

// The page's empty frames other than `id`, in reading order: rows top to bottom (frames whose tops are within 5 % of
// the page count as one row), each row left to right, or right to left for a right-to-left manga.
export function otherEmptyFrames(layout: PageLayout, id: string, dir: ReadingDirection): FrameEl[] {
  const row = (f: FrameEl) => Math.round(f.y / 0.05);
  return layout.elements
    .filter((e): e is FrameEl => e.type === 'frame' && !e.mediaId && e.id !== id)
    .sort((a, b) => row(a) - row(b) || (dir === 'rtl' ? b.x - a.x : a.x - b.x));
}

const MUSIC = '#music'; // upload target: the album's background music instead of a frame

// `uploader` is swappable so /dev/editor can fake uploads without a server.
// guest: opened from an edit link — the page structure is the owner's: no adding/deleting/moving pages, no frame or
// panel tools (a frame only takes a photo), no album settings. Everything else on the page is free; the server
// enforces the same.
export function EditorView({ bundle, api, uploader = useUpload, guest = false }: { bundle: AlbumBundle; api: EditorApi; uploader?: typeof useUpload; guest?: boolean }) {
  const albumId = bundle.album.id;
  const tr = useT();
  const [media, setMedia] = useState(() => new Map(bundle.media.map((m) => [m.id, m])));
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [coverId, setCoverId] = useState(bundle.album.coverMediaId);
  const [cropId, setCropId] = useState<string | null>(null);
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageDTO[]>(bundle.pages);
  // ?page=N (1-based): Edit in the viewer opens the page being viewed.
  const [params] = useSearchParams();
  const [cur, setCur] = useState(() => Math.min(Math.max(0, (Number(params.get('page')) || 1) - 1), Math.max(0, bundle.pages.length - 1)));
  const page = pages[cur] as PageDTO | undefined;
  const [hist, setHist] = useState(() => initHistory(page?.layout ?? EMPTY));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);
  // The template list closes on a press outside it (the "+" button toggles it itself) or on Escape.
  useEffect(() => {
    if (!picking) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!pickRef.current?.contains(t) && !t.closest?.('.thumb-add')) setPicking(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [picking]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  // The page strip folds away like the Photos tray; on phones it starts folded (same breakpoint as the CSS).
  const [pagesOpen, setPagesOpen] = useState(() => !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse), (max-width: 699px)').matches));
  const [zoom, setZoom] = useState(1);
  // Snap guides: on by default, remembered on this device.
  const [snap, setSnapState] = useState(() => { try { return localStorage.getItem('lb.snap') !== 'off'; } catch { return true; } });
  const setSnap = (on: boolean) => { setSnapState(on); try { localStorage.setItem('lb.snap', on ? 'on' : 'off'); } catch { /* private mode */ } };
  const [title, setTitle] = useState(bundle.album.title);
  const [renaming, setRenaming] = useState(false);
  const renameCancelled = useRef(false);
  // Inline rename: Enter / blur saves (optimistic, rolled back on failure), Escape cancels, empty is ignored.
  const rename = (next: string) => {
    setRenaming(false);
    if (renameCancelled.current) { renameCancelled.current = false; return; }
    const t = next.trim().slice(0, 200);
    if (!t || t === title) return;
    const prev = title;
    setTitle(t);
    api.updateAlbum(albumId, { title: t }).catch(() => { setTitle(prev); setOpError(tr("Couldn't rename the album.")); });
  };
  const [bgEffect, setBgEffectState] = useState(bundle.album.backgroundEffect);
  const [bgColor, setBgColorState] = useState(bundle.album.backgroundColor);
  const setBgColor = (c: BackgroundColor) => {
    const prev = bgColor;
    setBgColorState(c);
    api.updateAlbum(albumId, { backgroundColor: c }).catch(() => { setBgColorState(prev); setOpError(tr("Couldn't save the desk color.")); });
  };
  const mode = bundle.album.mode ?? 'scrapbook';
  const info = MODES[mode];
  const pageTemplates = info.pageTemplates; // e.g. a photobooth album offers only the Booth pages
  const [readingDirection, setReadingDirectionState] = useState<ReadingDirection>(bundle.album.readingDirection ?? 'ltr');
  const setReadingDirection = (d: ReadingDirection) => {
    const prev = readingDirection;
    setReadingDirectionState(d);
    api.updateAlbum(albumId, { readingDirection: d }).catch(() => { setReadingDirectionState(prev); setOpError(tr("Couldn't save the reading direction.")); });
  };
  // Album-level setting: optimistic, rolled back if the save fails.
  const setBgEffect = (e: BackgroundEffect) => {
    const prev = bgEffect;
    setBgEffectState(e);
    api.updateAlbum(albumId, { backgroundEffect: e }).catch(() => { setBgEffectState(prev); setOpError(tr("Couldn't save the album background.")); });
  };
  // Background music: uploaded from the Background picker; the album points at it as soon as tus created the row.
  const [musicId, setMusicId] = useState(bundle.album.musicMediaId);
  const removeMusic = () => {
    if (!musicId) return;
    const prev = musicId;
    setMusicId(null);
    api.deleteMedia(prev).catch(() => { setMusicId(prev); setOpError(tr("Couldn't remove the music.")); }); // the server clears the album's pointer
  };
  const stageRef = useRef<HTMLDivElement>(null);
  // Ctrl + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms the page, not the browser.
  useEffect(() => {
    const n = stageRef.current;
    if (!n) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => stepZoom(z, e.deltaY < 0 ? 1 : -1));
    };
    n.addEventListener('wheel', wheel, { passive: false });
    return () => n.removeEventListener('wheel', wheel);
  }, []); // phone: tuck photos/pages/tools away for a bigger page
  const [opError, setOpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // page op in progress: editing frozen so nothing lands mid-switch/delete
  const navigate = useNavigate();
  const layout = hist.present;
  // Async page ops read the state as it is after their awaits, not as it was when they started.
  const latest = useRef({ pages, cur, layout, busy });
  latest.current = { pages, cur, layout, busy };
  const nav = useRef({ switchTo: (_i: number): Promise<void> => Promise.resolve() }); // filled below; read by the key handler

  // Each page's version as last loaded/saved here. Someone else (the owner and an edit-link guest, two devices)
  // saved the page since → the server refuses; their version replaces ours here, with a note, instead of overwriting.
  const versions = useRef(new Map(bundle.pages.flatMap((p) => (p.updatedAt ? [[p.id, p.updatedAt] as const] : []))));
  const takeTheirs = useRef((_p: PageDTO) => {});
  // Never send a layout the server would reject: a validation failure shows as the "Save failed" status.
  const save = useCallback(async (id: string, l: PageLayout, opts?: { keepalive?: boolean }) => {
    const r = pageLayoutSchema.safeParse(l);
    if (!r.success) { console.error('invalid layout', r.error.issues); throw r.error; }
    const base = versions.current.get(id);
    try {
      const saved = await api.savePage(id, r.data, base ? { ...opts, base } : opts);
      if (saved?.updatedAt) versions.current.set(id, saved.updatedAt);
      return saved;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409 && e.data?.page)) throw e;
      takeTheirs.current(e.data.page as PageDTO);
    }
  }, [api]);
  const { status, flush, reset } = useAutosave(page?.id ?? '', layout, save);
  takeTheirs.current = (p) => {
    if (p.updatedAt) versions.current.set(p.id, p.updatedAt);
    setPages((ps) => ps.map((x) => (x.id === p.id ? { ...x, layout: p.layout } : x)));
    if (latest.current.pages[latest.current.cur]?.id === p.id) {
      reset(p.layout);
      setHist(initHistory(p.layout));
      setSelectedId(null);
    }
    setOpError(tr('Someone else just changed this page — their version is loaded.'));
  };

  // `coalesce`: consecutive commits with the same key within 500 ms (arrow-key repeats, dragging the colour
  // picker) replace the last history entry instead of pushing one each.
  const lastCommit = useRef({ key: '', t: 0 });
  const commit = useCallback((next: PageLayout | ((l: PageLayout) => PageLayout), select?: string | null, coalesce?: string) => {
    if (latest.current.busy) return;
    const now = Date.now();
    const merge = !!coalesce && lastCommit.current.key === coalesce && now - lastCommit.current.t < 500;
    lastCommit.current = { key: coalesce ?? '', t: now };
    setHist((h) => {
      const l = typeof next === 'function' ? next(h.present) : next;
      if (l === h.present) return h;
      return merge ? { ...h, present: l } : push(h, l);
    });
    if (select !== undefined) setSelectedId(select);
  }, []);

  // Media status polling (processing → ready/failed), at most POLLS at once; stops on unmount or when the media
  // is deleted. Transient fetch errors keep polling. `watched` is never cleared: each id is polled once.
  const polls = useRef({ alive: true, running: 0, queue: [] as string[], watched: new Set<string>() });
  useEffect(() => {
    polls.current.alive = true;
    return () => { polls.current.alive = false; };
  }, []);
  const get = useCallback(async (id: string) => {
    const known = () => polls.current.alive && mediaRef.current.has(id);
    if (!known()) throw new Error('stopped');
    try {
      const m = await api.getMedia(id);
      setMedia((cur) => (cur.has(id) ? new Map(cur).set(id, m) : cur));
      return m;
    } catch (e) {
      if (!known() || (e instanceof ApiError && e.status === 404)) throw e;
      return mediaRef.current.get(id)!;
    }
  }, [api]);
  const watch = useCallback((id: string) => {
    const p = polls.current;
    if (p.watched.has(id)) return;
    p.watched.add(id);
    p.queue.push(id);
    const pump = () => {
      while (p.running < POLLS && p.queue.length) {
        const next = p.queue.shift()!;
        p.running++;
        pollUntilSettled(next, get).catch(() => {}).finally(() => dropLocalPreview(next)).finally(() => { p.running--; pump(); });
      }
    };
    pump();
  }, [get]);
  useEffect(() => { bundle.media.forEach((m) => m.status === 'processing' && watch(m.id)); }, [bundle.media, watch]);
  // 'uploading' rows from the bundle: an upload running in the background, or one abandoned before a reload (the
  // server marks those failed). Polled slowly and outside the POLLS slots, since they can take hours to move on.
  useEffect(() => {
    let alive = true;
    for (const m of bundle.media) {
      if (m.status !== 'uploading') continue;
      void (async () => {
        while (alive && mediaRef.current.get(m.id)?.status === 'uploading') {
          await new Promise((r) => setTimeout(r, UPLOADING_POLL_MS));
          if (!alive) return;
          const next = await get(m.id).catch(() => null);
          if (!next) return; // deleted / unmounted
          if (next.status === 'processing') return watch(m.id);
        }
      })();
    }
    return () => { alive = false; };
  }, [bundle.media, get, watch]);

  // tus created the upload: the media row exists server-side ('uploading'), so it may go into a frame (and be
  // autosaved) right away. Returns false when the target frame isn't on the current page (or editing is frozen).
  const upload = uploader(albumId, (mediaId, frameId) => {
    setMedia((cur) => (cur.has(mediaId) ? cur : new Map(cur).set(mediaId, placeholder(mediaId, albumId))));
    if (frameId === MUSIC) {
      setMusicId(mediaId);
      api.updateAlbum(albumId, { musicMediaId: mediaId }).catch(() => setOpError(tr("Couldn't save the music.")));
      return true;
    }
    if (!frameId) return true;
    const { layout: l, busy: b } = latest.current;
    if (b || !l.elements.some((e) => e.id === frameId && e.type === 'frame')) return false;
    commit((x) => assignMedia(x, frameId, mediaId));
    return true;
  });
  // Upload finished: the worker takes over (processing → ready/failed).
  // A 4xx after the early frame assign: the upload can't finish, so show it failed (the server marks the row
  // failed once the tus upload expires).
  useEffect(() => {
    for (const u of upload.items) {
      const id = u.mediaId;
      const failed = u.state === 'error' && u.retryable === false;
      if (!id || !(u.state === 'done' || failed)) continue;
      setMedia((cur) => {
        const m = cur.get(id);
        if (m?.status !== 'uploading') return cur;
        return new Map(cur).set(id, failed ? { ...m, status: 'failed', error: u.error ?? 'upload failed' } : { ...m, status: 'processing' });
      });
      if (!failed) watch(id);
    }
  }, [upload.items, watch]);
  const framePick = useRef<{ input: HTMLInputElement | null; frameId: string }>({ input: null, frameId: '' });
  // "+ add" on an empty frame: pick from what's already uploaded, or upload new (first option).
  // With nothing uploaded yet it goes straight to the file dialog — except on phones, where the menu also offers the
  // cameras.
  const [frameMenu, setFrameMenu] = useState<string | null>(null);
  // "Chụp theo khung" open for this frame; more: the page's other empty frames, in reading order (for Photobooth).
  // set: opened by "Shoot a new set" (photobooth: front camera, every empty frame, then "another set?").
  const [cameraFrame, setCameraFrame] = useState<{ frame: FrameEl; shape: WindowShape | null; more: CameraTarget[]; set?: boolean } | null>(null);
  const frameShape = (id: string) => frameWindowShape(document.querySelector<HTMLElement>(`.edit-page [data-frame-id="${id}"] .frame-window`));
  // camera: the phone-only "Take photo/video" (same input with capture, which opens the camera directly).
  const cameraPick = useRef<HTMLInputElement | null>(null);
  const uploadToFrame = (frameId: string, camera = false) => {
    framePick.current.frameId = frameId;
    (camera ? cameraPick.current : framePick.current.input)?.click();
  };
  const addToFrame = (frameId: string) => {
    if (trayMedia.some((m) => m.status !== 'failed') || phone) setFrameMenu(frameId);
    else uploadToFrame(frameId);
  };
  const putInFrame = (mediaId: string, frameId: string) => commit((l) => assignMedia(l, frameId, mediaId), frameId);
  // The server empties frames on delete; mirror that everywhere here (pages, undo history) so no later save
  // sends a mediaId the server no longer knows.
  const deleteMedia = (mediaId: string) => run("Couldn't delete the photo/video.", async () => {
    if (!(await saved())) return;
    await api.deleteMedia(mediaId);
    const strip = (l: PageLayout) => clearMedia(l, mediaId);
    setPages((ps) => ps.map((p) => ({ ...p, layout: strip(p.layout) })));
    setHist((h) => ({ past: h.past.map(strip), present: strip(h.present), future: h.future.map(strip) }));
    setMedia((cur) => { const n = new Map(cur); n.delete(mediaId); return n; });
    setCoverId((c) => (c === mediaId ? null : c));
  });
  const setCover = (mediaId: string) => api.updateAlbum(albumId, { coverMediaId: mediaId })
    .then(() => setCoverId(mediaId), () => setOpError(tr("Couldn't set the cover photo.")));

  // Pages list keeps the current page's latest layout too (thumbnails, and switching back).
  const withCurrent = ({ pages: ps, cur: c, layout: l } = latest.current) => ps.map((p, i) => (i === c ? { ...p, layout: l } : p));
  // 1-based position in the viewer, which skips hidden pages (a hidden page maps to the visible one before it).
  const viewerPage = () => Math.max(1, withCurrent().slice(0, latest.current.cur + 1).filter((p) => !p.layout.hidden).length);
  const show = (ps: PageDTO[], i: number) => {
    setPages(ps);
    setCur(i);
    setHist(initHistory(ps[i]?.layout ?? EMPTY));
    setSelectedId(null);
    setConfirmDelete(false);
  };
  // Leaving the current page (switch, delete, route leave) needs its edits saved; a failed save blocks it.
  const saved = async () => {
    if (await flush()) return true;
    setOpError(tr("This page isn't saved yet. Tap Retry save."));
    return false;
  };
  const run = async (what: string, f: () => Promise<void>) => {
    setOpError(null);
    setBusy(true);
    latest.current.busy = true;
    try { await f(); } catch { setOpError(tr(what)); } finally { setBusy(false); }
  };

  const switchTo = (i: number) => run("Couldn't switch pages.", async () => {
    if (await saved()) show(withCurrent(), i);
  });
  // added: told the new page's id once it is shown (a photobooth set opens the camera on it).
  const addPage = (templateId: string, added?: (pageId: string) => void) => run("Couldn't add the page.", async () => {
    setPicking(false);
    if (!(await saved())) return;
    // A guest's page always goes at the end (the server puts it there).
    const at = guest ? latest.current.pages.length : latest.current.pages.length ? latest.current.cur + 1 : 0;
    const p = await api.addPage(albumId, templateId, at);
    const ps = withCurrent();
    ps.splice(at, 0, p);
    show(ps, at);
    added?.(p.id);
  });
  const deletePage = () => run("Couldn't delete the page.", async () => {
    const id = page?.id;
    if (!id || !(await saved())) return;
    await api.deletePage(id);
    const ps = latest.current.pages.filter((p) => p.id !== id);
    show(ps, Math.max(0, Math.min(latest.current.cur, ps.length - 1)));
  });
  const leave = (e: MouseEvent) => {
    e.preventDefault();
    void run("Couldn't leave the editor.", async () => { if (await saved()) navigate(`/albums/${albumId}?page=${viewerPage()}`); });
  };
  const move = (from: number, to: number) => run("Couldn't reorder the pages.", async () => {
    if (from === to || to < 0 || to >= pages.length) return;
    const ps = withCurrent();
    const [p] = ps.splice(from, 1);
    ps.splice(to, 0, p);
    const curId = page?.id;
    setPages(ps);
    setCur(ps.findIndex((x) => x.id === curId));
    await api.reorderPages(albumId, ps.map((x) => x.id));
  });

  // "Shoot a new set" (modes with shootFirst, i.e. photobooth): pick a layout (next sets reuse it), a new page with it,
  // then the camera fills all its frames in one go; afterwards the date is stamped and it offers another set.
  const [shootPick, setShootPick] = useState(() => info.shootFirst && (!guest || info.guestSets) && params.get('shoot') === '1');
  const [setLayout, setSetLayout] = useState<string | null>(null);
  const [shootOn, setShootOn] = useState<string | null>(null); // page id: open the set camera once it is shown
  const [askNext, setAskNext] = useState(false);
  const canShootSet = info.shootFirst && (!guest || info.guestSets) && !inlineVideoBlocked();
  // Kiosk (a tablet or laptop at a party): a full screen "tap to shoot" with the layouts to choose from; each set
  // becomes a page, a thank-you, then back to the start screen. Exit with ✕.
  const [kiosk, setKiosk] = useState(false);
  const [thanks, setThanks] = useState(false);
  const startKiosk = () => {
    setKiosk(true);
    setSetLayout((l) => l ?? pageTemplates[0]?.id ?? null);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const stopKiosk = () => {
    setKiosk(false);
    setThanks(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  };
  const shootSet = (templateId: string) => {
    setSetLayout(templateId);
    setShootPick(false);
    setAskNext(false);
    void addPage(templateId, setShootOn);
  };
  useEffect(() => {
    if (!shootOn || shootOn !== page?.id) return;
    const t = setTimeout(() => { // after the new page is laid out, so the frames' shapes can be measured
      setShootOn(null);
      const [first, ...rest] = otherEmptyFrames(latest.current.layout, '', readingDirection);
      if (first) setCameraFrame({ frame: first, shape: frameShape(first.id), more: rest.map((e) => ({ frame: e, shape: frameShape(e.id) })), set: true });
    }, 80);
    return () => clearTimeout(t);
  }, [shootOn, page?.id]);
  const setDone = () => {
    setCameraFrame(null);
    const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    commit((l) => ({ ...l, elements: l.elements.map((e) => (e.type === 'text' && e.text === 'dd/mm/yyyy' ? { ...e, text: today } : e)) }));
    if (!kiosk) { setAskNext(true); return; }
    setThanks(true);
    setTimeout(() => setThanks(false), 4000);
  };

  nav.current.switchTo = switchTo;
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  useEffect(() => { if (cropId !== selectedId) setCropId(null); }, [cropId, selectedId]);
  useEffect(() => { if (shapeId !== selectedId) setShapeId(null); }, [shapeId, selectedId]);
  const trayMedia = useMemo(() => [...media.values()].filter((m) => m.kind !== 'audio' && m.id !== musicId).reverse(), [media, musicId]); // newest first; music lives in Background
  // Ctrl+C keeps a copy of the selected item (in memory, so it also pastes onto another page).
  const clip = useRef<PageElement | null>(null);
  useEffect(() => {
    const ignore = (t: EventTarget | null) => latest.current.busy
      || (t instanceof HTMLElement && (!!t.closest('[aria-modal]') || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)));
    // Paste: an image/video on the clipboard (screenshot, "Copy image") uploads — into the selected empty frame
    // if there is one, else to Photos. Otherwise the last copied item is pasted as a new copy.
    const onPaste = (e: ClipboardEvent) => {
      if (ignore(e.target)) return;
      const files = [...e.clipboardData?.files ?? []].filter((f) => /^(image|video)\//.test(f.type));
      if (files.length) {
        e.preventDefault();
        const sel = latest.current.layout.elements.find((x) => x.id === selectedId);
        upload.add(files, sel?.type === 'frame' && !sel.mediaId ? sel.id : undefined);
        return;
      }
      if (!clip.current || (guest && clip.current.type === 'frame')) return;
      e.preventDefault();
      const copy = duplicate(clip.current);
      clip.current = copy; // the next paste lands a step further
      commit((l) => addElement(l, copy), copy.id);
    };
    const onKey = (e: KeyboardEvent) => {
      if (ignore(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'c' && selectedId) {
        clip.current = latest.current.layout.elements.find((x) => x.id === selectedId) ?? null;
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); setHist(e.shiftKey ? redo : undo); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); setHist(redo); return; }
      if (!selectedId) {
        // Nothing selected: ← / → flip pages (→ on the last page offers a new one, like the round button).
        // With an item selected the arrows nudge it instead (below).
        const { cur: c, pages: ps } = latest.current;
        if (e.key === 'ArrowRight') { e.preventDefault(); if (c < ps.length - 1) void nav.current.switchTo(c + 1); else if (!guest) setPicking(true); }
        if (e.key === 'ArrowLeft' && c > 0) { e.preventDefault(); void nav.current.switchTo(c - 1); }
        return;
      }
      // A guest can't delete or move a frame.
      if (guest && latest.current.layout.elements.find((x) => x.id === selectedId)?.type === 'frame') return;
      // commit(fn) derives from h.present, not this render's layout: key repeats can arrive before a re-render.
      // Focus often stays on the last-clicked toolbar button; buttons have no use for these keys.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commit((l) => removeElement(l, selectedId), null);
        return;
      }
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = nudge[e.key];
      if (!d) return;
      e.preventDefault();
      commit((l) => {
        const el = l.elements.find((x) => x.id === selectedId);
        return el && !el.pinned ? updateElement(l, el.id, { x: el.x + d[0] * 0.005, y: el.y + d[1] * 0.005 }) : l;
      }, undefined, `nudge:${selectedId}`);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste); };
  }, [selectedId, commit, upload, guest]);

  const shownPages = withCurrent();
  const toggleHidden = () => commit((l) => ({ ...l, hidden: l.hidden ? undefined : true }));
  return (
    <main className={`editor desk-${bgColor}${busy ? ' busy' : ''}${panelsHidden ? ' panels-hidden' : ''}`} aria-busy={busy}>
      <header className="editor-bar">
        {guest
          ? <span className="guest-badge">✎ {tr('Edit link · until')} {bundle.album.editExpiresAt ? new Date(bundle.album.editExpiresAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
          : <Link to={`/albums/${albumId}?page=${viewerPage()}`} onClick={leave}>← {tr('Done')}</Link>}
        <h1>
          {guest ? <span className="title-text">{title}</span> : renaming ? (
            <input className="title-input" aria-label={tr('Album name')} defaultValue={title} maxLength={200} autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { renameCancelled.current = true; e.currentTarget.blur(); }
              }}
              onBlur={(e) => rename(e.currentTarget.value)} />
          ) : (
            <button type="button" className="title-btn" aria-label={tr('Rename album: {title}', { title })} title={tr('{title} — click to rename', { title })} onClick={() => setRenaming(true)}>
              <span className="title-text">{title}</span><span className="title-pen" aria-hidden>✎</span>
            </button>
          )}
        </h1>
        <LangSwitch />
        <button type="button" className="panels-toggle" aria-pressed={panelsHidden} onClick={() => setPanelsHidden((v) => !v)}>
          {tr(panelsHidden ? 'Show tools' : 'Hide tools')}
        </button>
        {/* New tab: the editor keeps its state (and autosave) while the guide is open. An installed app (PWA) has
            no tabs or back button there, so it saves and opens the guide in place; the guide's ← Back returns here. */}
        {guest ? null : standalone
          ? <Link className="guide-help" to="/guide" aria-label={tr('User guide')} title={tr('User guide')} onClick={(e) => {
            e.preventDefault();
            void run("Couldn't open the guide.", async () => { if (await saved()) navigate('/guide', { state: { back: true } }); });
          }}>?</Link>
          : <a className="guide-help" href="/guide" target="_blank" rel="noopener" aria-label={tr('User guide')} title={tr('User guide')}>?</a>}
      </header>
      {page && (
        <Toolbar guest={guest} layout={layout} selected={selected} commit={commit}
          undo={() => setHist(undo)} redo={() => setHist(redo)} canUndo={hist.past.length > 0} canRedo={hist.future.length > 0}
          status={status} save={() => void flush().then((ok) => ok && setOpError(null))}
          crop={() => setCropId(selectedId)} editShape={() => setShapeId(selectedId)} zoom={zoom} setZoom={setZoom} snap={snap} setSnap={setSnap} frameMedia={selected?.type === 'frame' && selected.mediaId ? media.get(selected.mediaId) ?? null : null} bgEffect={bgEffect} setBgEffect={setBgEffect} bgColor={bgColor} setBgColor={setBgColor}
          mode={mode} readingDirection={readingDirection} setReadingDirection={setReadingDirection}
          music={musicId ? media.get(musicId) ?? null : null} onMusicFile={(f) => upload.add([f], MUSIC)} onMusicRemove={removeMusic} />
      )}
      <div className="edit-main">
        <BackgroundEffectView kind={bgEffect} />
        {/* Tapping the desk around the page clears the selection, same as tapping empty page. */}
        <div className="stage-wrap" onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === stageRef.current) setSelectedId(null); }}>
          <div className="edit-stage" ref={stageRef}>
            {page ? <EditCanvas lockFrames={guest} layout={layout} media={media} selectedId={selectedId} onSelect={setSelectedId} onCommit={commit}
              onFrameAddMedia={addToFrame} cropId={cropId} onCrop={setCropId} shapeId={shapeId} onShape={setShapeId} zoom={zoom} snap={snap} />
              : <p className="empty">{tr('No pages yet — add one below.')}</p>}
          </div>
          {page && cur > 0 && (
            <button type="button" className="page-next page-prev" aria-label={tr('Previous page')} title={tr('Previous page')} onClick={() => void switchTo(cur - 1)}>←</button>
          )}
          {/* Next page; on the last page it offers a new one (same template picker as the strip's "+"). */}
          {page && (cur < pages.length - 1
            ? <button type="button" className="page-next" aria-label={tr('Next page')} title={tr('Next page')} onClick={() => void switchTo(cur + 1)}>→</button>
            : !guest && <button type="button" className="page-next" aria-label={tr('New page')} title={tr('New page')} onClick={() => setPicking(true)}>+</button>)}
          {canShootSet && !cameraFrame && (
            <span className="shoot-set-bar">
              <button type="button" className="shoot-set-btn" onClick={() => (setLayout ? shootSet(setLayout) : setShootPick(true))}>📸 {tr('Shoot a new set')}</button>
              <button type="button" className="secondary kiosk-btn" title={tr('Full screen for a party: guests tap to shoot their own set')} onClick={startKiosk}>🖥 {tr('Kiosk')}</button>
            </span>
          )}
        </div>
        <MediaTray media={trayMedia} items={upload.items} coverMediaId={coverId}
          onUpload={(files) => upload.add(files)} onRetry={upload.retry}
          onPick={(id) => selected?.type === 'frame' && putInFrame(id, selected.id)} onDrop={putInFrame}
          onDelete={guest ? undefined : deleteMedia} onSetCover={guest ? undefined : setCover} />
        {/* Portal: inside .edit-main's stacking context the tools would paint over the backdrop. */}
        {cameraFrame && createPortal(
          <FrameCamera frame={cameraFrame.frame} windowShape={cameraFrame.shape} more={cameraFrame.more} set={cameraFrame.set}
            onClose={() => setCameraFrame(null)} onSetDone={cameraFrame.set ? setDone : undefined}
            onCapture={(file, frameId) => { upload.add([file], frameId ?? cameraFrame.frame.id); if (!frameId) setCameraFrame(null); }} />,
          document.body,
        )}
        {frameMenu && createPortal(
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setFrameMenu(null); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setFrameMenu(null); }}>
            <div className="modal frame-menu" role="dialog" aria-modal="true" aria-label={tr('Add photo or video')}>
              <button type="button" className="modal-close" aria-label={tr('Close')} onClick={() => setFrameMenu(null)} autoFocus>×</button>
              <h2>{tr('Add to frame')}</h2>
              {inlineVideoBlocked() && <p className="manage-hint">{tr('Inside Zalo the frame camera can\'t work — use “Take photo/video”, or open in Safari (⋯ → Open in browser).')}</p>}
              <div className="frame-menu-actions">
                {inlineVideoBlocked() ? null : <button type="button" className="frame-menu-upload frame-menu-camera" onClick={() => {
                  const f = layout.elements.find((e) => e.id === frameMenu);
                  if (f?.type === 'frame') {
                    const more = otherEmptyFrames(layout, f.id, readingDirection).map((e) => ({ frame: e, shape: frameShape(e.id) }));
                    setCameraFrame({ frame: f, shape: frameShape(f.id), more });
                  }
                  setFrameMenu(null);
                }}>🎯<span>{tr('Shoot in the frame')}</span></button>}
                <button type="button" className="frame-menu-upload frame-menu-camera" onClick={() => { uploadToFrame(frameMenu, true); setFrameMenu(null); }}>📷<span>{tr('Take photo/video')}</span></button>
                <button type="button" className="frame-menu-upload" onClick={() => { uploadToFrame(frameMenu); setFrameMenu(null); }}>⬆<span>{tr('Upload')}</span></button>
              </div>
              <div className="frame-menu-grid">
                {trayMedia.filter((m) => m.status !== 'failed').map((m) => {
                  const src = thumbOf(m);
                  return (
                    <button type="button" key={m.id} aria-label={tr(m.kind === 'video' ? 'Use video {id}' : 'Use image {id}', { id: m.id.slice(0, 8) })}
                      onClick={() => { putInFrame(m.id, frameMenu); setFrameMenu(null); }}>
                      {src ? <img src={mediaUrl(src)} alt="" /> : <><LocalPreview id={m.id} /><span className="chip">{m.status}…</span></>}
                      {m.kind === 'video' && <span className="play-badge" aria-hidden>▶</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
        {(['Upload into frame', 'Take photo or video'] as const).map((label, i) => (
          <input key={label} type="file" accept={ACCEPT} hidden aria-label={tr(label)} capture={i ? 'environment' : undefined}
            ref={(n) => { if (i) cameraPick.current = n; else framePick.current.input = n; }}
            onChange={(e) => { upload.add([...e.target.files ?? []], framePick.current.frameId); e.target.value = ''; }} />
        ))}
      </div>
      {opError && <p role="alert" className="error op-error">{opError}</p>}
      {layout.hidden && <p className="hidden-note" role="status">{tr('This page is hidden — not shown when viewing, sharing or printing.')}</p>}
      <nav className={`page-strip${pagesOpen ? ' open' : ''}`} aria-label={tr('Pages')}>
        <button type="button" className="strip-tab" aria-expanded={pagesOpen} onClick={() => setPagesOpen((v) => !v)}>
          {tr('Pages')} ({pages.length}) <span aria-hidden>{pagesOpen ? '▾' : '▸'}</span>
        </button>
        {pagesOpen && (
        <div className="strip-list">
          {shownPages.map((p, i) => (
            <div key={p.id} className={`thumb${i === cur ? ' current' : ''}${p.layout.hidden ? ' is-hidden' : ''}`} draggable={!guest}
              onDragStart={(e) => e.dataTransfer.setData(PAGE_DRAG, String(i))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const from = e.dataTransfer.getData(PAGE_DRAG); // '' for drops that aren't a page thumbnail
                if (from) { e.preventDefault(); move(Number(from), i); }
              }}>
              <button type="button" className="thumb-page" aria-label={tr('Page {n}', { n: i + 1 })} aria-current={i === cur}
                onClick={() => i !== cur && void switchTo(i)}>
                <PageRenderer layout={p.layout} media={media} mode="edit" active={false} />
              </button>
              {i === cur && !guest && (
                <div className="thumb-actions">
                  <button type="button" aria-label={tr('Move page left')} disabled={i === 0} onClick={() => move(i, i - 1)}>◀</button>
                  <button type="button" aria-label={tr(p.layout.hidden ? 'Show page' : 'Hide page')} aria-pressed={!!p.layout.hidden}
                    title={tr(p.layout.hidden ? 'Show this page again' : 'Hide the page when viewing / sharing')} onClick={toggleHidden}>{tr(p.layout.hidden ? 'Show' : 'Hide')}</button>
                  <button type="button" aria-label={tr('Delete page')} onClick={() => setConfirmDelete(true)}>✕</button>
                  <button type="button" aria-label={tr('Move page right')} disabled={i === pages.length - 1} onClick={() => move(i, i + 1)}>▶</button>
                </div>
              )}
            </div>
          ))}
          {!guest && <button type="button" className="thumb-add" aria-label={tr('Add page')} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>+</button>}
        </div>
        )}
      </nav>
      {confirmDelete && (
        <div className="inline-confirm" role="alertdialog" aria-label={tr('Delete page')}>
          {tr('Delete page {n}? Its photos stay in the album.', { n: cur + 1 })}
          <button type="button" onClick={deletePage}>{tr('Delete')}</button>
          <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>{tr('Cancel')}</button>
        </div>
      )}
      {kiosk && createPortal(
        <div className="kiosk" role="dialog" aria-label={tr('Kiosk')}>
          <button type="button" className="kiosk-exit" aria-label={tr('Exit kiosk')} onClick={stopKiosk}>✕</button>
          {thanks ? <p className="kiosk-thanks">✨ {tr('Thank you!')} ✨</p> : <>
            <h2 className="kiosk-title">{title}</h2>
            <button type="button" className="kiosk-start" disabled={busy} onClick={() => setLayout && shootSet(setLayout)}>📸 {tr('Tap to shoot')}</button>
            <div className="kiosk-layouts" role="radiogroup" aria-label={tr('Layout for the set')}>
              {pageTemplates.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={setLayout === t.id} aria-label={tr(t.name)} onClick={() => setSetLayout(t.id)}>
                  <PageRenderer layout={t.layout} media={noMedia} mode="view" active={false} />
                </button>
              ))}
            </div>
          </>}
        </div>,
        document.body,
      )}
      {askNext && (
        <div className="inline-confirm shoot-next" role="dialog" aria-label={tr('Set done')}>
          <span>✨ {tr('Set done! Shoot another?')}</span>
          <button type="button" onClick={() => setLayout && shootSet(setLayout)}>📸 {tr('Shoot another set')}</button>
          <button type="button" className="secondary" onClick={() => { setAskNext(false); setShootPick(true); }}>{tr('Other layout')}</button>
          <button type="button" className="secondary" onClick={() => setAskNext(false)}>{tr('Done')}</button>
        </div>
      )}
      {(picking || shootPick) && (
        <div className="template-picker" role="dialog" aria-label={tr('Pick a template')} ref={pickRef}>
          <div className="template-head">
            <span>{tr(shootPick ? 'Layout for the set' : 'New page')}</span>
            <button type="button" className="template-close" aria-label={tr('Close')} title={tr('Close')} onClick={() => { setPicking(false); setShootPick(false); }}>×</button>
          </div>
          {pageTemplates.map((t) => (
            <button key={t.id} type="button" className="template" onClick={() => (shootPick ? shootSet(t.id) : addPage(t.id))}>
              <PageRenderer layout={t.layout} media={noMedia} mode="edit" active={false} />
              <span>{tr(t.name)}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
