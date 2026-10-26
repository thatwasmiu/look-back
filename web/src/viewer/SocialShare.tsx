import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { toJpeg } from 'html-to-image';
import { MODES, PHOTO_FILTER_CSS, type AlbumBundle, type FrameEl, type PageLayout } from '@scrapbook/shared';
import { useT } from '../i18n';
import { PageRenderer } from '../render/PageRenderer';
import { mediaUrl } from '../mediaUrl';
import { BOOMERANG_SEC, boomerangOrder, canRecordVideo, recordSlideshow, SLIDE_SEC, type Picture } from './slideshow';

// "Share to social": every visible page as a picture sized for a feed post (4:5) or a story / TikTok (9:16) — the
// page centred on the album's desk colour, so nothing gets cropped — handed to the phone's share menu (Instagram,
// Facebook, TikTok, Zalo…) or downloaded. Pages are drawn by the real renderer off screen and photographed with
// html-to-image; videos show their poster, effects freeze. Lazy-loaded: only this dialog pulls html-to-image in.
export const FORMATS = { post: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } } as const;
export type SocialFormat = keyof typeof FORMATS;
const MARGIN = 0.06; // of the picture's smaller side, all round

// Where a 3:4 page sits in the picture: as large as fits inside the margins, centred.
export function fitPage(format: SocialFormat): { width: number; height: number; left: number; top: number } {
  const { w, h } = FORMATS[format];
  const m = Math.min(w, h) * MARGIN;
  const width = Math.min(w - 2 * m, ((h - 2 * m) * 3) / 4);
  const height = (width * 4) / 3;
  return { width, height, left: (w - width) / 2, top: (h - height) / 2 };
}

const dataUrlToFile = (url: string, name: string): File => {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'image/jpeg' });
};

