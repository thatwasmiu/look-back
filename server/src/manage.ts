import { statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type PgBoss from 'pg-boss';
import type pg from 'pg';
import type { Config } from './config.js';
import { backupFileName, buildBackup } from './backup.js';
import { dirBytes } from './mediaFiles.js';
import { JOB_MOVE_MEDIA, type MoveMediaJob } from './queue.js';

// Owner tools behind the hidden /manage page (the session guard covers every /api route here):
// storage use, every media file with its size and whether anything uses it, and a full backup download.

// Media a page frame, an album cover or an album's music points at.
const USED_SQL = `
  select e->>'mediaId' as id from pages, jsonb_array_elements(layout->'elements') e
    where e->>'type' = 'frame' and e->>'mediaId' is not null
  union select cover_media_id::text from albums where cover_media_id is not null
  union select music_media_id::text from albums where music_media_id is not null`;


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

  // The full backup as one .tar download (see backup.ts); nginx passes it unbuffered.
  app.get('/api/manage/backup', async (_req, reply) => {
    const { stream } = buildBackup(pool, config);
    return reply.type('application/x-tar').header('content-disposition', `attachment; filename="${backupFileName()}"`)
      .header('cache-control', 'no-store').send(stream);
  });
}
