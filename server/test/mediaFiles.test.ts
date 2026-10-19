import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runPendingDeletes } from '../src/mediaFiles.js';
import { bucketClient } from '../src/objectStore.js';
import { testApp } from './helpers.js';
import { s3Available, testBucket } from './s3.js';

const t = await testApp();
await t.login();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});
const owner = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });

async function album() {
  return (await owner('POST', '/api/albums', { title: 'Đà Lạt' })).json().id as string;
}
async function mediaRow(albumId: string, storageId: string | null = null) {
  return (await t.pool.query(`insert into media (album_id, kind, status, storage_id) values ($1, 'image', 'ready', $2) returning id`,
    [albumId, storageId])).rows[0].id as string;
}
async function location(name: string) {
  const b = await testBucket(name);
  const id = (await owner('POST', '/api/manage/locations', { name, ...b })).json().id as string;
  return { id, b, c: bucketClient(b) };
}

describe('where media files live', () => {
  it('deleting a local media still removes its folder', async () => {
    const id = await mediaRow(await album());
    await mkdir(join(t.config.mediaDir, id), { recursive: true });
    await writeFile(join(t.config.mediaDir, id, 'display.webp'), 'x');
    expect((await owner('DELETE', `/api/media/${id}`)).statusCode).toBe(204);
    expect(existsSync(join(t.config.mediaDir, id))).toBe(false);
  });

  describe.skipIf(!s3Available)('on a bucket', () => {
    it('pending deletes survive a failing bucket and are retried', async () => {
      const loc = await location('del-a');
      const id = await mediaRow(await album(), loc.id);
      await loc.c.put(`${id}/display.webp`, Buffer.from('a'), 1);
      await loc.c.put(`${id}/thumb.webp`, Buffer.from('b'), 1);
      expect((await owner('DELETE', `/api/media/${id}`)).statusCode).toBe(204);
      expect((await t.pool.query('select 1 from media where id = $1', [id])).rowCount).toBe(0);
      expect((await t.pool.query('select prefix from pending_deletes')).rows).toEqual([{ prefix: `${id}/` }]);

      await t.pool.query(`update storage_locations set bucket = 'no-such-bucket-here' where id = $1`, [loc.id]);
      await runPendingDeletes(t.pool, t.config);
      const p = (await t.pool.query('select attempts, last_error from pending_deletes')).rows[0];
      expect(p.attempts).toBe(1);
      expect(p.last_error).toMatch(/\S/);
      expect((await owner('DELETE', `/api/manage/locations/${loc.id}`)).statusCode).toBe(409); // not empty yet

      await t.pool.query('update storage_locations set bucket = $2 where id = $1', [loc.id, loc.b.bucket]);
      await runPendingDeletes(t.pool, t.config);
      expect((await t.pool.query('select 1 from pending_deletes')).rowCount).toBe(0);
      expect(await loc.c.list(`${id}/`)).toEqual([]);
    });

    it('deleting an album queues its bucket files too', async () => {
      const loc = await location('del-b');
      const a = await album();
      const id = await mediaRow(a, loc.id);
      await loc.c.put(`${id}/display.webp`, Buffer.from('a'), 1);
      expect((await owner('DELETE', `/api/albums/${a}`)).statusCode).toBe(204);
      await runPendingDeletes(t.pool, t.config);
      expect(await loc.c.list(`${id}/`)).toEqual([]);
    });

    it('drop forgets a dead location', async () => {
      const loc = await location('drop-a');
      const a = await album();
      const inFrame = await mediaRow(a, loc.id);
      const cover = await mediaRow(a, loc.id);
      const page = (await owner('GET', `/api/albums/${a}`)).json().pages[0];
      await owner('PUT', `/api/pages/${page.id}`, { layout: { background: 'paper-cream', elements: [
        { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: inFrame, crop: { x: 0.5, y: 0.5, scale: 1 } },
      ] } });
      await t.pool.query('update albums set cover_media_id = $2 where id = $1', [a, cover]);

      expect((await owner('POST', `/api/manage/locations/${loc.id}/drop`, { confirmName: 'nope' })).statusCode).toBe(400);
      const r = await owner('POST', `/api/manage/locations/${loc.id}/drop`, { confirmName: 'drop-a' });
      expect(r.json()).toEqual({ dropped: 2 });
      const back = (await owner('GET', `/api/albums/${a}`)).json();
      expect(back.pages[0].layout.elements[0].mediaId).toBeNull();
      expect(back.album.coverMediaId).toBeNull();
      expect((await t.pool.query('select 1 from storage_locations where id = $1', [loc.id])).rowCount).toBe(0);
      expect((await t.pool.query('select 1 from pending_deletes')).rowCount).toBe(0);
    });
  });
});
