import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api } from '../api';
import { forgetGuestLink, rememberGuestLink, useLinkManifest } from '../guestLink';
import { useT } from '../i18n';
import { EditorView } from './Editor';

// /e/<token>: an album's edit link. No password: opening it starts a guest session for that one album, and the
// editor only lets the guest fill the existing frames and change existing text (the server enforces the same).
export default function GuestEdit() {
  const { token = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const t = useT();
  useLinkManifest('e', token);
  useEffect(() => {
    api.openEditLink(token).then(
      (b) => { rememberGuestLink(`/e/${token}`); setBundle(b); },
      () => { forgetGuestLink(`/e/${token}`); setFailed(true); });
  }, [token]);
  if (bundle) return <EditorView bundle={bundle} api={api} guest />;
  return (
    <main className="editor">
      {failed
        ? <p role="alert" className="empty">{t('This edit link has expired or was revoked. Ask the album owner for a new one.')}</p>
        : <p className="empty">{t('Opening the album…')}</p>}
    </main>
  );
}
