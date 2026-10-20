import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api } from '../api';
import { EditorView } from './Editor';

// /e/<token>: an album's edit link. No password: opening it starts a guest session for that one album, and the
// editor only lets the guest fill the existing frames and change existing text (the server enforces the same).
export default function GuestEdit() {
  const { token = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.openEditLink(token).then(setBundle, () => setFailed(true)); }, [token]);
  if (bundle) return <EditorView bundle={bundle} api={api} guest />;
  return (
    <main className="editor">
      {failed
        ? <p role="alert" className="empty">Link sửa đã hết hạn hoặc đã bị thu hồi. Nhờ chủ album gửi link mới nhé.</p>
        : <p className="empty">Đang mở album…</p>}
    </main>
  );
}
