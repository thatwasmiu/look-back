import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type pg from 'pg';
import type { Config } from './config.js';
import { loadBucket } from './locations.js';
import { listLocalFiles, removeMediaFiles } from './mediaFiles.js';
import { bucketClient, type ObjectInfo } from './objectStore.js';
import type { MoveMediaJob } from './queue.js';
import { absPath } from './storage.js';

// Moves one media's files (every object under <id>/) to another location without ever losing them:
// copy all → verify (same keys and sizes) → switch media.storage_id → delete the source. Any failure removes the
// partial copy, keeps the media where it was and records move_error.
const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
};
export const contentTypeOf = (key: string) => TYPES[extname(key).toLowerCase()] ?? 'application/octet-stream';

type Side = {
  list(id: string): Promise<ObjectInfo[]>;
  read(key: string): Promise<Readable>;
  write(o: ObjectInfo, body: Readable): Promise<void>;
  remove(id: string, keys: string[]): Promise<void>;
};

async function side(pool: pg.Pool, config: Config, storageId: string | null): Promise<Side> {
  if (!storageId) {
    return {
      list: (id) => listLocalFiles(config.mediaDir, id),
      read: async (key) => createReadStream(absPath(config.mediaDir, key)),
      write: async (o, body) => {
        const p = absPath(config.mediaDir, o.key);
        await mkdir(dirname(p), { recursive: true });
        await pipeline(body, createWriteStream(p));
      },
      remove: (id) => rm(absPath(config.mediaDir, id), { recursive: true, force: true }),
    };
  }
  const bucket = await loadBucket(pool, config.sessionSecret, storageId);
  if (!bucket) throw new Error('Nơi lưu cần nhập lại khoá.');
  const c = bucketClient(bucket);
  return {
    list: (id) => c.list(`${id}/`),
    read: async (key) => Readable.fromWeb((await c.get(key)).body as import('node:stream/web').ReadableStream),
    write: (o, body) => c.put(o.key, body, o.size, contentTypeOf(o.key)),
    remove: async (_id, keys) => c.del(keys),
  };
}

const same = (a: ObjectInfo[], b: ObjectInfo[]) => {
  const m = new Map(a.map((o) => [o.key, o.size]));
  return a.length === b.length && b.every((o) => m.get(o.key) === o.size);
};

export async function moveMedia(pool: pg.Pool, config: Config, job: MoveMediaJob, hooks: { beforeCommit?: () => Promise<void> } = {}): Promise<void> {
  const { mediaId: id, to } = job;
  const row = (await pool.query('select storage_id from media where id = $1', [id])).rows[0];
  if (!row) return;
  const from: string | null = row.storage_id;
  if (from === to) {
    await pool.query('update media set moving_to = null where id = $1', [id]);
    return;
  }
  let dest: Side | null = null;
  let copied: ObjectInfo[] = [];
  try {
    const src = await side(pool, config, from);
    dest = await side(pool, config, to);
    const files = await src.list(id);
    if (!files.length) throw new Error('Không tìm thấy file nguồn.');
    for (const o of files) {
      await dest.write(o, await src.read(o.key));
      copied.push(o);
    }
    if (!same(files, await dest.list(id))) throw new Error('Bản chép không khớp bản gốc.');
    await hooks.beforeCommit?.();
    const bytes = files.reduce((n, o) => n + o.size, 0);
    const u = await pool.query(`update media set storage_id = $2, bytes = $3, moving_to = null, move_error = null
      where id = $1 and storage_id is not distinct from $4`, [id, to, bytes, from]);
    if (!u.rowCount) { // deleted or moved meanwhile: the copy belongs to nobody
      await dest.remove(id, copied.map((o) => o.key));
      return;
    }
    copied = [];
    await removeMediaFiles(pool, config, [{ id, storageId: from }]); // local now; a bucket source is queued
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300) || 'chuyển file thất bại';
    if (dest && copied.length) await dest.remove(id, copied.map((o) => o.key)).catch(() => {});
    await pool.query('update media set moving_to = null, move_error = $2 where id = $1', [id, msg]);
  }
}
