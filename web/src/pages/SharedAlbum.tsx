import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { forgetGuestLink, rememberGuestLink, useLinkManifest } from '../guestLink';
import { Book } from './Viewer';

// Public, read-only album opened from a share link (/s/:token). No login; the server sets a cookie that lets
// this visitor load this album's photos and videos, nothing else.
export default function SharedAlbum() {
  const { token = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [error, setError] = useState<'gone' | 'down' | null>(null);
  useLinkManifest('s', token);
  useEffect(() => {
    api.getShared(token).then(
      (b) => { rememberGuestLink(`/s/${token}`); setBundle(b); },
      (e) => {
        const gone = e instanceof ApiError && e.status === 404;
        if (gone) forgetGuestLink(`/s/${token}`);
        setError(gone ? 'gone' : 'down');
      });
  }, [token]);
  if (bundle) return <Book bundle={bundle} shared />;
  if (error === 'gone') return <main className="viewer"><p className="empty">Album này không còn được chia sẻ, hoặc link không đúng.</p></main>;
  if (error === 'down') return <main className="viewer"><p className="empty">Không kết nối được server. Hãy thử lại sau.</p></main>;
  return <main className="viewer" />;
}
