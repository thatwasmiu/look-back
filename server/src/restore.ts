import { spawn } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { createPool } from './db.js';
import { BACKUP_TABLES } from './manage.js';
import { migrate } from './migrate.js';

// Restores a backup made by GET /api/manage/backup: REPLACES every album, page and media row and the whole media
// folder with the backup's. Usage (in the api container): node server/dist/restore.js /backup.tar
export async function restoreBackup(pool: pg.Pool, mediaDir: string, tarFile: string): Promise<{ albums: number; media: number }> {
  const tmp = await mkdtemp(join(tmpdir(), 'restore-'));
  try {
    await run('tar', ['-x', '-f', tarFile, '-C', tmp]);
    const dump = JSON.parse(await readFile(join(tmp, 'db.json'), 'utf8')) as { tables: Record<string, Record<string, unknown>[]> };
    await migrate(pool); // the backup may come from an older version: bring the schema up first
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('truncate albums, pages, media, pending_deletes, storage_locations cascade');
      for (const t of BACKUP_TABLES) {
        for (const row of dump.tables[t] ?? []) {
          // Every file comes back onto the VPS; bucket keys were never in the backup.
          if (t === 'media') Object.assign(row, { storage_id: null, moving_to: null, move_error: null });
          if (t === 'storage_locations') Object.assign(row, { secret_enc: null, check_status: 'needs-keys', check_message: null });
          const cols = Object.keys(row);
          // jsonb columns (layout, variants) arrive as objects: pass them as JSON text.
          const vals = cols.map((k) => (row[k] !== null && typeof row[k] === 'object' && !(row[k] instanceof Date) ? JSON.stringify(row[k]) : row[k]));
          await c.query(`insert into ${t} (${cols.map((k) => `"${k}"`).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
        }
      }
      await c.query('commit');
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    // Files after the rows are in: replace the media folder's contents (the folder itself may be a mount).
    for (const e of await readdir(mediaDir)) await rm(join(mediaDir, e), { recursive: true, force: true });
    await cp(join(tmp, 'media'), mediaDir, { recursive: true }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    return { albums: dump.tables.albums?.length ?? 0, media: dump.tables.media?.length ?? 0 };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const run = (cmd: string, args: string[]) => new Promise<void>((ok, fail) => {
  const p = spawn(cmd, args, { stdio: 'inherit' });
  p.on('error', fail);
  p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited with ${code}`))));
});

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  const { DATABASE_URL, MEDIA_DIR } = process.env;
  if (!file || !DATABASE_URL || !MEDIA_DIR) {
    console.error('usage: node server/dist/restore.js <backup.tar>   (needs DATABASE_URL and MEDIA_DIR)');
    process.exit(2);
  }
  const pool = createPool(DATABASE_URL);
  restoreBackup(pool, MEDIA_DIR, file)
    .then((r) => console.log(`restored ${r.albums} albums, ${r.media} media files`))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => pool.end());
}
