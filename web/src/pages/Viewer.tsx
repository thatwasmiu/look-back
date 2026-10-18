import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { EXAMPLE_ALBUM_ID, exampleAlbum } from '../example/lookBack';
import { BackgroundEffectView } from '../render/effects';
import { PageRenderer } from '../render/PageRenderer';
import { planPreload, runPreload } from '../viewer/preload';
import { nextIndex, prevIndex, visiblePages } from '../viewer/spread';
import { useFlip, useSpread } from '../viewer/useFlip';

export default function Viewer() {
  const { id = '' } = useParams();
  const [bundle, setBundle] = useState<AlbumBundle | null>(id === EXAMPLE_ALBUM_ID ? exampleAlbum : null);
  const [loadError, setLoadError] = useState(false);
  const load = useCallback(() => {
    setLoadError(false);
    if (id === EXAMPLE_ALBUM_ID) return setBundle(exampleAlbum); // built in, read-only
    api.getAlbum(id).then(setBundle, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) setLoadError(true); // 401: redirect in progress
    });
  }, [id]);
  useEffect(load, [load]);

  if (bundle) return <Book bundle={bundle} />;
  return (
    <main className="viewer">
      <header className="viewer-bar"><Link to="/">← Albums</Link></header>
      {loadError && <p role="alert" className="empty">Couldn't load album <button onClick={load}>Retry</button></p>}
    </main>
  );
}

const slotOf = (i: number, spread: boolean) => (!spread ? 'single' : i % 2 ? 'left' : 'right');

// `shared`: opened from a public share link — read-only, no way into the owner's app.
export function Book({ bundle, shared = false }: { bundle: AlbumBundle; shared?: boolean }) {
  const { album, pages } = bundle;
  const total = pages.length;
  const media = useMemo(() => new Map(bundle.media.map((m) => [m.id, m])), [bundle.media]);
  const spread = useSpread();
  const { index, visible, turn, go, swipe } = useFlip(total, spread);

  const visibleKey = visible.join();
  useEffect(() => {
    if (!total) return;
    const ac = new AbortController();
    runPreload(planPreload(pages, media, visible), ac.signal);
    return () => ac.abort();
  }, [pages, media, visibleKey]); // visibleKey stands in for visible (new array each render)

  // Current spread plus one flip either way stay mounted (hidden), so a flip only toggles classes and
  // never re-mounts — and re-decodes — the incoming page's images. Outgoing pages stay until the turn ends.
  const mounted = new Set([
    ...visiblePages(prevIndex(index, total, spread), total, spread), ...visible,
    ...visiblePages(nextIndex(index, total, spread), total, spread), ...(turn?.from ?? []),
  ]);
  const lead = turn && (turn.dir > 0 ? 'right' : 'left');

  return (
    <main className={`viewer desk-${album.backgroundColor}`}>
      <BackgroundEffectView kind={album.backgroundEffect} />
      <header className="viewer-bar">
        {!shared && <Link to="/">← Albums</Link>}
        <h1>{album.title}</h1>
        {total > 0 && <span className="counter">{visible.map((i) => i + 1).join('–')} / {total}</span>}
        {!shared && album.id !== EXAMPLE_ALBUM_ID && <Link className="btn" to={`/albums/${album.id}/edit`}>Edit</Link>}
      </header>
      {total === 0 ? <p className="empty">No pages yet.</p> : (
        <div className="stage">
          <div className={`book${spread ? ' spread' : ''}${visible.some((i) => i % 2) ? ' has-left' : ''}${turn ? (turn.dir > 0 ? ' fwd' : ' back') : ''}`} {...swipe}>
            {pages.map((p, i) => {
              if (!mounted.has(i)) return null;
              const slot = slotOf(i, spread);
              const shown = visible.includes(i);
              let state = shown ? 'shown' : 'hidden';
              if (turn && !shown && turn.from.includes(i)) state = slot === lead || slot === 'single' ? 'sweep' : 'fade';
              else if (turn && shown && !turn.from.some((j) => slotOf(j, spread) === slot)) state = 'shown fade-in';
              return (
                <div key={p.id} className={`leaf ${slot} ${state}`} data-page={i} aria-hidden={!shown}>
                  <PageRenderer layout={p.layout} media={media} mode="view" active={shown} />
                </div>
              );
            })}
            <button type="button" className="edge edge-prev" aria-label="Previous page" disabled={visible[0] === 0} onClick={() => go(-1)} />
            <button type="button" className="edge edge-next" aria-label="Next page" disabled={visible[visible.length - 1] === total - 1} onClick={() => go(1)} />
          </div>
        </div>
      )}
    </main>
  );
}
