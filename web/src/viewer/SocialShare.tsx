import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { toJpeg } from 'html-to-image';
import type { AlbumBundle } from '@scrapbook/shared';
import { useT } from '../i18n';
import { PageRenderer } from '../render/PageRenderer';

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
  const [staging, setStaging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const chosen = pages.filter((p) => picked.has(p.id));
  const name = (i: number) => `${bundle.album.title}-${i + 1}.jpg`;
  const shareLink = viewLink ?? (bundle.album.shareToken ? `${location.origin}/s/${bundle.album.shareToken}` : null);

  const make = async () => {
    setError(null);
    setShots(null);
    setStaging(true);
    await new Promise((ok) => setTimeout(ok, 0)); // let the stage render
    const out: Shot[] = [];
    try {
      const frames = [...stage.current?.querySelectorAll<HTMLElement>('.social-frame') ?? []];
      for (const [i, frame] of frames.entries()) {
        setBusy(t('Making image {n}/{total}…', { n: i + 1, total: frames.length }));
        await settled(frame);
        const { w, h } = FORMATS[format];
        out.push({ name: name(i), url: await toJpeg(frame, { quality: 0.92, pixelRatio: 1, width: w, height: h, cacheBust: false,
          // html-to-image inlines an <img>'s src but not a <picture>'s AVIF <source>, which the picture would then
          // prefer and can't load: drop the sources.
          filter: (n) => n.nodeName !== 'SOURCE' }) });
      }
      setShots(out);
    } catch {
      setError(t("Couldn't make the images. A photo kept in a bucket without CORS can't be drawn — move it to the VPS or turn on CORS."));
    } finally {
      setBusy(null);
      setStaging(false);
    }
  };

  const files = () => (shots ?? []).map((s) => dataUrlToFile(s.url, s.name));
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  const canShareFiles = !!shots?.length && typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: files() });
  const shareFiles = () => nav.share({ files: files(), title: bundle.album.title }).catch(() => {});
  const download = () => {
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
            <button key={f} type="button" role="radio" aria-checked={format === f} disabled={!!busy} onClick={() => { setFormat(f); setShots(null); }}>
              {t(f === 'post' ? 'Post 4:5 (Instagram, Facebook)' : 'Story / TikTok 9:16')}
            </button>
          ))}
        </div>
        <p className="manage-hint">{t('One image per page; Instagram takes up to 20 in a post, TikTok 35. Videos show their cover.')}</p>
        <div className="social-pages">
          {pages.map((p, i) => (
            <label key={p.id}>
              <input type="checkbox" checked={picked.has(p.id)} disabled={!!busy}
                onChange={() => { setShots(null); setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); }} />
              {t('Page {n}', { n: i + 1 })}
            </label>
          ))}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        {busy && <p role="status">{busy}</p>}
        {shots && <div className="social-shots">{shots.map((s) => <img key={s.name} src={s.url} alt={s.name} />)}</div>}
        <div className="modal-actions">
          {shareLink && (
            <a className="btn secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener">
              {t('Share the view link on Facebook')}
            </a>
          )}
          {!shots
            ? <button type="button" disabled={!!busy || !chosen.length} onClick={() => void make()}>{t('Make images')}</button>
            : canShareFiles
              ? <button type="button" onClick={() => void shareFiles()}>{t('Share…')}</button>
              : <button type="button" onClick={download}>{t('Download')}</button>}
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
