import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AlbumSummary } from '@scrapbook/shared';
import { api } from '../api';
import { mediaUrl } from '../mediaUrl';

export default function AlbumList() {
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => { api.listAlbums().then(setAlbums).catch(() => setAlbums([])); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const a = await api.createAlbum(title.trim());
    setAlbums((cur) => [...(cur ?? []), { ...a, coverThumb: null, pageCount: 0 }]);
    setTitle('');
    setCreating(false);
  }

  return (
    <main className="albums">
      <header>
        <h1>Our Scrapbook</h1>
        {creating ? (
          <form onSubmit={create} className="new-album">
            <input aria-label="Album title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <button type="submit">Create</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        ) : (
          <button onClick={() => setCreating(true)}>New album</button>
        )}
      </header>
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
