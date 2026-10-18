import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AlbumSummary } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { mediaUrl } from '../mediaUrl';

export default function AlbumList() {
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = () => {
    setLoadError(false);
    api.listAlbums().then(setAlbums, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) setLoadError(true); // 401: redirect in progress
    });
  };
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const a = await api.createAlbum(title.trim());
      setAlbums((cur) => [...(cur ?? []), { ...a, coverThumb: null, pageCount: 0 }]);
      setTitle('');
      setCreating(false);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setCreateError("Couldn't create album");
    }
  }

  return (
    <main className="albums">
      <header>
        <h1>Look Back</h1>
        {creating ? (
          <form onSubmit={create} className="new-album">
            <input aria-label="Album title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <button type="submit">Create</button>
            <button type="button" onClick={() => { setCreating(false); setTitle(''); setCreateError(''); }}>Cancel</button>
            {createError && <p role="alert" className="error">{createError}</p>}
          </form>
        ) : (
          <button onClick={() => setCreating(true)}>New album</button>
        )}
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
              <strong>{a.title}</strong>
            </Link>
            <small>{a.pageCount} pages · <Link to={`/albums/${a.id}/edit`}>Edit</Link></small>
          </li>
        ))}
      </ul>
    </main>
  );
}