// Every photo in the stage loaded (or failed), shown (BlurImage fades a photo in only once React has marked it
// loaded), and the fonts ready, before a picture is taken. Gives up waiting after a few seconds.
async function settled(root: HTMLElement, maxMs = 3000): Promise<void> {
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null
    : new Promise((ok) => { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', ok, { once: true }); }))));
  await (document as { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  for (const end = Date.now() + maxMs; root.querySelector('img.sharp:not(.loaded)') && Date.now() < end;) {
    await new Promise((ok) => setTimeout(ok, 50));
  }
}

// Safari (every iPhone browser) paints the photos inside html-to-image's SVG only from the second draw on: the first
// pictures come out with empty frames. There each picture is drawn a few times and the last one kept.
const webkit = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent);
const DRAWS = webkit ? 3 : 1;

type Shot = { name: string; url: string };

// viewLink: the album's view-only link, if there is one (the owner's share link, or the link a viewer came in by).
export function SocialShare({ bundle, onClose, viewLink }: { bundle: AlbumBundle; onClose(): void; viewLink?: string | null }) {
  const t = useT();
  const pages = useMemo(() => bundle.pages.filter((p) => !p.layout.hidden), [bundle.pages]);
  const media = useMemo(() => new Map(bundle.media.map((m) => [m.id, m])), [bundle.media]);
  const [format, setFormat] = useState<SocialFormat>('post');
  const [picked, setPicked] = useState(() => new Set(pages.map((p) => p.id)));
  const [busy, setBusy] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
  const canVideo = useMemo(canRecordVideo, []);
  const [staging, setStaging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const chosen = pages.filter((p) => picked.has(p.id));
  const name = (i: number) => `${bundle.album.title}-${i + 1}.jpg`;
  const shareLink = viewLink ?? (bundle.album.shareToken ? `${location.origin}/s/${bundle.album.shareToken}` : null);

  const reset = () => { setShots(null); setVideo((v) => { if (v) URL.revokeObjectURL(v.url); return null; }); };
  // The pictures of the chosen pages; null (with the error shown) when they can't be made.
  const render = async (): Promise<Shot[] | null> => {
    setError(null);
    reset();
    setStaging(true);
    await new Promise((ok) => setTimeout(ok, 0)); // let the stage render
    const out: Shot[] = [];
    try {
      const frames = [...stage.current?.querySelectorAll<HTMLElement>('.social-frame') ?? []];
      for (const [i, frame] of frames.entries()) {
        setBusy(t('Making image {n}/{total}…', { n: i + 1, total: frames.length }));
        await settled(frame);
        const { w, h } = FORMATS[format];
        const opts = { quality: 0.92, pixelRatio: 1, width: w, height: h, cacheBust: false,
          // html-to-image inlines an <img>'s src but not a <picture>'s AVIF <source>, which the picture would then
          // prefer and can't load: drop the sources.
          filter: (n: HTMLElement) => n.nodeName !== 'SOURCE' };
        let url = '';
        for (let d = 0; d < DRAWS; d++) url = await toJpeg(frame, opts);
        out.push({ name: name(i), url });
      }
      return out;
    } catch {
      setError(t("Couldn't make the images. A photo kept in a bucket without CORS can't be drawn — move it to the VPS or turn on CORS."));
      return null;
    } finally {
      setBusy(null);
      setStaging(false);
    }
  };
  const make = async () => setShots(await render());
  const music = bundle.album.musicMediaId ? media.get(bundle.album.musicMediaId) : undefined;
  // Boomerang (photobooth): the chosen pages' shots, in reading order, forward and back — no page pictures needed.
  const canBoomerang = canVideo && MODES[bundle.album.mode ?? 'scrapbook'].boomerang;
  const shotsOf = (l: PageLayout): Picture[] => l.elements
    .filter((e): e is FrameEl => e.type === 'frame' && !!e.mediaId)
    .sort((a, b) => Math.round(a.y / 0.05) - Math.round(b.y / 0.05) || a.x - b.x)
    .flatMap((e) => {
      const m = media.get(e.mediaId!);
      const key = m?.status === 'ready' ? (m.kind === 'image' ? m.variants?.display : m.variants?.poster) : undefined;
      return key ? [{ src: mediaUrl(key), filter: l.filter ? PHOTO_FILTER_CSS[l.filter] : undefined }] : [];
    });
  const makeBoomerang = async () => {
    setError(null);
    reset();
    const shots = chosen.flatMap((p) => shotsOf(p.layout));
    if (shots.length < 2) { setError(t('A boomerang needs at least two photos on the chosen pages.')); return; }
    const { w, h } = FORMATS[format];
    const order = boomerangOrder(shots);
    try {
      setBusy(t('Recording the video… {n}/{total} s', { n: 0, total: Math.ceil(order.length * BOOMERANG_SEC) }));
      const file = await recordSlideshow({
        pictures: order, width: w, height: h, name: `${bundle.album.title}-boomerang`, slideSec: BOOMERANG_SEC, fadeSec: 0, zoom: 0,
        onProgress: (n, total) => setBusy(t('Recording the video… {n}/{total} s', { n, total: Math.ceil(total) })),
      });
      setVideo({ file, url: URL.createObjectURL(file) });
    } catch {
      setError(t("Couldn't record the video in this browser."));
    } finally {
      setBusy(null);
    }
  };
  const makeVideo = async () => {
    const pics = await render();
    if (!pics) return;
    const { w, h } = FORMATS[format];
    try {
      setBusy(t('Recording the video… {n}/{total} s', { n: 0, total: pics.length * SLIDE_SEC }));
      const file = await recordSlideshow({
        pictures: pics.map((p) => p.url), width: w, height: h, name: bundle.album.title,
        musicUrl: music?.status === 'ready' && music.variants?.audio ? mediaUrl(music.variants.audio) : null,
        onProgress: (n, total) => setBusy(t('Recording the video… {n}/{total} s', { n, total })),
      });
      setVideo({ file, url: URL.createObjectURL(file) });
    } catch {
      setError(t("Couldn't record the video in this browser."));
    } finally {
      setBusy(null);
    }
  };

  const files = () => (video ? [video.file] : (shots ?? []).map((s) => dataUrlToFile(s.url, s.name)));
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  const made = !!shots?.length || !!video;
  const canShareFiles = made && typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: files() });
  const shareFiles = () => nav.share({ files: files(), title: bundle.album.title }).catch(() => {});
  const download = () => {
    if (video) {
      const a = document.createElement('a');
      a.href = video.url;
      a.download = video.file.name;
      a.click();
      return;
    }
    for (const s of shots ?? []) {
      const a = document.createElement('a');
      a.href = s.url;
      a.download = s.name;
      a.click();
    }
  };

  const fit = fitPage(format);
  const { w, h } = FORMATS[format];
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal social-share" role="dialog" aria-modal="true" aria-labelledby="social-h">
        <button type="button" className="modal-close" aria-label={t('Close')} disabled={!!busy} onClick={onClose}>×</button>
        <h2 id="social-h">{t('Share to social media')}</h2>
        <div className="mode-switch" role="radiogroup" aria-label={t('Size')}>
          {(['post', 'story'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={format === f} disabled={!!busy} onClick={() => { setFormat(f); reset(); }}>
              {t(f === 'post' ? 'Post 4:5 (Instagram, Facebook)' : 'Story / TikTok 9:16')}
            </button>
          ))}
        </div>
        <p className="manage-hint">{t('One image per page; Instagram takes up to 20 in a post, TikTok 35. Videos show their cover.')}
          {canVideo && <> {t("Or one video: 3 s per page, with the album's music.")}</>}</p>
        <div className="social-pages">
          {pages.map((p, i) => (
            <label key={p.id}>
              <input type="checkbox" checked={picked.has(p.id)} disabled={!!busy}
                onChange={() => { reset(); setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); }} />
              {t('Page {n}', { n: i + 1 })}
            </label>
          ))}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        {busy && <p role="status">{busy}</p>}
        {video && <video className="social-video" src={video.url} controls playsInline />}
        {video && !video.file.type.includes('mp4') && <p className="manage-hint">{t('This browser records WebM; Instagram may not take it — Safari or Chrome make MP4.')}</p>}
        {shots && <div className="social-shots">{shots.map((s) => <img key={s.name} src={s.url} alt={s.name} />)}</div>}
        <div className="modal-actions">
          {shareLink && (
            <a className="btn secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener">
              {t('Share the view link on Facebook')}
            </a>
          )}
          {!made && canBoomerang && (
            <button type="button" className="secondary" disabled={!!busy || !chosen.length} onClick={() => void makeBoomerang()}>🔁 {t('Boomerang')}</button>
          )}
          {!made && canVideo && (
            <button type="button" className="secondary" disabled={!!busy || !chosen.length} onClick={() => void makeVideo()}>{t('Make video')}</button>
          )}
          {!made && <button type="button" disabled={!!busy || !chosen.length} onClick={() => void make()}>{t('Make images')}</button>}
          {/* Made: always Download (keep them on the device); Share… too where the phone has a share menu. */}
          {made && <button type="button" className={canShareFiles ? 'secondary' : undefined} onClick={download}><span aria-hidden>⬇</span> {t('Download')}</button>}
          {made && canShareFiles && <button type="button" onClick={() => void shareFiles()}>{t('Share…')}</button>}
        </div>
      </div>
      {/* Off-screen stage: the pictures are taken of these, at their real pixel size. */}
      {staging && (
        <div className="social-stage" ref={stage} aria-hidden>
          {chosen.map((p) => (
            <div key={p.id} className={`social-frame desk-${bundle.album.backgroundColor}`} style={{ width: w, height: h }}>
              <div className="social-page" style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height } as CSSProperties}>
                <PageRenderer layout={p.layout} media={media} mode="view" active={false} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
