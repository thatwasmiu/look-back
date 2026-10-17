import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { pageLayoutSchema, templates, type AlbumBundle, type MediaDTO, type PageDTO, type PageLayout } from '@scrapbook/shared';
import { api as realApi, ApiError } from '../api';
import { PageRenderer } from '../render/PageRenderer';
import { EditCanvas } from '../editor/EditCanvas';
import { Toolbar } from '../editor/Toolbar';
import { initHistory, push, redo, undo } from '../editor/history';
import { assignMedia, clearMedia, removeElement, updateElement } from '../editor/layoutOps';
import { useAutosave } from '../editor/useAutosave';
import { MediaTray } from '../editor/MediaTray';
import { ACCEPT, pollUntilSettled, useUpload } from '../editor/useUpload';

export type EditorApi = Pick<typeof realApi,
  'addPage' | 'savePage' | 'deletePage' | 'reorderPages' | 'getMedia' | 'deleteMedia' | 'updateAlbum'>;

export default function Editor() {
  const { id = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [loadError, setLoadError] = useState(false);
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
      <header className="editor-bar"><Link to="/">← Albums</Link></header>
      {loadError && <p role="alert" className="empty">Couldn't load album <button onClick={load}>Retry</button></p>}
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

// `uploader` is swappable so /dev/editor can fake uploads without a server.
export function EditorView({ bundle, api, uploader = useUpload }: { bundle: AlbumBundle; api: EditorApi; uploader?: typeof useUpload }) {
  const albumId = bundle.album.id;
  const [media, setMedia] = useState(() => new Map(bundle.media.map((m) => [m.id, m])));
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [coverId, setCoverId] = useState(bundle.album.coverMediaId);
  const [cropId, setCropId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageDTO[]>(bundle.pages);
  const [cur, setCur] = useState(0);
  const page = pages[cur] as PageDTO | undefined;
  const [hist, setHist] = useState(() => initHistory(page?.layout ?? EMPTY));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // page op in progress: editing frozen so nothing lands mid-switch/delete
  const navigate = useNavigate();
  const layout = hist.present;
  // Async page ops read the state as it is after their awaits, not as it was when they started.
  const latest = useRef({ pages, cur, layout, busy });
  latest.current = { pages, cur, layout, busy };

  // Never send a layout the server would reject: a validation failure shows as the "Save failed" status.
  const save = useCallback((id: string, l: PageLayout, opts?: { keepalive?: boolean }) => {
    const r = pageLayoutSchema.safeParse(l);
    if (!r.success) { console.error('invalid layout', r.error.issues); return Promise.reject(r.error); }
    return api.savePage(id, r.data, opts);
  }, [api]);
  const { status, flush } = useAutosave(page?.id ?? '', layout, save);

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
        pollUntilSettled(next, get).catch(() => {}).finally(() => { p.running--; pump(); });
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
  const addToFrame = (frameId: string) => {
    framePick.current.frameId = frameId;
    framePick.current.input?.click();
  };
  const putInFrame = (mediaId: string, frameId: string) => commit((l) => assignMedia(l, frameId, mediaId), frameId);
  // The server empties frames on delete; mirror that everywhere here (pages, undo history) so no later save
  // sends a mediaId the server no longer knows.
  const deleteMedia = (mediaId: string) => run('delete media', async () => {
    if (!(await saved())) return;
    await api.deleteMedia(mediaId);
    const strip = (l: PageLayout) => clearMedia(l, mediaId);
    setPages((ps) => ps.map((p) => ({ ...p, layout: strip(p.layout) })));
    setHist((h) => ({ past: h.past.map(strip), present: strip(h.present), future: h.future.map(strip) }));
    setMedia((cur) => { const n = new Map(cur); n.delete(mediaId); return n; });
    setCoverId((c) => (c === mediaId ? null : c));
  });
  const setCover = (mediaId: string) => api.updateAlbum(albumId, { coverMediaId: mediaId })
    .then(() => setCoverId(mediaId), () => setOpError("Couldn't set the album cover"));

  // Pages list keeps the current page's latest layout too (thumbnails, and switching back).
  const withCurrent = ({ pages: ps, cur: c, layout: l } = latest.current) => ps.map((p, i) => (i === c ? { ...p, layout: l } : p));
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
    setOpError("This page didn't save. Press Save to retry.");
    return false;
  };
  const run = async (what: string, f: () => Promise<void>) => {
    setOpError(null);
    setBusy(true);
    latest.current.busy = true;
    try { await f(); } catch { setOpError(`Couldn't ${what}`); } finally { setBusy(false); }
  };

  const switchTo = (i: number) => run('switch page', async () => {
    if (await saved()) show(withCurrent(), i);
  });
  const addPage = (templateId: string) => run('add page', async () => {
    setPicking(false);
    if (!(await saved())) return;
    const at = latest.current.pages.length ? latest.current.cur + 1 : 0;
    const p = await api.addPage(albumId, templateId, at);
    const ps = withCurrent();
    ps.splice(at, 0, p);
    show(ps, at);
  });
  const deletePage = () => run('delete page', async () => {
    const id = page?.id;
    if (!id || !(await saved())) return;
    await api.deletePage(id);
    const ps = latest.current.pages.filter((p) => p.id !== id);
    show(ps, Math.max(0, Math.min(latest.current.cur, ps.length - 1)));
  });
  const leave = (e: MouseEvent) => {
    e.preventDefault();
    void run('leave', async () => { if (await saved()) navigate(`/albums/${albumId}`); });
  };
  const move = (from: number, to: number) => run('reorder pages', async () => {
    if (from === to || to < 0 || to >= pages.length) return;
    const ps = withCurrent();
    const [p] = ps.splice(from, 1);
    ps.splice(to, 0, p);
    const curId = page?.id;
    setPages(ps);
    setCur(ps.findIndex((x) => x.id === curId));
    await api.reorderPages(albumId, ps.map((x) => x.id));
  });

  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  useEffect(() => { if (cropId !== selectedId) setCropId(null); }, [cropId, selectedId]);
  const trayMedia = useMemo(() => [...media.values()].reverse(), [media]); // newest first
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (latest.current.busy || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); setHist(e.shiftKey ? redo : undo); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); setHist(redo); return; }
      if (!selectedId) return;
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
        return el ? updateElement(l, el.id, { x: el.x + d[0] * 0.005, y: el.y + d[1] * 0.005 }) : l;
      }, undefined, `nudge:${selectedId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, commit]);

  const shownPages = withCurrent();
  return (
    <main className={`editor${busy ? ' busy' : ''}`} aria-busy={busy}>
      <header className="editor-bar">
        <Link to={`/albums/${albumId}`} onClick={leave}>← Done</Link>
        <h1>{bundle.album.title}</h1>
      </header>
      {page && (
        <Toolbar layout={layout} selected={selected} commit={commit}
          undo={() => setHist(undo)} redo={() => setHist(redo)} canUndo={hist.past.length > 0} canRedo={hist.future.length > 0}
          status={status} save={() => void flush().then((ok) => ok && setOpError(null))}
          crop={() => setCropId(selectedId)} />
      )}
      <div className="edit-main">
        <div className="edit-stage">
          {page ? <EditCanvas layout={layout} media={media} selectedId={selectedId} onSelect={setSelectedId} onCommit={commit}
            onFrameAddMedia={addToFrame} cropId={cropId} onCrop={setCropId} />
            : <p className="empty">No pages yet — add one below.</p>}
        </div>
        <MediaTray media={trayMedia} items={upload.items} coverMediaId={coverId}
          onUpload={(files) => upload.add(files)} onRetry={upload.retry}
          onPick={(id) => selected?.type === 'frame' && putInFrame(id, selected.id)} onDrop={putInFrame}
          onDelete={deleteMedia} onSetCover={setCover} />
        <input type="file" accept={ACCEPT} hidden aria-label="Upload into frame" ref={(n) => { framePick.current.input = n; }}
          onChange={(e) => { upload.add([...e.target.files ?? []], framePick.current.frameId); e.target.value = ''; }} />
      </div>
      {opError && <p role="alert" className="error op-error">{opError}</p>}
      <nav className="page-strip" aria-label="Pages">
        {shownPages.map((p, i) => (
          <div key={p.id} className={`thumb${i === cur ? ' current' : ''}`} draggable
            onDragStart={(e) => e.dataTransfer.setData(PAGE_DRAG, String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const from = e.dataTransfer.getData(PAGE_DRAG); // '' for drops that aren't a page thumbnail
              if (from) { e.preventDefault(); move(Number(from), i); }
            }}>
            <button type="button" className="thumb-page" aria-label={`Page ${i + 1}`} aria-current={i === cur}
              onClick={() => i !== cur && void switchTo(i)}>
              <PageRenderer layout={p.layout} media={media} mode="edit" active={false} />
            </button>
            {i === cur && (
              <div className="thumb-actions">
                <button type="button" aria-label="Move page left" disabled={i === 0} onClick={() => move(i, i - 1)}>◀</button>
                <button type="button" aria-label="Delete page" onClick={() => setConfirmDelete(true)}>✕</button>
                <button type="button" aria-label="Move page right" disabled={i === pages.length - 1} onClick={() => move(i, i + 1)}>▶</button>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="thumb-add" aria-label="Add page" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>+</button>
      </nav>
      {confirmDelete && (
        <div className="inline-confirm" role="alertdialog" aria-label="Delete page">
          Delete page {cur + 1}? Photos stay in the album.
          <button type="button" onClick={deletePage}>Delete</button>
          <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      )}
      {picking && (
        <div className="template-picker" role="dialog" aria-label="Pick a template">
          {templates.map((t) => (
            <button key={t.id} type="button" className="template" onClick={() => addPage(t.id)}>
              <PageRenderer layout={t.layout} media={noMedia} mode="edit" active={false} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
