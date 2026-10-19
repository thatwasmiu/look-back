import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api } from '../api';
import { PageRenderer } from '../render/PageRenderer';

// Export: every page one per sheet, then the browser's own print dialog — "Save as PDF" there (on iPhone:
// Share → Save to Files). Fonts, stickers and photos print exactly as drawn. Videos show their poster.
export default function PrintAlbum() {
  const { id = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLElement>(null);
  const printed = useRef(false);
  useEffect(() => { api.getAlbum(id).then(setBundle, () => setFailed(true)); }, [id]);
  const media = useMemo(() => new Map(bundle?.media.map((m) => [m.id, m]) ?? []), [bundle]);

  // Ready once the fonts and every photo have loaded (or 20 s passed); then the print dialog opens by itself once.
  useEffect(() => {
    if (!bundle) return;
    let alive = true;
    const t0 = Date.now();
    const poll = async () => {
      await document.fonts?.ready;
      const imgs = [...root.current?.querySelectorAll('img') ?? []];
      if (!alive) return;
      if (imgs.every((i) => i.complete) || Date.now() - t0 > 20_000) {
        setReady(true);
        if (!printed.current) { printed.current = true; setTimeout(() => window.print(), 400); } // fade-ins settle
      } else setTimeout(poll, 300);
    };
    void poll();
    return () => { alive = false; };
  }, [bundle]);

  if (failed) return <main className="print-album"><p className="error">Không tải được album. <Link to="/">← Albums</Link></p></main>;
  if (!bundle) return <main className="print-album"><p>Đang tải…</p></main>;
  return (
    <main className="print-album" ref={root}>
      <header className="print-bar">
        <Link to={`/albums/${id}`}>← Back</Link>
        <h1>{bundle.album.title}</h1>
        <button type="button" disabled={!ready} onClick={() => window.print()}>{ready ? 'In / Lưu PDF' : 'Đang chuẩn bị ảnh…'}</button>
      </header>
      {bundle.pages.map((p) => (
        <section key={p.id} className="print-sheet">
          <PageRenderer layout={p.layout} media={media} mode="view" active={false} />
        </section>
      ))}
    </main>
  );
}
