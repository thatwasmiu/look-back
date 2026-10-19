import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';

// Owner tools behind the hidden /manage page (the session guard covers every /api route here):
// storage use, every media file with its size and whether anything uses it, and a full backup download.

// Bytes under a directory (0 if it doesn't exist). ponytail: walks the tree on each request; fine for a personal
// library of thousands of files, cache it if it ever gets slow.
export async function dirBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let n = 0;
  for (const e of entries) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? await dirBytes(p) : (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return n;
}

// Media a page frame, an album cover or an album's music points at.
const USED_SQL = `
  select e->>'mediaId' as id from pages, jsonb_array_elements(layout->'elements') e
    where e->>'type' = 'frame' and e->>'mediaId' is not null
  union select cover_media_id::text from albums where cover_media_id is not null
  union select music_media_id::text from albums where music_media_id is not null`;

// What a backup holds besides the media folder: every row of the app's own tables.
export const BACKUP_TABLES = ['albums', 'pages', 'media'] as const;

export function registerManage(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.get('/api/manage', async () => {
    const [files, used, db, fs, all] = await Promise.all([
      pool.query(`select m.id, m.album_id, a.title as album_title, m.kind, m.status, m.original_name, m.variants, m.error, m.created_at
        from media m join albums a on a.id = m.album_id order by m.created_at desc`),
      pool.query(USED_SQL),
      pool.query('select pg_database_size(current_database())::bigint as bytes'),
      statfs(config.mediaDir),
      dirBytes(config.mediaDir),
    ]);
    const usedIds = new Set(used.rows.map((r) => r.id));
    const sizes = await Promise.all(files.rows.map((r) => dirBytes(join(config.mediaDir, r.id))));
    return {
      disk: { total: fs.blocks * fs.bsize, free: fs.bavail * fs.bsize },
      mediaBytes: all,
      dbBytes: Number(db.rows[0].bytes),
      files: files.rows.map((r, i) => ({
        id: r.id, albumId: r.album_id, albumTitle: r.album_title, kind: r.kind, status: r.status,
        name: r.original_name, error: r.error, createdAt: r.created_at, bytes: sizes[i], used: usedIds.has(r.id),
        thumb: r.variants?.thumb ?? r.variants?.poster ?? null,
      })),
    };
  });

  // One .tar streamed as it is made: db.json (all rows) + RESTORE.txt + the whole media folder (originals and the
  // processed versions, so a restore needs no re-processing). Nothing is kept on the server afterwards.
  app.get('/api/manage/backup', async (_req, reply) => {
    const dump: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES) dump[t] = (await pool.query(`select * from ${t}`)).rows;
    const migrations = (await pool.query('select name from schema_migrations order by name')).rows.map((r) => r.name);
    const tmp = await mkdtemp(join(tmpdir(), 'backup-'));
    await writeFile(join(tmp, 'db.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), migrations, tables: dump }));
    await writeFile(join(tmp, 'RESTORE.txt'), RESTORE_HELP);
    // The media folder goes in as media/ whatever it is called here (GNU tar --transform).
    const tar = spawn('tar', ['-c', '-C', tmp, 'db.json', 'RESTORE.txt', '-C', config.mediaDir, '--transform', 's,^\\.,media,', '.']);
    tar.on('close', () => { void rm(tmp, { recursive: true, force: true }); });
    tar.on('error', () => { void rm(tmp, { recursive: true, force: true }); });
    const day = new Date().toISOString().slice(0, 10);
    return reply.type('application/x-tar').header('content-disposition', `attachment; filename="lookback-backup-${day}.tar"`)
      .header('cache-control', 'no-store').send(tar.stdout);
  });
}

const RESTORE_HELP = `Look Back backup
================
db.json  albums, pages and media rows
media/   every photo / video / music file (originals and processed versions)

Restore on the server (REPLACES all current albums and media with this backup):
  cd /root/project/lookback
  docker compose -f compose.yml run --rm -v "$PWD/lookback-backup.tar:/backup.tar:ro" api node server/dist/restore.js /backup.tar
`;
