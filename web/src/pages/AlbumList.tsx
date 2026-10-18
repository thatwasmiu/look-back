import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AlbumSummary } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { exampleAlbum, exampleCover } from '../example/lookBack';
import { mediaUrl } from '../mediaUrl';

export default function AlbumList() {
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState('');
  const [confirming, setConfirming] = useState<AlbumSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState<AlbumSummary | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const shareUrl = (t: string) => `${location.origin}/s/${t}`;
  const setToken = (id: string, shareToken: string | null) => {
    setAlbums((cur) => cur?.map((x) => (x.id === id ? { ...x, shareToken } : x)) ?? cur);
    setSharing((s) => (s && s.id === id ? { ...s, shareToken } : s));
  };
  async function toggleShare(a: AlbumSummary, on: boolean) {
    setShareBusy(true);
    try {
      if (on) setToken(a.id, (await api.shareAlbum(a.id)).shareToken);
      else { await api.unshareAlbum(a.id); setToken(a.id, null); }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setLoadError(true);
    } finally {
      setShareBusy(false);
    }
  }

  // Permanent (pages, photos and videos go too), so it always asks first.
  async function remove(a: AlbumSummary) {
    setDeleting(true);
    try {
      await api.deleteAlbum(a.id);
      setAlbums((cur) => cur?.filter((x) => x.id !== a.id) ?? cur);
      setConfirming(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setLoadError(true);
    } finally {
      setDeleting(false);
    }
  }

  const load = () => {
    setLoadError(false);
    api.listAlbums().then(setAlbums, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) setLoadError(true); // 401: redirect in progress
    });
  };
  useEffect(load, []);

  const closeCreate = () => { setCreating(false); setTitle(''); setCreateError(''); };
  useEffect(() => {
    if (!creating) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCreate(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [creating]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const a = await api.createAlbum(title.trim());
      setAlbums((cur) => [...(cur ?? []), { ...a, coverThumb: null, pageCount: 0 }]);
      closeCreate();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setCreateError("Couldn't create album");
    }
  }

  return (
    <main className="albums">
      <header>
        <h1 className="brand"><img className="brand-logo" src="/brand/logo.svg" alt="" />Look Back</h1>
        <button onClick={() => setCreating(true)}>New album</button>
      </header>
      {loadError && (
        <p role="alert" className="empty">Couldn't load albums <button onClick={load}>Retry</button></p>
      )}
      {albums && albums.length === 0 && <p className="empty">No albums yet.</p>}
      <ul className="grid">
        {albums?.map((a, i) => (
          <li key={a.id} className="polaroid" style={{ '--tilt': `${((i % 5) - 2) * 1.2}deg` } as CSSProperties}>
            <Link to={`/albums/${a.id}`}>
              {a.coverThumb ? <img src={mediaUrl(a.coverThumb)} alt="" loading="lazy" /> : <div className="blank" />}
              <strong title={a.title}>{a.title}</strong>
            </Link>
            <small>
              {a.pageCount} {a.pageCount === 1 ? 'page' : 'pages'} · <Link to={`/albums/${a.id}/edit`}>Edit</Link> ·{' '}
              <button type="button" className="link-btn" aria-label={`Share ${a.title}`} onClick={() => setSharing(a)}>{a.shareToken ? 'Shared' : 'Share'}</button> ·{' '}
              <button type="button" className="link-btn" aria-label={`Delete ${a.title}`} onClick={() => setConfirming(a)}>Delete</button>
            </small>
          </li>
        ))}
        {albums && (
          <li className="polaroid example" style={{ '--tilt': '1.5deg' } as CSSProperties}>
            <Link to={`/albums/${exampleAlbum.album.id}`}>
              <img src={exampleCover} alt="" loading="lazy" />
              <strong>{exampleAlbum.album.title}</strong>
            </Link>
            <small>Example · {exampleAlbum.pages.length} pages · view only</small>
          </li>
        )}
      </ul>
      {creating && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeCreate(); }}>
          <form onSubmit={create} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-album-h">
            <button type="button" className="modal-close" aria-label="Close" onClick={closeCreate}>×</button>
            <h2 id="new-album-h">New album</h2>
            <input aria-label="Album title" placeholder="e.g. Tà Xùa 2026" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            {createError && <p role="alert" className="error">{createError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeCreate}>Cancel</button>
              <button type="submit" disabled={!title.trim()}>Create</button>
            </div>
          </form>
        </div>
      )}
      {sharing && (
        <div className="inline-confirm album-confirm share-dialog" role="dialog" aria-label="Share album">
          {sharing.shareToken ? (
            <>
              <span>Anyone with this link can view "{sharing.title}" (not edit):</span>
              <input readOnly aria-label="Share link" value={shareUrl(sharing.shareToken)} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={() => void navigator.clipboard?.writeText(shareUrl(sharing.shareToken!))}>Copy</button>
              <button type="button" className="danger" disabled={shareBusy} onClick={() => void toggleShare(sharing, false)}>Stop sharing</button>
            </>
          ) : (
            <>
              <span>Share "{sharing.title}" as a view-only link — no password needed to open it.</span>
              <button type="button" disabled={shareBusy} onClick={() => void toggleShare(sharing, true)}>Create share link</button>
            </>
          )}
          <button type="button" className="secondary" onClick={() => setSharing(null)}>Close</button>
        </div>
      )}
      {confirming && (
        <div className="inline-confirm album-confirm" role="alertdialog" aria-label="Delete album">
          Delete "{confirming.title}" and all its photos and videos? This can't be undone.
          <button type="button" className="danger" disabled={deleting} onClick={() => void remove(confirming)}>Delete album</button>
          <button type="button" className="secondary" disabled={deleting} onClick={() => setConfirming(null)}>Cancel</button>
        </div>
      )}
    </main>
  );
}
