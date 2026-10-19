import { createReadStream } from 'node:fs';
import { readdir, statfs } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type PgBoss from 'pg-boss';
import type pg from 'pg';
import tar from 'tar-stream';
import type { Config } from './config.js';
import { loadBucket } from './locations.js';
import { dirBytes, listLocalFiles } from './mediaFiles.js';
import { bucketClient } from './objectStore.js';
import { JOB_MOVE_MEDIA, type MoveMediaJob } from './queue.js';
import { absPath } from './storage.js';

// Owner tools behind the hidden /manage page (the session guard covers every /api route here):
// storage use, every media file with its size and whether anything uses it, and a full backup download.

// Media a page frame, an album cover or an album's music points at.
const USED_SQL = `
  select e->>'mediaId' as id from pages, jsonb_array_elements(layout->'elements') e
    where e->>'type' = 'frame' and e->>'mediaId' is not null
  union select cover_media_id::text from albums where cover_media_id is not null
  union select music_media_id::text from albums where music_media_id is not null`;

// What a backup holds besides the media folder: every row of the app's own tables.
export const BACKUP_TABLES = ['storage_locations', 'albums', 'pages', 'media'] as const;

export function registerManage(app: FastifyInstance, pool: pg.Pool, config: Config, boss: PgBoss): void {
  app.get('/api/manage', async () => {
    const [files, used, db, fs, all] = await Promise.all([
      pool.query(`select m.id, m.album_id, a.title as album_title, m.kind, m.status, m.original_name, m.variants, m.error, m.created_at,
        m.storage_id, m.bytes, m.moving_to, m.move_error
        from media m join albums a on a.id = m.album_id order by m.created_at desc`),
      pool.query(USED_SQL),
      pool.query('select pg_database_size(current_database())::bigint as bytes'),
      statfs(config.mediaDir),
      dirBytes(config.mediaDir),
    ]);
    const usedIds = new Set(used.rows.map((r) => r.id));
    // Local files are measured on disk; a bucket file's size was recorded when it moved there.
    const sizes = await Promise.all(files.rows.map((r) => (r.storage_id ? Number(r.bytes ?? 0) : dirBytes(join(config.mediaDir, r.id)))));
    return {
      disk: { total: fs.blocks * fs.bsize, free: fs.bavail * fs.bsize },
      mediaBytes: all,
      dbBytes: Number(db.rows[0].bytes),
      files: files.rows.map((r, i) => ({
        id: r.id, albumId: r.album_id, albumTitle: r.album_title, kind: r.kind, status: r.status,
        name: r.original_name, error: r.error, createdAt: r.created_at, bytes: sizes[i], used: usedIds.has(r.id),
        thumb: r.variants?.thumb ?? r.variants?.poster ?? null,
        location: r.storage_id, movingTo: r.moving_to, moveError: r.move_error,
      })),
    };
  });

  // Queue moves of the selected media to `to` ('local' or a location id). The destination must be usable and, if it
  // has a size cap, have room for all of them.
  app.post<{ Body: { mediaIds: string[]; to: string } }>('/api/manage/move', {
    schema: { body: { type: 'object', required: ['mediaIds', 'to'], additionalProperties: false, properties: {
      mediaIds: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string', format: 'uuid' } }, to: { type: 'string' } } } },
  }, async (req, reply) => {
    const to = req.body.to === 'local' ? null : req.body.to;
    if (to) {
      const loc = (await pool.query(`select l.*, (select coalesce(sum(bytes), 0)::bigint from media m where m.storage_id = l.id) as used
        from storage_locations l where l.id::text = $1`, [to])).rows[0];
      if (!loc || loc.check_status !== 'ok' || !loc.secret_enc) return reply.code(400).send({ error: 'Nơi lưu này đang không dùng được.' });
      if (loc.cap_bytes !== null) {
        const sel = (await pool.query('select id, storage_id, bytes from media where id = any($1) and storage_id is distinct from $2', [req.body.mediaIds, to])).rows;
        const need = (await Promise.all(sel.map((r) => (r.storage_id ? Number(r.bytes ?? 0) : dirBytes(join(config.mediaDir, r.id)))))).reduce((n, b) => n + b, 0);
        if (Number(loc.used) + need > Number(loc.cap_bytes)) return reply.code(409).send({ error: `Vượt giới hạn dung lượng của ${loc.name}` });
      }
    }
    const { rows } = await pool.query(`update media set moving_to = $2, move_error = null
      where id = any($1) and storage_id is distinct from $3 and moving_to is null returning id`, [req.body.mediaIds, req.body.to, to]);
    for (const r of rows) await boss.send(JOB_MOVE_MEDIA, { mediaId: r.id, to } satisfies MoveMediaJob);
    return { queued: rows.length };
  });

  // One .tar streamed as it is made (nothing stored on the server): db.json (all rows, bucket secrets blanked),
  // RESTORE.txt, every file on the VPS disk, then every file that lives in a bucket (read through the VPS) — so the
  // backup stays complete wherever files are. Files a broken bucket can't give are listed in MISSING.txt.
  // ponytail: a bucket that fails mid-file truncates the download; the owner downloads again.
  app.get('/api/manage/backup', async (_req, reply) => {
    const dump: Record<string, Record<string, unknown>[]> = {};
    for (const t of BACKUP_TABLES) dump[t] = (await pool.query(`select * from ${t}`)).rows;
    for (const l of dump.storage_locations) l.secret_enc = null;
    const migrations = (await pool.query('select name from schema_migrations order by name')).rows.map((r) => r.name);
    const remote = (await pool.query(`select m.id, m.storage_id, l.name from media m join storage_locations l on l.id = m.storage_id`)).rows;

    const pack = tar.pack();
    const add = (name: string, data: string) => new Promise<void>((ok, fail) => { pack.entry({ name }, data, (e) => (e ? fail(e) : ok())); });
    const addStream = (name: string, size: number, body: Readable) => pipeline(body, pack.entry({ name, size }));
    void (async () => {
      await add('db.json', JSON.stringify({ version: 2, createdAt: new Date().toISOString(), migrations, tables: dump }));
      await add('RESTORE.txt', RESTORE_HELP);
      for (const id of await readdir(config.mediaDir).catch(() => [])) {
        for (const f of await listLocalFiles(config.mediaDir, id)) await addStream(`media/${f.key}`, f.size, createReadStream(absPath(config.mediaDir, f.key)));
      }
      const missing: string[] = [];
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
    })().catch((e) => pack.destroy(e));
    const day = new Date().toISOString().slice(0, 10);
    return reply.type('application/x-tar').header('content-disposition', `attachment; filename="lookback-backup-${day}.tar"`)
      .header('cache-control', 'no-store').send(pack);
  });
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
