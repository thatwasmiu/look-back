import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ALBUM_MODES, MODES, type AlbumMode, type AlbumSummary, type ReadingDirection } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { exampleAlbum, exampleCover } from '../example/lookBack';
import { albumTemplates } from '../example/albumTemplates';
import { stickers } from '../render/decor';
import { PageRenderer } from '../render/PageRenderer';
import { LangSwitch, getLang, useT } from '../i18n';
import { mediaUrl } from '../mediaUrl';

// Door with an arrow leaving it.
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l4 4-4 4" />
      <path d="M9 12h10" />
    </svg>
  );
}

// The album list's create buttons: one per mode (a new mode needs its line here, the rest comes from MODES).
const MODE_BUTTON: Record<AlbumMode, { label: string; blurb: string }> = {
  scrapbook: { label: 'New scrapbook album', blurb: 'Photos on paper, tape and stickers' },
  manga: { label: 'New manga album', blurb: 'Comic panels, speech bubbles and sound effects' },
  photobooth: { label: 'New photobooth album', blurb: 'Photo strips and booth prints, shot in a row' },
};

// Cover photo if one is set; otherwise the album's first page stands in, drawn small.
function AlbumCover({ a }: { a: AlbumSummary }) {
  if (a.coverThumb) return <img src={mediaUrl(a.coverThumb)} alt="" loading="lazy" />;
  if (!a.coverPage) return <div className="blank" />;
  return (
    <div className="blank cover-page">
      <PageRenderer layout={a.coverPage.layout} media={new Map(a.coverPage.media.map((m) => [m.id, m]))} mode="view" active={false} />
    </div>
  );
}

