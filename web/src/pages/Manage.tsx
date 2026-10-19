import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ManageInfo, type ManagedFile, type StorageLocation } from '../api';
import { fmtBytes } from '../manage/fmtBytes';
import { AiSettings } from '../manage/AiSettings';
import { DriveBackup } from '../manage/DriveBackup';
import { Locations } from '../manage/Locations';
import { MoveBar } from '../manage/MoveBar';
import { mediaUrl } from '../mediaUrl';

// Hidden owner page (/manage, linked from nowhere; its own lazy-loaded chunk): storage use, storage locations, every
// media file with clean-up and moving between locations, and a full backup.
export { fmtBytes };

type Filter = 'all' | 'unused' | 'failed';
const isFailed = (f: ManagedFile) => f.status === 'failed';

export default function Manage() {
  const [info, setInfo] = useState<ManageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('unused');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [where, setWhere] = useState<string>('all'); // 'all' | 'local' | a location id

  const load = useCallback(() => Promise.all([api.manage(), api.locations()])
    .then(([i, l]) => { setInfo(i); setLocations(l); setError(null); }, () => setError('Không tải được dữ liệu.')), []);
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

  if (error) return <main className="manage"><p className="error">{error} <button type="button" onClick={() => void load()}>Retry</button></p></main>;
  if (!info) return <main className="manage"><p>Đang tải…</p></main>;

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
      setBusy(`Đang xóa ${++done}/${selected.length}…`);
      await api.deleteMedia(f.id).catch(() => {});
    }
    setBusy(null);
    setPicked(new Set());
    await load();
  };

  return (
    <main className="manage">
      <header className="manage-bar"><Link to="/">← Albums</Link><h1>Quản lý dung lượng</h1></header>

      <section className="manage-card">
        <h2>Storage</h2>
        <div className="disk-bar" role="img" aria-label={`Ổ đĩa đã dùng ${fmtBytes(diskUsed)} / ${fmtBytes(info.disk.total)}`}>
          <span style={{ width: `${(diskUsed / info.disk.total) * 100}%` }} />
        </div>
        <p>Ổ đĩa VPS: đã dùng <b>{fmtBytes(diskUsed)}</b> / {fmtBytes(info.disk.total)} · còn trống <b>{fmtBytes(info.disk.free)}</b></p>
        <p>Ảnh / video / nhạc: <b>{fmtBytes(info.mediaBytes)}</b> ({info.files.length} file)
          {info.mediaBytes > filesBytes + 1024 && <> · trong đó {fmtBytes(info.mediaBytes - filesBytes)} không thuộc file nào</>}
          {' '}· database {fmtBytes(info.dbBytes)}</p>
        <table className="manage-table">
          <thead><tr><th>Album</th><th>File</th><th>Dung lượng</th></tr></thead>
          <tbody>{albums.map((a) => <tr key={a.title + a.files}><td>{a.title}</td><td>{a.files}</td><td>{fmtBytes(a.bytes)}</td></tr>)}</tbody>
        </table>
      </section>

      <Locations locations={locations} disk={info.disk} vpsBytes={filesBytes} vpsFiles={onVps.length} reload={() => void load()} />

      <DriveBackup />

      <AiSettings />

      <section className="manage-card">
        <h2>Backup</h2>
        <p>Tải về một file <code>.tar</code> chứa toàn bộ album, trang và mọi ảnh/video/nhạc gốc (≈ {fmtBytes(info.mediaBytes)}).
          Cất nó ở nơi khác VPS (máy tính, Google Drive…). Cách khôi phục có trong file <code>RESTORE.txt</code> bên trong.</p>
        <a className="btn" href="/api/manage/backup" download>⬇ Download backup</a>
      </section>

      <section className="manage-card">
        <h2>Files</h2>
        <div className="mode-switch" role="radiogroup" aria-label="Filter">
          {([['unused', `Không dùng (${info.files.filter((f) => !f.used).length})`], ['failed', `Lỗi (${info.files.filter(isFailed).length})`], ['all', `Tất cả (${info.files.length})`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => { setFilter(k); setPicked(new Set()); }}>{label}</button>
          ))}
        </div>
        <label className="manage-where">Nơi lưu{' '}
          <select value={where} onChange={(e) => { setWhere(e.target.value); setPicked(new Set()); }}>
            <option value="all">Mọi nơi</option>
            <option value="local">VPS</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <p className="manage-hint">“Không dùng” = không nằm trong trang nào, không phải ảnh bìa hay nhạc nền.</p>
        {moving > 0 && <p role="status">Đang chuyển {moving} file…</p>}
        {shown.length > 0 && (
          <div className="manage-actions">
            <label><input type="checkbox" checked={shown.every((f) => picked.has(f.id))}
              onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((f) => f.id)) : new Set())} /> Chọn tất cả</label>
            <button type="button" className="danger" disabled={!selected.length || !!busy} onClick={() => setConfirm(true)}>
              Xóa {selected.length ? `${selected.length} file (${fmtBytes(selectedBytes)})` : ''}
            </button>
            <MoveBar selected={selected} locations={locations} onMoved={() => { setPicked(new Set()); void load(); }} />
            {busy && <span role="status">{busy}</span>}
          </div>
        )}
        {confirm && (
          <div className="inline-confirm" role="alert">
            Xóa vĩnh viễn {selected.length} file ({fmtBytes(selectedBytes)})? Không hoàn tác được.
            {usedCount > 0 && <> {usedCount} file đang dùng trên trang — khung ảnh đó sẽ trống.</>}
            <button type="button" className="danger" onClick={() => void remove()}>Xóa</button>
            <button type="button" className="secondary" onClick={() => setConfirm(false)}>Hủy</button>
          </div>
        )}
        {shown.length === 0 ? <p className="empty">Không có file nào.</p> : (
          <ul className="manage-files">
            {shown.map((f) => (
              <li key={f.id}>
                <label>
                  <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Chọn ${f.name ?? f.id}`} />
                  <span className="manage-thumb">{f.thumb ? <img src={mediaUrl(f.thumb)} alt="" loading="lazy" /> : <span>{f.kind === 'audio' ? '♪' : f.kind === 'video' ? '▶' : '—'}</span>}</span>
                  <span className="manage-name">
                    <b>{f.name ?? f.id.slice(0, 8)}</b>
                    <small>{f.albumTitle} · {f.kind} · {new Date(f.createdAt).toLocaleDateString('vi-VN')}{isFailed(f) ? ' · lỗi' : ''}{f.used ? '' : ' · không dùng'} · {locName(f.location)}
                      {f.movingTo && <> · đang chuyển → {locName(f.movingTo)}</>}</small>
                    {f.moveError && <small className="error">Chuyển lỗi: {f.moveError}</small>}
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
