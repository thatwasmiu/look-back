import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { forgetGuestLink, rememberGuestLink, useLinkManifest } from '../guestLink';
import { useT } from '../i18n';
import { Book } from './Viewer';

// Public, read-only album opened from a share link (/s/:token). No login; the server sets a cookie that lets
// this visitor load this album's photos and videos, nothing else.
export default function SharedAlbum() {
  const { token = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [error, setError] = useState<'gone' | 'down' | null>(null);
  const t = useT();
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
  if (error === 'gone') return <main className="viewer"><p className="empty">{t("This album isn't shared any more, or the link is wrong.")}</p></main>;
  if (error === 'down') return <main className="viewer"><p className="empty">{t("Couldn't reach the server. Try again later.")}</p></main>;
  return <main className="viewer" />;
}
