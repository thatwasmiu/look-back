import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import type { PageLayout } from '@scrapbook/shared';
import type { Config } from './config.js';
import { loadBucket, markLocation } from './locations.js';
import { bucketClient } from './objectStore.js';
import { absPath } from './storage.js';

// Where a media's files live: the VPS disk (media.storage_id null, folder <mediaDir>/<id>/) or a bucket location
// (objects under <id>/). Everything that deletes or reads media files goes through here.

// Bytes under a directory (0 if it doesn't exist). ponytail: walks the tree each call; fine for a personal library.
export async function dirBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let n = 0;
  for (const e of entries) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? await dirBytes(p) : (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return n;
}

// Every file of a local media as bucket-style keys (`<id>/<rel path>`) with sizes.
export async function listLocalFiles(mediaDir: string, id: string): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  const walk = async (dir: string, rel: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(join(dir, e.name), `${rel}${e.name}/`);
      else out.push({ key: `${id}/${rel}${e.name}`, size: (await stat(join(dir, e.name))).size });
    }
  };
  await walk(absPath(mediaDir, id), '');
  return out;
}

export type GoneMedia = { id: string; storageId: string | null };

// The DB side of deleting media (inside the caller's transaction): empty the frames that show them, clear album
// covers / music, delete the rows. Returns where each one's files were.
export async function deleteMediaRows(c: pg.PoolClient, ids: string[]): Promise<GoneMedia[]> {
  if (!ids.length) return [];
  const rows = (await c.query('select id, album_id, storage_id from media where id = any($1) for update', [ids])).rows;
  const byAlbum = new Map<string, Set<string>>();
  for (const r of rows) byAlbum.set(r.album_id, (byAlbum.get(r.album_id) ?? new Set()).add(r.id));
  for (const [albumId, gone] of byAlbum) {
    const pages = await c.query('select id, layout from pages where album_id = $1 for update', [albumId]);
    for (const p of pages.rows as { id: string; layout: PageLayout }[]) {
      if (!p.layout.elements.some((e) => e.type === 'frame' && e.mediaId && gone.has(e.mediaId))) continue;
      const layout = { ...p.layout, elements: p.layout.elements.map((e) => (e.type === 'frame' && e.mediaId && gone.has(e.mediaId) ? { ...e, mediaId: null } : e)) };
      // Not a new version: the editor that deleted the media empties the same frames itself and saves on top.
      await c.query('update pages set layout = $2 where id = $1', [p.id, JSON.stringify(layout)]);
    }
    await c.query(`update albums set cover_media_id = case when cover_media_id = any($2) then null else cover_media_id end,
      music_media_id = case when music_media_id = any($2) then null else music_media_id end, updated_at = now() where id = $1`, [albumId, [...gone]]);
  }
  await c.query('delete from media where id = any($1)', [ids]);
  return rows.map((r) => ({ id: r.id, storageId: r.storage_id }));
}

// After the rows are gone: local folders are removed now (never throws — the request already succeeded), bucket
// objects are queued for the worker, so a bucket that's down only delays the cleanup.
export async function removeMediaFiles(pool: pg.Pool, config: Config, gone: GoneMedia[]): Promise<void> {
  for (const g of gone) {
    try {
      if (g.storageId) await pool.query('insert into pending_deletes (storage_id, prefix) values ($1, $2)', [g.storageId, `${g.id}/`]);
      else await rm(absPath(config.mediaDir, g.id), { recursive: true, force: true });
    } catch (err) {
      console.error('failed to remove media files', g.id, err);
    }
  }
}

// Worker: delete queued bucket objects; a failure keeps the row (attempts + 1) for the next pass.
export async function runPendingDeletes(pool: pg.Pool, config: Config): Promise<void> {
  const { rows } = await pool.query('select id, storage_id, prefix from pending_deletes order by id');
  for (const r of rows) {
    try {
      const bucket = await loadBucket(pool, config.sessionSecret, r.storage_id);
      if (!bucket) throw new Error('cần nhập lại khoá');
      const c = bucketClient(bucket);
      await c.del((await c.list(r.prefix)).map((o) => o.key));
      await pool.query('delete from pending_deletes where id = $1', [r.id]);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await pool.query('update pending_deletes set attempts = attempts + 1, last_error = $2 where id = $1', [r.id, msg]);
      await markLocation(pool, r.storage_id, msg);
    }
  }
}

// One media file's bytes by key (`<mediaId>/<variant>`), wherever it lives (server-side uses: link previews).
export async function readMediaFile(pool: pg.Pool, config: Config, key: string): Promise<Buffer> {
  const id = key.split('/')[0];
  const storageId = (await pool.query('select storage_id from media where id = $1', [id])).rows[0]?.storage_id;
  if (!storageId) return readFile(absPath(config.mediaDir, key));
  const bucket = await loadBucket(pool, config.sessionSecret, storageId);
  if (!bucket) throw new Error('cần nhập lại khoá');
  return Buffer.from(await (await bucketClient(bucket).get(key)).arrayBuffer());
}
