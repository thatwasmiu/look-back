import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api } from '../api';
import { useT } from '../i18n';
import { PageRenderer } from '../render/PageRenderer';
import { SpaceTile, tileCount } from '../render/SpaceTile';

// Export: every page one per sheet, then the browser's own print dialog — "Save as PDF" there (on iPhone:
// Share → Save to Files). Fonts, stickers and photos print exactly as drawn. Videos show their poster.
export default function PrintAlbum() {
  const t = useT();
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

  if (failed) return <main className="print-album"><p className="error">{t("Couldn't load the album")}. <Link to="/">← {t('Albums')}</Link></p></main>;
  if (!bundle) return <main className="print-album"><p>{t('Loading…')}</p></main>;
  return (
    <main className="print-album" ref={root}>
      <header className="print-bar">
        <Link to={`/albums/${id}`}>← {t('Back')}</Link>
        <h1>{bundle.album.title}</h1>
        <button type="button" disabled={!ready} onClick={() => window.print()}>{t(ready ? 'Print / Save PDF' : 'Getting the photos ready…')}</button>
      </header>
      {/* One sheet per page; a space prints one sheet per tile of its length. */}
      {bundle.pages.filter((p) => !p.layout.hidden).flatMap((p) => Array.from({ length: tileCount(p.layout) }, (_, i) => (
        <section key={`${p.id}-${i}`} className="print-sheet">
          {p.layout.space ? <SpaceTile layout={p.layout} media={media} index={i} grid />
            : <PageRenderer layout={p.layout} media={media} mode="view" active={false} />}
        </section>
      )))}
    </main>
  );
}
