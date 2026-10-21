import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ManageInfo, type ManagedFile, type StorageLocation } from '../api';
import { fmtBytes } from '../manage/fmtBytes';
import { AiSettings } from '../manage/AiSettings';
import { DriveBackup } from '../manage/DriveBackup';
import { Locations } from '../manage/Locations';
import { MoveBar } from '../manage/MoveBar';
import { mediaUrl } from '../mediaUrl';
import { getLang, useT } from '../i18n';

// Hidden owner page (/manage, linked from nowhere; its own lazy-loaded chunk): storage use, storage locations, every
// media file with clean-up and moving between locations, and a full backup.
export { fmtBytes };

type Filter = 'all' | 'unused' | 'failed';
const isFailed = (f: ManagedFile) => f.status === 'failed';

export default function Manage() {
  const t = useT();
  const [info, setInfo] = useState<ManageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('unused');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [where, setWhere] = useState<string>('all'); // 'all' | 'local' | a location id

  const load = useCallback(() => Promise.all([api.manage(), api.locations()])
    .then(([i, l]) => { setInfo(i); setLocations(l); setError(null); }, () => setError(t("Couldn't load the data."))), []);
  useEffect(() => { void load(); }, [load]);
  // While files are moving, refresh every 2 s to show progress.
  const moving = info?.files.filter((f) => f.movingTo).length ?? 0;
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [moving, load]);
  const locName = (id: string | null) => (id === null || id === 'local' ? 'VPS' : locations.find((l) => l.id === id)?.name ?? '?');

  const albums = useMemo(() => {
    const m = new Map<string, { title: string; files: number; bytes: number }>();
    for (const f of info?.files ?? []) {
      const a = m.get(f.albumId) ?? { title: f.albumTitle, files: 0, bytes: 0 };
      a.files++; a.bytes += f.bytes;
      m.set(f.albumId, a);
    }
    return [...m.values()].sort((a, b) => b.bytes - a.bytes);
  }, [info]);
  const shown = useMemo(() => (info?.files ?? [])
    .filter((f) => filter === 'all' || (filter === 'failed' ? isFailed(f) : !f.used))
    .filter((f) => where === 'all' || (f.location ?? 'local') === where)
    .sort((a, b) => b.bytes - a.bytes), [info, filter, where]);

  if (error) return <main className="manage"><p className="error">{error} <button type="button" onClick={() => void load()}>{t('Retry')}</button></p></main>;
  if (!info) return <main className="manage"><p>{t('Loading…')}</p></main>;

  const selected = info.files.filter((f) => picked.has(f.id));
  const selectedBytes = selected.reduce((n, f) => n + f.bytes, 0);
  const usedCount = selected.filter((f) => f.used).length;
  const onVps = info.files.filter((f) => !f.location);
  const filesBytes = onVps.reduce((n, f) => n + f.bytes, 0);
  const diskUsed = info.disk.total - info.disk.free;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const remove = async () => {
    setConfirm(false);
    let done = 0;
    for (const f of selected) {
      setBusy(t('Deleting {n}/{total}…', { n: ++done, total: selected.length }));
      await api.deleteMedia(f.id).catch(() => {});
    }
    setBusy(null);
    setPicked(new Set());
    await load();
  };

  return (
    <main className="manage">
      <header className="manage-bar"><Link to="/">← {t('Albums')}</Link><h1>{t('Storage management')}</h1></header>

      <section className="manage-card">
        <h2>{t('Storage')}</h2>
        <div className="disk-bar" role="img" aria-label={t('Disk used {used} / {total}', { used: fmtBytes(diskUsed), total: fmtBytes(info.disk.total) })}>
          <span style={{ width: `${(diskUsed / info.disk.total) * 100}%` }} />
        </div>
        <p>{t('VPS disk: used')} <b>{fmtBytes(diskUsed)}</b> / {fmtBytes(info.disk.total)} · {t('free')} <b>{fmtBytes(info.disk.free)}</b></p>
        <p>{t('Photos / videos / music:')} <b>{fmtBytes(info.mediaBytes)}</b> ({t('{n} files', { n: info.files.length })})
          {info.mediaBytes > filesBytes + 1024 && <> · {t('of which {size} belongs to no file', { size: fmtBytes(info.mediaBytes - filesBytes) })}</>}
          {' '}· database {fmtBytes(info.dbBytes)}</p>
        <table className="manage-table">
          <thead><tr><th>{t('Album')}</th><th>{t('Files')}</th><th>{t('Size')}</th></tr></thead>
          <tbody>{albums.map((a) => <tr key={a.title + a.files}><td>{a.title}</td><td>{a.files}</td><td>{fmtBytes(a.bytes)}</td></tr>)}</tbody>
        </table>
      </section>

      <Locations locations={locations} disk={info.disk} vpsBytes={filesBytes} vpsFiles={onVps.length} reload={() => void load()} />

      <DriveBackup />

      <AiSettings />

      <section className="manage-card">
        <h2>Backup</h2>
        <p>{t('Download one .tar file with every album, page and original photo/video/music (≈ {size}). Keep it somewhere other than the VPS (a computer, Google Drive…). How to restore is in RESTORE.txt inside.', { size: fmtBytes(info.mediaBytes) })}</p>
        <a className="btn" href="/api/manage/backup" download>⬇ {t('Download backup')}</a>
      </section>

      <section className="manage-card">
        <h2>{t('Files')}</h2>
        <div className="mode-switch" role="radiogroup" aria-label={t('Filter')}>
          {([['unused', `${t('Unused')} (${info.files.filter((f) => !f.used).length})`], ['failed', `${t('Failed')} (${info.files.filter(isFailed).length})`], ['all', `${t('All')} (${info.files.length})`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => { setFilter(k); setPicked(new Set()); }}>{label}</button>
          ))}
        </div>
        <label className="manage-where">{t('Location')}{' '}
          <select value={where} onChange={(e) => { setWhere(e.target.value); setPicked(new Set()); }}>
            <option value="all">{t('Everywhere')}</option>
            <option value="local">VPS</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <p className="manage-hint">{t('“Unused” = not on any page, not the cover or the background music.')}</p>
        {moving > 0 && <p role="status">{t('Moving {n} files…', { n: moving })}</p>}
        {shown.length > 0 && (
          <div className="manage-actions">
            <label><input type="checkbox" checked={shown.every((f) => picked.has(f.id))}
              onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((f) => f.id)) : new Set())} /> {t('Select all')}</label>
            <button type="button" className="danger" disabled={!selected.length || !!busy} onClick={() => setConfirm(true)}>
              {t('Delete')} {selected.length ? t('{n} files ({size})', { n: selected.length, size: fmtBytes(selectedBytes) }) : ''}
            </button>
            <MoveBar selected={selected} locations={locations} onMoved={() => { setPicked(new Set()); void load(); }} />
            {busy && <span role="status">{busy}</span>}
          </div>
        )}
        {confirm && (
          <div className="inline-confirm" role="alert">
            {t("Delete {n} files ({size}) for good? This can't be undone.", { n: selected.length, size: fmtBytes(selectedBytes) })}
            {usedCount > 0 && <> {t('{n} of them are on pages — those frames will be empty.', { n: usedCount })}</>}
            <button type="button" className="danger" onClick={() => void remove()}>{t('Delete')}</button>
            <button type="button" className="secondary" onClick={() => setConfirm(false)}>{t('Cancel')}</button>
          </div>
        )}
        {shown.length === 0 ? <p className="empty">{t('No files.')}</p> : (
          <ul className="manage-files">
            {shown.map((f) => (
              <li key={f.id}>
                <label>
                  <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} aria-label={t('Select {name}', { name: f.name ?? f.id })} />
                  <span className="manage-thumb">{f.thumb ? <img src={mediaUrl(f.thumb)} alt="" loading="lazy" /> : <span>{f.kind === 'audio' ? '♪' : f.kind === 'video' ? '▶' : '—'}</span>}</span>
                  <span className="manage-name">
                    <b>{f.name ?? f.id.slice(0, 8)}</b>
                    <small>{f.albumTitle} · {t(f.kind)} · {new Date(f.createdAt).toLocaleDateString(getLang() === 'vi' ? 'vi-VN' : 'en-GB')}{isFailed(f) ? ` · ${t('failed')}` : ''}{f.used ? '' : ` · ${t('unused')}`} · {locName(f.location)}
                      {f.movingTo && <> · {t('moving')} → {locName(f.movingTo)}</>}</small>
                    {f.moveError && <small className="error">{t('Move failed: {error}', { error: f.moveError })}</small>}
                  </span>
                  <span className="manage-size">{fmtBytes(f.bytes)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
