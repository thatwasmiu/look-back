import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pageLayoutSchema, templates, type AlbumBundle, type PageDTO, type PageLayout } from '@scrapbook/shared';
import { api as realApi, ApiError } from '../api';
import { PageRenderer } from '../render/PageRenderer';
import { EditCanvas } from '../editor/EditCanvas';
import { Toolbar } from '../editor/Toolbar';
import { initHistory, push, redo, undo } from '../editor/history';
import { removeElement, updateElement } from '../editor/layoutOps';
import { useAutosave } from '../editor/useAutosave';

export type EditorApi = Pick<typeof realApi, 'addPage' | 'savePage' | 'deletePage' | 'reorderPages'>;

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

export function EditorView({ bundle, api }: { bundle: AlbumBundle; api: EditorApi }) {
  const albumId = bundle.album.id;
  const media = useMemo(() => new Map(bundle.media.map((m) => [m.id, m])), [bundle.media]);
  const [pages, setPages] = useState<PageDTO[]>(bundle.pages);
  const [cur, setCur] = useState(0);
  const page = pages[cur] as PageDTO | undefined;
  const [hist, setHist] = useState(() => initHistory(page?.layout ?? EMPTY));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const layout = hist.present;

  // Never send a layout the server would reject: a validation failure shows as the "Save failed" status.
  const save = useCallback((id: string, l: PageLayout) => {
    const r = pageLayoutSchema.safeParse(l);
    if (!r.success) { console.error('invalid layout', r.error.issues); return Promise.reject(r.error); }
    return api.savePage(id, r.data);
  }, [api]);
  const { status, flush } = useAutosave(page?.id ?? '', layout, save);

  const commit = useCallback((l: PageLayout, select?: string | null) => {
    setHist((h) => (l === h.present ? h : push(h, l)));
    if (select !== undefined) setSelectedId(select);
  }, []);

  // Pages list keeps the current page's latest layout too (thumbnails, and switching back).
  const withCurrent = (ps: PageDTO[]) => ps.map((p, i) => (i === cur ? { ...p, layout } : p));
  const switchTo = async (i: number, ps = withCurrent(pages)) => {
    await flush();
    setPages(ps);
    setCur(i);
    setHist(initHistory(ps[i]?.layout ?? EMPTY));
    setSelectedId(null);
    setConfirmDelete(false);
  };
  const run = async (what: string, f: () => Promise<void>) => {
    setOpError(null);
    try { await f(); } catch { setOpError(`Couldn't ${what}`); }
  };

  const addPage = (templateId: string) => run('add page', async () => {
    setPicking(false);
    const at = pages.length ? cur + 1 : 0;
    const p = await api.addPage(albumId, templateId, at);
    const ps = withCurrent(pages);
    ps.splice(at, 0, p);
    await switchTo(at, ps);
  });
  const deletePage = () => run('delete page', async () => {
    if (!page) return;
    await flush();
    await api.deletePage(page.id);
    const ps = pages.filter((p) => p.id !== page.id);
    setPages(ps);
    const i = Math.min(cur, ps.length - 1);
    setCur(Math.max(i, 0));
    setHist(initHistory(ps[i]?.layout ?? EMPTY));
    setSelectedId(null);
    setConfirmDelete(false);
  });
  const move = (from: number, to: number) => run('reorder pages', async () => {
    if (from === to || to < 0 || to >= pages.length) return;
    const ps = withCurrent(pages);
    const [p] = ps.splice(from, 1);
    ps.splice(to, 0, p);
    const curId = page?.id;
    setPages(ps);
    setCur(ps.findIndex((x) => x.id === curId));
    await api.reorderPages(albumId, ps.map((x) => x.id));
  });

  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); setHist(e.shiftKey ? redo : undo); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); setHist(redo); return; }
      if (!selectedId) return;
      // Derive from h.present, not the render's layout: key repeats can arrive before a re-render.
      const edit = (f: (l: PageLayout) => PageLayout) => { e.preventDefault(); setHist((h) => push(h, f(h.present))); };
      if (e.key === 'Delete' || e.key === 'Backspace') { edit((l) => removeElement(l, selectedId)); setSelectedId(null); return; }
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = nudge[e.key];
      if (d) edit((l) => {
        const el = l.elements.find((x) => x.id === selectedId);
        return el ? updateElement(l, el.id, { x: el.x + d[0] * 0.005, y: el.y + d[1] * 0.005 }) : l;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const shownPages = withCurrent(pages);
  return (
    <main className="editor">
      <header className="editor-bar">
        <Link to={`/albums/${albumId}`}>← Done</Link>
        <h1>{bundle.album.title}</h1>
      </header>
      {page && (
        <Toolbar layout={layout} selected={selected} commit={commit}
          undo={() => setHist(undo)} redo={() => setHist(redo)} canUndo={hist.past.length > 0} canRedo={hist.future.length > 0}
          status={status} save={() => void flush()} />
      )}
      <div className="edit-stage">
        {page ? <EditCanvas layout={layout} media={media} selectedId={selectedId} onSelect={setSelectedId} onCommit={commit} />
          : <p className="empty">No pages yet — add one below.</p>}
      </div>
      {opError && <p role="alert" className="error op-error">{opError}</p>}
      <nav className="page-strip" aria-label="Pages">
        {shownPages.map((p, i) => (
          <div key={p.id} className={`thumb${i === cur ? ' current' : ''}`} draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); move(Number(e.dataTransfer.getData('text/plain')), i); }}>
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
