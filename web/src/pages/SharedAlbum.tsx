import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { Book } from './Viewer';

// Public, read-only album opened from a share link (/s/:token). No login; the server sets a cookie that lets
// this visitor load this album's photos and videos, nothing else.
export default function SharedAlbum() {
  const { token = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [error, setError] = useState<'gone' | 'down' | null>(null);
  useEffect(() => {
    api.getShared(token).then(setBundle, (e) => setError(e instanceof ApiError && e.status === 404 ? 'gone' : 'down'));
  }, [token]);
  if (bundle) return <Book bundle={bundle} shared />;
  if (error === 'gone') return <main className="viewer"><p className="empty">This album is no longer shared, or the link is wrong.</p></main>;
  if (error === 'down') return <main className="viewer"><p className="empty">Can't reach the server. Try again later.</p></main>;
  return <main className="viewer" />;
}
