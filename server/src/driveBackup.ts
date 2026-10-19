import type pg from 'pg';
import { backupFileName, buildBackup } from './backup.js';
import type { Config } from './config.js';
import { accessToken, deleteFile, DriveError, ensureFolder, listFolder, uploadFile } from './drive.js';
import { STALE_MS } from './driveRoutes.js';
import { decryptSecret } from './secrets.js';

// The drive-backup job: upload a full backup to the owner's Drive, then keep only what's needed. The last COMPLETE
// backup is deleted only after a newer complete one is uploaded and its size verified; an incomplete run (files a
// broken bucket couldn't give) is kept beside it, replacing an older incomplete one.
const BACKUP_FILE = /^lookback-backup-.*\.tar$/;

export async function runDriveBackup(pool: pg.Pool, config: Config): Promise<void> {
  const r = (await pool.query('select * from drive_backup where id = 1')).rows[0];
  if (!r?.refresh_enc) return;
  if (r.status === 'running' && Date.now() - new Date(r.started_at).getTime() < STALE_MS) return; // another run
  await pool.query(`update drive_backup set status = 'running', started_at = now(), finished_at = null, bytes_sent = 0, message = null where id = 1`);
  const finish = (status: string, message: string | null, extra = '', params: unknown[] = []) =>
    pool.query(`update drive_backup set status = $1, message = $2, finished_at = now()${extra} where id = 1`, [status, message, ...params]);

  let tok: string;
  try {
    tok = await accessToken(config, decryptSecret(r.refresh_enc, config.sessionSecret));
  } catch (e) {
    if (e instanceof DriveError && e.reason === 'invalid_grant') await finish('needs-reconnect', 'Quyền truy cập Drive đã hết — bấm Kết nối lại.');
    else await finish('error', e instanceof Error ? e.message : String(e));
    return;
  }

  let newId: string | null = null;
  let sent = 0;
  const backup = buildBackup(pool, config);
  try {
    const folder = await ensureFolder(config, tok, r.folder_id);
    await pool.query('update drive_backup set folder_id = $1 where id = 1', [folder]);
    let saved = 0;
    const up = await uploadFile(config, tok, folder, backupFileName(), backup.stream, (b) => {
      sent = b;
      if (Date.now() - saved > 5000) { saved = Date.now(); void pool.query('update drive_backup set bytes_sent = $1 where id = 1', [b]); }
    });
    newId = up.id;
    const { bytes, missing } = await backup.done;
    if (up.size !== bytes) throw new Error('Bản backup trên Drive không khớp kích thước.');

    const others = (await listFolder(config, tok, folder)).filter((f) => f.id !== up.id && BACKUP_FILE.test(f.name));
    if (!missing.length) {
      for (const f of others) await deleteFile(config, tok, f.id);
      await finish('ok', null, ', bytes_sent = $3, last_bytes = $3, last_file_id = $4, complete_file_id = $4', [bytes, up.id]);
    } else {
      for (const f of others) if (f.id !== r.complete_file_id) await deleteFile(config, tok, f.id);
      await finish('incomplete', `Thiếu ${missing.length} file (nơi lưu đang lỗi) — vẫn giữ bản đầy đủ trước đó.`,
        ', bytes_sent = $3, last_bytes = $3, last_file_id = $4', [bytes, up.id]);
    }
  } catch (e) {
    backup.stream.destroy();
    if (newId) await deleteFile(config, tok, newId).catch(() => {});
    const quota = e instanceof DriveError && e.reason === 'storageQuotaExceeded';
    const need = Math.max(sent, Number(r.last_bytes ?? 0)) / 2 ** 30;
    await finish('error', quota ? `Drive không đủ chỗ: cần khoảng ${need.toFixed(1)} GB trống.` : (e instanceof Error ? e.message : String(e)));
  }
}
