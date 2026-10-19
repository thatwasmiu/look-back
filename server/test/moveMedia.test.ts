import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runPendingDeletes } from '../src/mediaFiles.js';
import { moveMedia } from '../src/moveMedia.js';
import { bucketClient } from '../src/objectStore.js';
import { testApp } from './helpers.js';
import { s3Available, testBucket } from './s3.js';

const t = await testApp();
await t.login();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});
const owner = async (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });

const FILES: Record<string, Buffer> = {
  'original.jpg': Buffer.alloc(3000, 1), 'display.webp': Buffer.alloc(2000, 2),
  'hls/master.m3u8': Buffer.from('#EXTM3U\n0.m3u8\n'), 'hls/0_0001.ts': Buffer.alloc(5000, 3),
};
const TOTAL = Object.values(FILES).reduce((n, b) => n + b.length, 0);

async function localMedia() {
  const a = (await owner('POST', '/api/albums', { title: 'Move' })).json().id;
  const id = (await t.pool.query(`insert into media (album_id, kind, status) values ($1, 'video', 'ready') returning id`, [a])).rows[0].id as string;
  for (const [rel, buf] of Object.entries(FILES)) {
    await mkdir(join(t.config.mediaDir, id, rel, '..'), { recursive: true });
    await writeFile(join(t.config.mediaDir, id, rel), buf);
  }
  return id;
}
async function location(name: string, capBytes?: number) {
  const b = await testBucket(name);
  const id = (await owner('POST', '/api/manage/locations', { name, ...b, ...(capBytes ? { capBytes } : {}) })).json().id as string;
  return { id, c: bucketClient(b) };
}
const where = async (id: string) => (await t.pool.query('select storage_id, bytes, moving_to, move_error from media where id = $1', [id])).rows[0];
async function bucketFiles(c: ReturnType<typeof bucketClient>, id: string) {
  const out: Record<string, Buffer> = {};
  for (const o of await c.list(`${id}/`)) out[o.key.slice(id.length + 1)] = Buffer.from(await (await c.get(o.key)).arrayBuffer());
  return out;
}

describe.skipIf(!s3Available)('moving media between locations', () => {
  it('local → A → B → local keeps every file byte-identical', async () => {
    const id = await localMedia();
    const A = await location('mv-a');
    const B = await location('mv-b');

    await moveMedia(t.pool, t.config, { mediaId: id, to: A.id });
    expect(await where(id)).toMatchObject({ storage_id: A.id, moving_to: null, move_error: null });
    expect(Number((await where(id)).bytes)).toBe(TOTAL);
    expect(existsSync(join(t.config.mediaDir, id))).toBe(false);
    expect(await bucketFiles(A.c, id)).toEqual(FILES);

    await moveMedia(t.pool, t.config, { mediaId: id, to: B.id });
    expect((await where(id)).storage_id).toBe(B.id);
    expect(await bucketFiles(B.c, id)).toEqual(FILES);
    await runPendingDeletes(t.pool, t.config);
    expect(await A.c.list(`${id}/`)).toEqual([]);

    await moveMedia(t.pool, t.config, { mediaId: id, to: null });
    expect((await where(id)).storage_id).toBeNull();
    for (const [rel, buf] of Object.entries(FILES)) expect((await readFile(join(t.config.mediaDir, id, rel))).equals(buf)).toBe(true);
    await runPendingDeletes(t.pool, t.config);
    expect(await B.c.list(`${id}/`)).toEqual([]);
  });

  it('a failed copy changes nothing', async () => {
    const id = await localMedia();
    const A = await location('mv-c');
    await t.pool.query(`update storage_locations set bucket = 'no-such-bucket-here' where id = $1`, [A.id]);
    await moveMedia(t.pool, t.config, { mediaId: id, to: A.id });
    const w = await where(id);
    expect(w.storage_id).toBeNull();
    expect(w.moving_to).toBeNull();
    expect(w.move_error).toMatch(/\S/);
    expect(existsSync(join(t.config.mediaDir, id, 'hls/0_0001.ts'))).toBe(true);
  });

  it('a media deleted during its move leaves no copy behind', async () => {
    const id = await localMedia();
    const A = await location('mv-d');
    await moveMedia(t.pool, t.config, { mediaId: id, to: A.id }, {
      beforeCommit: async () => { await t.pool.query('delete from media where id = $1', [id]); },
    });
    expect((await t.pool.query('select 1 from media where id = $1', [id])).rowCount).toBe(0);
    expect(await A.c.list(`${id}/`)).toEqual([]);
  });

  it('move endpoint refuses over-cap and broken destinations', async () => {
    const id = await localMedia();
    const small = await location('mv-e', 10);
    const r = await owner('POST', '/api/manage/move', { mediaIds: [id], to: small.id });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('Vượt giới hạn dung lượng của mv-e');

    const broken = await location('mv-f');
    await t.pool.query(`update storage_locations set check_status = 'error' where id = $1`, [broken.id]);
    expect((await owner('POST', '/api/manage/move', { mediaIds: [id], to: broken.id })).statusCode).toBe(400);

    const good = await location('mv-g');
    expect((await owner('POST', '/api/manage/move', { mediaIds: [id], to: good.id })).json()).toEqual({ queued: 1 });
    expect((await where(id)).moving_to).toBe(good.id);
    const f = (await owner('GET', '/api/manage')).json().files.find((x: { id: string }) => x.id === id);
    expect(f).toMatchObject({ location: null, movingTo: good.id, moveError: null });
  });
});