export default function AlbumList() {
  const t = useT();
  const when = (iso: string) => new Date(iso).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(''); // '' empty album · 'tpl:<id>' built-in template · 'album:<id>' copy that album's design · 'ai'
  // ✨ AI: a short description; Gemini picks the pages and writes the text (server/src/aiAlbum.ts). Whether a key
  // is set is asked only when the card is picked; null = not known yet.
  const [prompt, setPrompt] = useState('');
  const [aiKey, setAiKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const isAi = from === 'ai';
  const pickFrom = (v: string) => {
    setFrom(v);
    if (v === 'ai' && aiKey === null) api.aiSettings().then((x) => setAiKey(x.hasKey), () => setAiKey(false));
  };
  const navigate = useNavigate();
  // Album mode, fixed at creation. Manga albums also get a reading direction. Photobooth albums start on a Booth
  // page and their editor offers only Booth pages; they have their own templates and no AI.
  const [mode, setMode] = useState<AlbumMode>('scrapbook');
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const pickMode = (m: AlbumMode) => { setMode(m); setFrom(''); };
  const info = MODES[mode];
  const sameMode = albums?.filter((a) => (a.mode ?? 'scrapbook') === mode) ?? [];

  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState('');
  const [confirming, setConfirming] = useState<AlbumSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState<AlbumSummary | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const shareUrl = (t: string) => `${location.origin}/s/${t}`;
  const editUrl = (t: string) => `${location.origin}/e/${t}`;
  const [editHours, setEditHours] = useState('8');
  // Copy closes the dialog; a short notice confirms it (clipboard may be blocked, e.g. over plain http).
  const [notice, setNotice] = useState('');
  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setSharing(null);
      setNotice(t('Link copied'));
    } catch {
      setNotice(t("Couldn't copy — select the link and copy it by hand"));
    }
    setTimeout(() => setNotice(''), 2500);
  };
  const setToken = (id: string, shareToken: string | null) => {
    setAlbums((cur) => cur?.map((x) => (x.id === id ? { ...x, shareToken } : x)) ?? cur);
    setSharing((s) => (s && s.id === id ? { ...s, shareToken } : s));
  };
  // Edit link: the holder may only put photos into the existing frames and change text, for the hours chosen.
  const setEdit = (id: string, editToken: string | null, editExpiresAt: string | null) => {
    setAlbums((cur) => cur?.map((x) => (x.id === id ? { ...x, editToken, editExpiresAt } : x)) ?? cur);
    setSharing((s) => (s && s.id === id ? { ...s, editToken, editExpiresAt } : s));
  };
  async function editLink(a: AlbumSummary, hours: number | null) {
    setShareBusy(true);
    try {
      if (hours) { const r = await api.createEditLink(a.id, hours); setEdit(a.id, r.editToken, r.expiresAt); }
      else { await api.revokeEditLink(a.id); setEdit(a.id, null, null); }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setLoadError(true);
    } finally {
      setShareBusy(false);
    }
  }

  async function toggleShare(a: AlbumSummary, on: boolean) {
    setShareBusy(true);
    try {
      if (on) setToken(a.id, (await api.shareAlbum(a.id)).shareToken);
      else { await api.unshareAlbum(a.id); setToken(a.id, null); }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setLoadError(true);
    } finally {
      setShareBusy(false);
    }
  }

  // Permanent (pages, photos and videos go too), so it always asks first.
  async function remove(a: AlbumSummary) {
    setDeleting(true);
    try {
      await api.deleteAlbum(a.id);
      setAlbums((cur) => cur?.filter((x) => x.id !== a.id) ?? cur);
      setConfirming(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setLoadError(true);
    } finally {
      setDeleting(false);
    }
  }

  const load = () => {
    setLoadError(false);
    api.listAlbums().then(setAlbums, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) setLoadError(true); // 401: redirect in progress
    });
  };
  useEffect(load, []);

  // Not while the AI is generating: the album would still appear (and open) after the dialog was gone.
  const closeCreate = () => { if (busyRef.current) return; setCreating(false); setTitle(''); setFrom(''); setMode('scrapbook'); setDirection('ltr'); setCreateError(''); setPrompt(''); setAiKey(null); };
  useEffect(() => {
    if (!creating) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCreate(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [creating]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (isAi) return void createWithAi();
    if (!title.trim()) return;
    try {
      const [kind, id] = from.split(':');
      const design = kind === 'tpl' ? albumTemplates.find((t) => t.id === id)?.design(direction) : undefined;
      const source = design ? { design } : kind === 'album' ? { fromAlbumId: id } : undefined;
      // A copied album keeps its own mode and direction (server side); a new manga album sends them.
      const a = await api.createAlbum(title.trim(), source, mode !== 'scrapbook' && kind !== 'album'
        ? { mode, ...(info.readingDirection ? { readingDirection: direction } : {}) } : undefined);
      const pageCount = design?.pages.length ?? (kind === 'album' ? albums?.find((x) => x.id === id)?.pageCount ?? 0 : 1);
      setAlbums((cur) => [{ ...a, coverThumb: null, pageCount }, ...(cur ?? [])]); // newest first, like the server's list
      closeCreate();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setCreateError(t("Couldn't create the album"));
    }
  }

  async function createWithAi() {
    if (busy || !prompt.trim() || !aiKey) return;
    setBusy(true);
    busyRef.current = true;
    setCreateError('');
    try {
      const a = await api.createAiAlbum({
        prompt: prompt.trim(), mode, ...(info.readingDirection ? { readingDirection: direction } : {}), ...(title.trim() ? { title: title.trim() } : {}),
      });
      busyRef.current = false;
      closeCreate();
      navigate(`/albums/${a.id}/edit`);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setCreateError(err instanceof ApiError && err.status !== 500 ? err.message : t("Couldn't create the album"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="albums">
      <header>
        <h1 className="brand"><img className="brand-logo" src="/brand/logo.svg" alt="" />Look Back</h1>
        <span className="header-actions">
          <Link to="/guide" className="guide-link">{t('Guide')}</Link>
          <LangSwitch />
          {/* Full reload to /login: no album data stays in memory (offline caches are cleared by api.logout). */}
          <button type="button" className="logout-btn" aria-label={t('Log out')} title={t('Log out')}
            onClick={() => void api.logout().catch(() => {}).finally(() => location.assign('/login'))}><LogoutIcon /></button>
        </span>
      </header>
      {/* One button per album mode on its own row, so every kind is visible up front; the dialog opens on that mode. */}
      <div className="new-album-row" style={{ '--modes': ALBUM_MODES.length } as CSSProperties}>
        {ALBUM_MODES.map((m) => (
          <button key={m} type="button" aria-label={t(MODE_BUTTON[m].label)} onClick={() => { pickMode(m); setCreating(true); }}>
            <span className="new-album-name"><span className="plus" aria-hidden>＋</span> {MODES[m].name}</span>
            <small>{t(MODE_BUTTON[m].blurb)}</small>
          </button>
        ))}
      </div>
      {loadError && (
        <p role="alert" className="empty">{t("Couldn't load the album list")} <button onClick={load}>{t('Retry')}</button></p>
      )}
      {albums && albums.length === 0 && <p className="empty">{t('No albums yet.')}</p>}
      <ul className="grid">
        {albums?.map((a, i) => (
          <li key={a.id} className="polaroid" style={{ '--tilt': `${((i % 5) - 2) * 1.2}deg` } as CSSProperties}>
            <Link to={`/albums/${a.id}`}>
              <AlbumCover a={a} />
              <strong title={a.title}>{a.title}</strong>
            </Link>
            <small>
              {t(a.pageCount === 1 ? '{n} page' : '{n} pages', { n: a.pageCount })} · <Link to={`/albums/${a.id}/edit`}>{t('Edit')}</Link> ·{' '}
              <button type="button" className="link-btn" aria-label={t('Share {title}', { title: a.title })} onClick={() => setSharing(a)}>{t(a.shareToken ? 'Shared' : 'Share')}</button> ·{' '}
              <button type="button" className="link-btn" aria-label={t('Delete {title}', { title: a.title })} onClick={() => setConfirming(a)}>{t('Delete')}</button>
            </small>
          </li>
        ))}
        {albums && (
          <li className="polaroid example" style={{ '--tilt': '1.5deg' } as CSSProperties}>
            <Link to={`/albums/${exampleAlbum.album.id}`}>
              <img src={exampleCover} alt="" loading="lazy" />
              <strong>{exampleAlbum.album.title}</strong>
            </Link>
            <small>{t('Example · {n} pages · view only', { n: exampleAlbum.pages.length })}</small>
          </li>
        )}
      </ul>
      {creating && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeCreate(); }}>
          <form onSubmit={create} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-album-h">
            <button type="button" className="modal-close" aria-label={t('Close')} onClick={closeCreate}>×</button>
            <h2 id="new-album-h">{t('New album')}</h2>
            <input aria-label={t('Album title')} placeholder={isAi ? t('Leave empty: the AI names it') : t('e.g. Tà Xùa 2026')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            {/* Picker cards: template icon is one of the app's own stickers; an album shows its cover. */}
            <div className="mode-switch" role="radiogroup" aria-label={t('Mode')}>
              {ALBUM_MODES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pickMode(m)}>{MODES[m].name}</button>
              ))}
            </div>
            {info.readingDirection && (
              <div className="mode-switch" role="radiogroup" aria-label={t('Reading direction')}>
                {(['ltr', 'rtl'] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}>{t(d === 'ltr' ? 'Left → right' : 'Right → left')}</button>
                ))}
              </div>
            )}
            <div className="start-from" role="radiogroup" aria-label={t('Template')}>
              <span className="start-label">{t('Template')}</span>
              <div className="start-grid">
                {[{ value: '', name: 'Empty album', icon: 'sparkle' }, ...(info.ai ? [{ value: 'ai', name: '✨ AI', icon: 'bubble' }] : []), ...albumTemplates.filter((t) => (t.mode ?? 'scrapbook') === mode).map((t) => ({ value: `tpl:${t.id}`, name: t.name, icon: t.icon }))].map((o) => {
                  const Icon = stickers[o.icon]?.Svg;
                  return (
                    <button key={o.value} type="button" role="radio" aria-checked={from === o.value} className="start-card" onClick={() => pickFrom(o.value)}>
                      <span className="start-icon el-sticker">{Icon && <Icon />}</span>{t(o.name)}
                    </button>
                  );
                })}
              </div>
              {isAi && (
                <div className="ai-prompt">
                  <textarea aria-label={t('Album description')} maxLength={200} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t('e.g. A workday — commute, lift, clock in, meeting, home')} />
                  <small>{prompt.length}/200</small>
                  {aiKey === false && <p className="manage-hint">{t('Add a Gemini key in /manage to use AI.')}</p>}
                </div>
              )}
              {!!sameMode.length && <>
                <span className="start-label">{t("Copy an album's design (without photos)")}</span>
                <div className="start-grid">
                  {sameMode.map((a) => (
                    <button key={a.id} type="button" role="radio" aria-checked={from === `album:${a.id}`} className="start-card" onClick={() => setFrom(`album:${a.id}`)}>
                      <span className="start-icon"><AlbumCover a={a} /></span>{a.title}
                    </button>
                  ))}
                </div>
              </>}
            </div>
            {createError && <p role="alert" className="error">{createError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeCreate}>{t('Cancel')}</button>
              <button type="submit" disabled={isAi ? busy || !prompt.trim() || !aiKey : !title.trim()}>{busy ? t('AI is building the album…') : t('Create')}</button>
            </div>
          </form>
        </div>
      )}
      {sharing && (
        <div className="inline-confirm album-confirm share-dialog" role="dialog" aria-label={t('Share album')}>
          {sharing.shareToken ? (
            <>
              <span>{t('Anyone with this link can view “{title}” (not edit it):', { title: sharing.title })}</span>
              <input readOnly aria-label={t('Share link')} value={shareUrl(sharing.shareToken)} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={() => void copyLink(shareUrl(sharing.shareToken!))}>{t('Copy')}</button>
              <button type="button" className="danger" disabled={shareBusy} onClick={() => void toggleShare(sharing, false)}>{t('Stop sharing')}</button>
            </>
          ) : (
            <>
              <span>{t('Share “{title}” with a view-only link — no password needed.', { title: sharing.title })}</span>
              <button type="button" disabled={shareBusy} onClick={() => void toggleShare(sharing, true)}>{t('Create share link')}</button>
            </>
          )}
          <div className="edit-link">
            {sharing.editToken && sharing.editExpiresAt && new Date(sharing.editExpiresAt) > new Date() ? (
              <>
                <span>{t('Link for others to edit (not pages or frames), until {when}:', { when: when(sharing.editExpiresAt) })}</span>
                <input readOnly aria-label={t('Edit link')} value={editUrl(sharing.editToken)} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={() => void copyLink(editUrl(sharing.editToken!))}>{t('Copy')}</button>
                <button type="button" className="danger" aria-label={t('Revoke edit link')} disabled={shareBusy} onClick={() => void editLink(sharing, null)}>{t('Revoke')}</button>
              </>
            ) : <span>{t('A link for others to edit: they fill the frames and change text, stickers and more — not pages or frames.')}</span>}
            <label className="edit-hours">{t('Hours')}
              <input type="number" min={1} max={168} step={1} value={editHours} onChange={(e) => setEditHours(e.target.value)} />
            </label>
            <button type="button" disabled={shareBusy || !(Number(editHours) >= 1 && Number(editHours) <= 168 && Number.isInteger(Number(editHours)))}
              onClick={() => void editLink(sharing, Number(editHours))}>{sharing.editToken && sharing.editExpiresAt && new Date(sharing.editExpiresAt) > new Date() ? t('Extend') : t('Create edit link')}</button>
          </div>
          <button type="button" className="secondary" onClick={() => setSharing(null)}>{t('Close')}</button>
        </div>
      )}
      {confirming && (
        <div className="inline-confirm album-confirm" role="alertdialog" aria-label={t('Delete album')}>
          {t('Delete “{title}” with all its photos and videos? This can\'t be undone.', { title: confirming.title })}
          <button type="button" className="danger" disabled={deleting} onClick={() => void remove(confirming)}>{t('Delete album')}</button>
          <button type="button" className="secondary" disabled={deleting} onClick={() => setConfirming(null)}>{t('Cancel')}</button>
        </div>
      )}
      {notice && <p role="status" className="toast">{notice}</p>}
    </main>
  );
}
