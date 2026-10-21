import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { AlbumBundle } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { mediaUrl } from '../mediaUrl';
import { EXAMPLE_ALBUM_ID, exampleAlbum } from '../example/lookBack';
import { BackgroundEffectView } from '../render/effects';
import { PageRenderer } from '../render/PageRenderer';
import { planPreload, runPreload } from '../viewer/preload';
import { nextIndex, prevIndex, visiblePages } from '../viewer/spread';
import { useT } from '../i18n';
import { useFlip, useSpread } from '../viewer/useFlip';

export default function Viewer() {
  const t = useT();
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
      <header className="viewer-bar"><Link to="/">← {t('Albums')}</Link></header>
      {loadError && <p role="alert" className="empty">{t("Couldn't load the album")} <button onClick={load}>{t('Retry')}</button></p>}
    </main>
  );
}

// Spreads: the earlier page sits on the left (ltr) or on the right (rtl, manga); the cover sits alone on the far side.
const slotOf = (i: number, spread: boolean, rtl = false) => (!spread ? 'single' : (i % 2 === 1) !== rtl ? 'left' : 'right');

// `shared`: opened from a public share link — read-only, no way into the owner's app.
export function Book({ bundle, shared = false }: { bundle: AlbumBundle; shared?: boolean }) {
  const t = useT();
  const { album } = bundle;
  const pages = useMemo(() => bundle.pages.filter((p) => !p.layout.hidden), [bundle.pages]); // hidden: editor only
  const total = pages.length;
  const media = useMemo(() => new Map(bundle.media.map((m) => [m.id, m])), [bundle.media]);
  const spread = useSpread();
  const rtl = album.readingDirection === 'rtl';
  const [params] = useSearchParams(); // ?page=N (1-based), from the editor's Done
  const { index, visible, turn, go, swipe } = useFlip(total, spread, rtl, (Number(params.get('page')) || 1) - 1);
  const slot = (i: number) => slotOf(i, spread, rtl);
  const forwardOnScreen = turn ? (turn.dir > 0) !== rtl : false; // a forward flip sweeps leftwards in ltr, rightwards in rtl
  const music = album.musicMediaId ? media.get(album.musicMediaId) : undefined;
  const musicSrc = music?.status === 'ready' && music.variants?.audio ? mediaUrl(music.variants.audio) : null;

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
  const lead = turn && (forwardOnScreen ? 'right' : 'left');

  return (
    <main className={`viewer desk-${album.backgroundColor}`}>
      <BackgroundEffectView kind={album.backgroundEffect} />
      <header className="viewer-bar">
        {!shared && <Link to="/">← {t('Albums')}</Link>}
        <h1>{album.title}</h1>
        {musicSrc && <Music src={musicSrc} />}
        {total > 0 && <span className="counter">{visible.map((i) => i + 1).join('–')} / {total}</span>}
        {!shared && album.id !== EXAMPLE_ALBUM_ID && <Link className="btn secondary" to={`/albums/${album.id}/print`} title={t('Print or save as PDF')}>PDF</Link>}
        {!shared && album.id !== EXAMPLE_ALBUM_ID && <Link className="btn" to={`/albums/${album.id}/edit?page=${Math.max(1, bundle.pages.indexOf(pages[visible[0] ?? 0]) + 1)}`}>{t('Edit')}</Link>}
      </header>
      {total === 0 ? <p className="empty">{t(bundle.pages.length ? 'Every page is hidden.' : 'No pages yet.')}</p> : (
        <div className="stage">
          <div className={`book${spread ? ' spread' : ''}${visible.some((i) => slot(i) === 'left') ? ' has-left' : ''}${turn ? (forwardOnScreen ? ' fwd' : ' back') : ''}`} {...swipe}>
            {pages.map((p, i) => {
              if (!mounted.has(i)) return null;
              const pos = slot(i);
              const shown = visible.includes(i);
              let state = shown ? 'shown' : 'hidden';
              if (turn && !shown && turn.from.includes(i)) state = pos === lead || pos === 'single' ? 'sweep' : 'fade';
              else if (turn && shown && !turn.from.some((j) => slot(j) === pos)) state = 'shown fade-in';
              return (
                <div key={p.id} className={`leaf ${pos} ${state}`} data-page={i} aria-hidden={!shown}>
                  <PageRenderer layout={p.layout} media={media} mode="view" active={shown} />
                </div>
              );
            })}
            {/* Edges by screen side; in rtl the left one goes forward. */}
            {(['prev', 'next'] as const).map((side) => {
              const forward = (side === 'next') !== rtl;
              return <button key={side} type="button" className={`edge edge-${side}`} aria-label={t(forward ? 'Next page' : 'Previous page')}
                disabled={forward ? visible[visible.length - 1] === total - 1 : visible[0] === 0} onClick={() => go(forward ? 1 : -1)} />;
            })}
          </div>
        </div>
      )}
    </main>
  );
}

// Background music, looped. Browsers only allow sound after the viewer interacts, so it starts on the first tap
// or key press anywhere (a flip, usually); the ♪ button pauses and resumes it.
function Music({ src }: { src: string }) {
  const t = useT();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const play = () => { void ref.current?.play()?.catch(() => {}); };
  useEffect(() => {
    const first = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.music-btn')) return; // the button handles its own click
      play();
      off();
    };
    const off = () => { window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
    return off;
  }, [src]);
  return (
    <>
      <audio ref={ref} src={src} loop preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button type="button" className={`music-btn${playing ? ' on' : ''}`} aria-pressed={playing}
        aria-label={t(playing ? 'Pause music' : 'Play music')} title={t(playing ? 'Pause music' : 'Play music')}
        onClick={() => (ref.current?.paused ? play() : ref.current?.pause())}>♪</button>
    </>
  );
}
