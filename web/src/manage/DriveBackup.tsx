import { useCallback, useEffect, useState } from 'react';
import { api, type DriveSchedule, type DriveStatus } from '../api';
import { fmtBytes } from './fmtBytes';

// "Backup Drive" on /manage: connect Google Drive, schedule, last/next run, Backup ngay, disconnect.
export const DRIVE_GUIDE = 'https://github.com/thatwasmiu/look-back/blob/main/docs/google-drive-backup.md';
const SCHEDULES: [DriveSchedule, string][] = [['weekly', 'Hằng tuần'], ['daily', 'Hằng ngày'], ['off', 'Tắt']];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DriveBackup() {
  const [s, setS] = useState<DriveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.driveStatus().then(setS, (e) => setError(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  const running = s?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [running, load]);
  const connect = () => { window.location.href = '/api/manage/drive/connect'; };
  const act = (f: () => Promise<unknown>) => { setError(null); f().then(load, (e) => setError(errText(e))); };

  return (
    <section className="manage-card" id="drive">
      <h2>Backup Drive</h2>
      {!s ? <p>Đang tải…</p> : !s.configured ? (
        <p>Tự động backup lên Google Drive cần cài đặt một lần trên VPS. <a href={DRIVE_GUIDE} target="_blank" rel="noopener">Hướng dẫn cài đặt</a></p>
      ) : !s.connected ? (
        <>
          <p>Mỗi tuần app tự đẩy một bản backup đầy đủ lên Google Drive của bạn (chỉ giữ bản mới nhất).</p>
          <button type="button" className="btn" onClick={connect}>Kết nối Google Drive</button>
        </>
      ) : (
        <>
          <p>Tài khoản: <b>{s.email}</b></p>
          <div className="mode-switch" role="radiogroup" aria-label="Lịch backup">
            {SCHEDULES.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={s.schedule === k}
                onClick={() => act(() => api.setDriveSchedule(k))}>{label}</button>
            ))}
          </div>
          <p className={`drive-status drive-${s.status}`}>
            {running ? `Đang backup… ${fmtBytes(s.bytesSent ?? 0)}`
              : s.status === 'ok' ? `OK — lần gần nhất ${when(s.finishedAt)}, ${fmtBytes(s.lastBytes ?? 0)}`
                : s.status === 'idle' ? 'Chưa backup lần nào.' : s.message}
          </p>
          {s.status === 'incomplete' && <p className="manage-hint">Bản mới nhất: {when(s.finishedAt)}, {fmtBytes(s.lastBytes ?? 0)}</p>}
          <p className="manage-hint">Lần chạy kế tiếp: {when(s.nextRun)} · Drive cần trống khoảng gấp đôi dung lượng backup khi đang đẩy bản mới.</p>
          <div className="loc-actions">
            <button type="button" disabled={running} onClick={() => act(() => api.runDriveBackup())}>Backup ngay</button>
            {s.status === 'needs-reconnect' && <button type="button" className="btn" onClick={connect}>Kết nối lại</button>}
            <button type="button" className="danger" onClick={() => {
              if (window.confirm('Ngắt kết nối Google Drive? Các bản backup trên Drive vẫn được giữ.')) act(() => api.disconnectDrive());
            }}>Ngắt kết nối</button>
            <a href={DRIVE_GUIDE} target="_blank" rel="noopener">Hướng dẫn</a>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
