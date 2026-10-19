import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type pg from 'pg';
import tar from 'tar-stream';
import type { Config } from './config.js';
import { loadBucket } from './locations.js';
import { listLocalFiles } from './mediaFiles.js';
import { bucketClient } from './objectStore.js';
import { absPath } from './storage.js';

// The full backup: one .tar made on the fly (nothing stored on the server) — db.json (all rows, bucket secrets
// blanked), RESTORE.txt, every file on the VPS disk, then every file that lives in a bucket (read through the VPS),
// and MISSING.txt for files a broken bucket couldn't give. Used by the download on /manage and the Drive backup job.
// ponytail: a bucket that fails mid-file truncates the stream; the caller makes a new backup.

// What a backup holds besides the media folder: every row of the app's own tables.
export const BACKUP_TABLES = ['storage_locations', 'albums', 'pages', 'media'] as const;

export const backupFileName = (d = new Date()) => `lookback-backup-${d.toISOString().slice(0, 10)}.tar`;

export function buildBackup(pool: pg.Pool, config: Config): { stream: Readable; done: Promise<{ bytes: number; missing: string[] }> } {
  const pack = tar.pack();
  const out = new PassThrough();
  let bytes = 0;
  const missing: string[] = [];
  out.on('data', (c: Buffer) => { bytes += c.length; });
  const done = new Promise<{ bytes: number; missing: string[] }>((resolve, reject) => {
    out.on('end', () => resolve({ bytes, missing }));
    out.on('error', reject);
  });
  done.catch(() => {}); // a caller that only reads the stream must not see an unhandled rejection
  pack.pipe(out);

  const add = (name: string, data: string) => new Promise<void>((ok, fail) => { pack.entry({ name }, data, (e) => (e ? fail(e) : ok())); });
  const addStream = (name: string, size: number, body: Readable) => pipeline(body, pack.entry({ name, size }));
  void (async () => {
    const dump: Record<string, Record<string, unknown>[]> = {};
    for (const t of BACKUP_TABLES) dump[t] = (await pool.query(`select * from ${t}`)).rows;
    for (const l of dump.storage_locations) l.secret_enc = null;
    const migrations = (await pool.query('select name from schema_migrations order by name')).rows.map((r) => r.name);
    const remote = (await pool.query('select m.id, m.storage_id, l.name from media m join storage_locations l on l.id = m.storage_id')).rows;

    await add('db.json', JSON.stringify({ version: 2, createdAt: new Date().toISOString(), migrations, tables: dump }));
    await add('RESTORE.txt', RESTORE_HELP);
    for (const id of await readdir(config.mediaDir).catch(() => [])) {
      for (const f of await listLocalFiles(config.mediaDir, id)) await addStream(`media/${f.key}`, f.size, createReadStream(absPath(config.mediaDir, f.key)));
    }
    for (const m of remote) {
      try {
        const bucket = await loadBucket(pool, config.sessionSecret, m.storage_id);
        if (!bucket) throw new Error('cần nhập lại khoá');
        const c = bucketClient(bucket);
        for (const o of await c.list(`${m.id}/`)) {
          const res = await c.get(o.key);
          await addStream(`media/${o.key}`, o.size, Readable.fromWeb(res.body as import('node:stream/web').ReadableStream));
        }
      } catch (e) {
        missing.push(`${m.id}\t${m.name}\t${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (missing.length) await add('MISSING.txt', `Không lấy được các file này từ nơi lưu của chúng:\n${missing.join('\n')}\n`);
    pack.finalize();
  })().catch((e) => { pack.destroy(e); out.destroy(e); });
  return { stream: out, done };
}

const RESTORE_HELP = `Look Back backup
----------------
db.json      albums, pages, media rows and storage locations (without their secret keys)
media/       every photo / video / music file (originals and processed versions), including files kept in buckets
MISSING.txt  only if some bucket files could not be read when this backup was made

Cần đủ chỗ trống trên VPS cho toàn bộ file backup. Sau khi khôi phục, mọi file nằm trên VPS; nhập lại khoá cho từng
nơi lưu trên /manage.

Restore on the server (REPLACES all current albums and media with this backup):
  cd /root/project/lookback
  docker compose -f compose.yml run --rm -v "$PWD/lookback-backup.tar:/backup.tar:ro" api node server/dist/restore.js /backup.tar
`;
