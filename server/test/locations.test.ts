import { afterAll, describe, expect, it } from 'vitest';
import { decryptSecret } from '../src/secrets.js';
import { testApp } from './helpers.js';
import { s3Available, testBucket } from './s3.js';

const t = await testApp();
await t.login();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});
const owner = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });
const secretOf = async (id: string) =>
  decryptSecret((await t.pool.query('select secret_enc from storage_locations where id = $1', [id])).rows[0].secret_enc, t.config.sessionSecret);

describe('storage locations API', () => {
  it('needs the owner session', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/manage/locations' })).statusCode).toBe(401);
  });

  describe.skipIf(!s3Available)('with a bucket', () => {
    it('adding a location that fails the check saves nothing', async () => {
      const b = await testBucket('loc-a');
      const r = await owner('POST', '/api/manage/locations', { name: 'R2', ...b, secretAccessKey: 'wrong' });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/\S/);
      expect((await owner('GET', '/api/manage/locations')).json()).toEqual([]);
    });

    it('add, list without secrets, rename, re-key', async () => {
      const b = await testBucket('loc-b');
      const r = await owner('POST', '/api/manage/locations', { name: 'B2', ...b, capBytes: 10 * 2 ** 30 });
      expect(r.statusCode).toBe(201);
      const id = r.json().id as string;
      const list = (await owner('GET', '/api/manage/locations')).json();
      expect(list[0]).toMatchObject({ id, name: 'B2', bucket: 'loc-b', accessKeyId: b.accessKeyId, capBytes: 10 * 2 ** 30, status: 'ok', files: 0, bytes: 0, pendingDeletes: 0 });
      expect(Object.keys(list[0]).some((k) => /secret/i.test(k))).toBe(false);
      expect(JSON.stringify(list)).not.toContain(b.secretAccessKey);
      expect(await secretOf(id)).toBe(b.secretAccessKey);

      expect((await owner('PATCH', `/api/manage/locations/${id}`, { name: 'Backblaze' })).json().name).toBe('Backblaze');
      expect((await owner('PATCH', `/api/manage/locations/${id}`, { secretAccessKey: 'wrong' })).statusCode).toBe(400);
      expect(await secretOf(id)).toBe(b.secretAccessKey);
    });

    it('delete refused while it holds files', async () => {
      const b = await testBucket('loc-c');
      const id = (await owner('POST', '/api/manage/locations', { name: 'C', ...b })).json().id;
      const a = (await owner('POST', '/api/albums', { title: 'x' })).json();
      const m = (await t.pool.query(`insert into media (album_id, kind, status, storage_id) values ($1, 'image', 'ready', $2) returning id`, [a.id, id])).rows[0].id;
      const r = await owner('DELETE', `/api/manage/locations/${id}`);
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toBe('Nơi lưu còn file — hãy chuyển file đi trước.');
      await t.pool.query('delete from media where id = $1', [m]);
      expect((await owner('DELETE', `/api/manage/locations/${id}`)).statusCode).toBe(204);
    });

    it('check marks a broken location', async () => {
      const b = await testBucket('loc-d');
      const id = (await owner('POST', '/api/manage/locations', { name: 'D', ...b })).json().id;
      await t.pool.query(`update storage_locations set bucket = 'no-such-bucket-here' where id = $1`, [id]);
      const r = (await owner('POST', `/api/manage/locations/${id}/check`)).json();
      expect(r.status).toBe('error');
      expect(r.statusMessage).toMatch(/\S/);
    });
  });
});
