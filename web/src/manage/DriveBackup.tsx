import { useCallback, useEffect, useState } from 'react';
import { api, type DriveSchedule, type DriveStatus } from '../api';
import { fmtBytes } from './fmtBytes';
import { getLang, useT } from '../i18n';

// "Backup Drive" on /manage: connect Google Drive, schedule, last/next run, Backup ngay, disconnect.
export const DRIVE_GUIDE = 'https://github.com/thatwasmiu/look-back/blob/main/docs/google-drive-backup.md';
const SCHEDULES: [DriveSchedule, string][] = [['weekly', 'Weekly'], ['daily', 'Daily'], ['off', 'Off']];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DriveBackup() {
  const t = useT();
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
      <h2>{t('Drive backup')}</h2>
      {!s ? <p>{t('Loading…')}</p> : !s.configured ? (
        <p>{t('Automatic backup to Google Drive needs a one-time setup on the VPS.')} <a href={DRIVE_GUIDE} target="_blank" rel="noopener">{t('Setup guide')}</a></p>
      ) : !s.connected ? (
        <>
          <p>{t('Every week the app sends a full backup to your Google Drive (only the latest is kept).')}</p>
          <button type="button" className="btn" onClick={connect}>{t('Connect Google Drive')}</button>
        </>
      ) : (
        <>
          <p>{t('Account:')} <b>{s.email}</b></p>
          <div className="mode-switch" role="radiogroup" aria-label={t('Backup schedule')}>
            {SCHEDULES.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={s.schedule === k}
                onClick={() => act(() => api.setDriveSchedule(k))}>{t(label)}</button>
            ))}
          </div>
          <p className={`drive-status drive-${s.status}`}>
            {running ? t('Backing up… {size}', { size: fmtBytes(s.bytesSent ?? 0) })
              : s.status === 'ok' ? t('OK — last one {when}, {size}', { when: when(s.finishedAt), size: fmtBytes(s.lastBytes ?? 0) })
                : s.status === 'idle' ? t('No backup yet.') : s.message}
          </p>
          {s.status === 'incomplete' && <p className="manage-hint">{t('Latest: {when}, {size}', { when: when(s.finishedAt), size: fmtBytes(s.lastBytes ?? 0) })}</p>}
          <p className="manage-hint">{t('Next run: {when} · Drive needs about twice the backup size free while a new one is sent.', { when: when(s.nextRun) })}</p>
          <div className="loc-actions">
            <button type="button" disabled={running} onClick={() => act(() => api.runDriveBackup())}>{t('Back up now')}</button>
            {s.status === 'needs-reconnect' && <button type="button" className="btn" onClick={connect}>{t('Reconnect')}</button>}
            <button type="button" className="danger" onClick={() => {
              if (window.confirm(t('Disconnect Google Drive? The backups already on Drive stay there.'))) act(() => api.disconnectDrive());
            }}>{t('Disconnect')}</button>
            <a href={DRIVE_GUIDE} target="_blank" rel="noopener">{t('Guide')}</a>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
