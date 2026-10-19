import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AlbumMode, AlbumSummary, ReadingDirection } from '@scrapbook/shared';
import { api, ApiError } from '../api';
import { exampleAlbum, exampleCover } from '../example/lookBack';
import { albumTemplates } from '../example/albumTemplates';
import { stickers } from '../render/decor';
import { PageRenderer } from '../render/PageRenderer';
import { mediaUrl } from '../mediaUrl';

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
  const [albums, setAlbums] = useState<AlbumSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(''); // '' empty album · 'tpl:<id>' built-in template · 'album:<id>' copy that album's design · 'ai'
  // ✨ AI: a short description; Gemini picks the pages and writes the text (server/src/aiAlbum.ts). Whether a key
  // is set is asked only when the card is picked; null = not known yet.
  const [prompt, setPrompt] = useState('');
  const [aiKey, setAiKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const isAi = from === 'ai';
  const pickFrom = (v: string) => {
    setFrom(v);
    if (v === 'ai' && aiKey === null) api.aiSettings().then((x) => setAiKey(x.hasKey), () => setAiKey(false));
  };
  const navigate = useNavigate();
  // Album mode, fixed at creation. Manga albums also get a reading direction; built-in templates are scrapbook.
  const [mode, setMode] = useState<AlbumMode>('scrapbook');
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const pickMode = (m: AlbumMode) => { setMode(m); setFrom(''); };
  const sameMode = albums?.filter((a) => (a.mode ?? 'scrapbook') === mode) ?? [];

  const [loadError, setLoadError] = useState(false);
  const [createError, setCreateError] = useState('');
  const [confirming, setConfirming] = useState<AlbumSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState<AlbumSummary | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const shareUrl = (t: string) => `${location.origin}/s/${t}`;
  // Copy closes the dialog; a short notice confirms it (clipboard may be blocked, e.g. over plain http).
  const [notice, setNotice] = useState('');
  const copyLink = async (t: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(t));
      setSharing(null);
      setNotice('Đã chép link');
    } catch {
      setNotice('Không chép được — hãy chọn link và chép bằng tay');
    }
    setTimeout(() => setNotice(''), 2500);
  };
  const setToken = (id: string, shareToken: string | null) => {
    setAlbums((cur) => cur?.map((x) => (x.id === id ? { ...x, shareToken } : x)) ?? cur);
    setSharing((s) => (s && s.id === id ? { ...s, shareToken } : s));
  };
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

  const closeCreate = () => { setCreating(false); setTitle(''); setFrom(''); setMode('scrapbook'); setDirection('ltr'); setCreateError(''); setPrompt(''); setAiKey(null); };
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
      const a = await api.createAlbum(title.trim(), source, mode === 'manga' && kind !== 'album' ? { mode: 'manga', readingDirection: direction } : undefined);
      const pageCount = design?.pages.length ?? (kind === 'album' ? albums?.find((x) => x.id === id)?.pageCount ?? 0 : 1);
      setAlbums((cur) => [{ ...a, coverThumb: null, pageCount }, ...(cur ?? [])]); // newest first, like the server's list
      closeCreate();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setCreateError("Không tạo được album");
    }
  }

  async function createWithAi() {
    if (busy || !prompt.trim() || !aiKey) return;
    setBusy(true);
    setCreateError('');
    try {
      const a = await api.createAiAlbum({
        prompt: prompt.trim(), mode, ...(mode === 'manga' ? { readingDirection: direction } : {}), ...(title.trim() ? { title: title.trim() } : {}),
      });
      closeCreate();
      navigate(`/albums/${a.id}/edit`);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setCreateError(err instanceof ApiError && err.status !== 500 ? err.message : 'Không tạo được album');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="albums">
      <header>
        <h1 className="brand"><img className="brand-logo" src="/brand/logo.svg" alt="" />Look Back</h1>
        <span className="header-actions">
          <Link to="/guide" className="guide-link">Hướng dẫn</Link>
          <button onClick={() => setCreating(true)}>New album</button>
        </span>
      </header>
      {loadError && (
        <p role="alert" className="empty">Không tải được danh sách album <button onClick={load}>Retry</button></p>
      )}
      {albums && albums.length === 0 && <p className="empty">Chưa có album nào.</p>}
      <ul className="grid">
        {albums?.map((a, i) => (
          <li key={a.id} className="polaroid" style={{ '--tilt': `${((i % 5) - 2) * 1.2}deg` } as CSSProperties}>
            <Link to={`/albums/${a.id}`}>
              <AlbumCover a={a} />
              <strong title={a.title}>{a.title}</strong>
            </Link>
            <small>
              {a.pageCount} {a.pageCount === 1 ? 'page' : 'pages'} · <Link to={`/albums/${a.id}/edit`}>Edit</Link> ·{' '}
              <button type="button" className="link-btn" aria-label={`Share ${a.title}`} onClick={() => setSharing(a)}>{a.shareToken ? 'Shared' : 'Share'}</button> ·{' '}
              <button type="button" className="link-btn" aria-label={`Delete ${a.title}`} onClick={() => setConfirming(a)}>Delete</button>
            </small>
          </li>
        ))}
        {albums && (
          <li className="polaroid example" style={{ '--tilt': '1.5deg' } as CSSProperties}>
            <Link to={`/albums/${exampleAlbum.album.id}`}>
              <img src={exampleCover} alt="" loading="lazy" />
              <strong>{exampleAlbum.album.title}</strong>
            </Link>
            <small>Example · {exampleAlbum.pages.length} pages · view only</small>
          </li>
        )}
      </ul>
      {creating && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeCreate(); }}>
          <form onSubmit={create} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-album-h">
            <button type="button" className="modal-close" aria-label="Close" onClick={closeCreate}>×</button>
            <h2 id="new-album-h">New album</h2>
            <input aria-label="Album title" placeholder={isAi ? 'Để trống: AI đặt tên' : 'e.g. Tà Xùa 2026'} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            {/* Picker cards: template icon is one of the app's own stickers; an album shows its cover. */}
            <div className="mode-switch" role="radiogroup" aria-label="Mode">
              {(['scrapbook', 'manga'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pickMode(m)}>{m === 'scrapbook' ? 'Scrapbook' : 'Manga'}</button>
              ))}
            </div>
            {mode === 'manga' && (
              <div className="mode-switch" role="radiogroup" aria-label="Reading direction">
                {(['ltr', 'rtl'] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}>{d === 'ltr' ? 'Left → right' : 'Right → left'}</button>
                ))}
              </div>
            )}
            <div className="start-from" role="radiogroup" aria-label="Template">
              <span className="start-label">Template</span>
              <div className="start-grid">
                {[{ value: '', name: 'Empty album', icon: 'sparkle' }, { value: 'ai', name: '✨ AI', icon: 'bubble' }, ...albumTemplates.filter((t) => (t.mode ?? 'scrapbook') === mode).map((t) => ({ value: `tpl:${t.id}`, name: t.name, icon: t.icon }))].map((o) => {
                  const Icon = stickers[o.icon]?.Svg;
                  return (
                    <button key={o.value} type="button" role="radio" aria-checked={from === o.value} className="start-card" onClick={() => pickFrom(o.value)}>
                      <span className="start-icon el-sticker">{Icon && <Icon />}</span>{o.name}
                    </button>
                  );
                })}
              </div>
              {isAi && (
                <div className="ai-prompt">
                  <textarea aria-label="Mô tả album" maxLength={200} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ví dụ: 1 ngày đi làm — đi đường, thang máy, chấm vân tay, họp, về nhà" />
                  <small>{prompt.length}/200</small>
                  {aiKey === false && <p className="manage-hint">Thêm Gemini key trong /manage để dùng AI.</p>}
                </div>
              )}
              {!!sameMode.length && <>
                <span className="start-label">Chép thiết kế của album (không kèm ảnh)</span>
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
              <button type="button" className="secondary" onClick={closeCreate}>Cancel</button>
              <button type="submit" disabled={isAi ? busy || !prompt.trim() || !aiKey : !title.trim()}>{busy ? 'AI đang dựng album…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
      {sharing && (
        <div className="inline-confirm album-confirm share-dialog" role="dialog" aria-label="Share album">
          {sharing.shareToken ? (
            <>
              <span>Ai có link này đều xem được “{sharing.title}” (không sửa được):</span>
              <input readOnly aria-label="Share link" value={shareUrl(sharing.shareToken)} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={() => void copyLink(sharing.shareToken!)}>Copy</button>
              <button type="button" className="danger" disabled={shareBusy} onClick={() => void toggleShare(sharing, false)}>Stop sharing</button>
            </>
          ) : (
            <>
              <span>Chia sẻ “{sharing.title}” bằng link chỉ xem — người nhận không cần mật khẩu.</span>
              <button type="button" disabled={shareBusy} onClick={() => void toggleShare(sharing, true)}>Create share link</button>
            </>
          )}
          <button type="button" className="secondary" onClick={() => setSharing(null)}>Close</button>
        </div>
      )}
      {confirming && (
        <div className="inline-confirm album-confirm" role="alertdialog" aria-label="Delete album">
          Xóa “{confirming.title}” cùng toàn bộ ảnh và video? Không thể hoàn tác.
          <button type="button" className="danger" disabled={deleting} onClick={() => void remove(confirming)}>Delete album</button>
          <button type="button" className="secondary" disabled={deleting} onClick={() => setConfirming(null)}>Cancel</button>
        </div>
      )}
      {notice && <p role="status" className="toast">{notice}</p>}
    </main>
  );
}
