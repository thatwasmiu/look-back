import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { JOB_PROCESS_MEDIA } from '../src/queue.js';
import { testApp } from './helpers.js';

const t = await testApp({ maxUploadBytes: 8 * 1024 * 1024 });
// Real HTTP: light-my-request's inject stalls on hijacked raw-stream bodies.
const base = await t.app.listen({ port: 0, host: '127.0.0.1' });
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

const b64 = (s: string) => Buffer.from(s).toString('base64');
const tusHeaders = (cookie?: string): Record<string, string> => ({ 'tus-resumable': '1.0.0', ...(cookie ? { cookie } : {}) });
const create = (meta: Record<string, string>, size: number, cookie?: string) =>
  fetch(`${base}/api/uploads`, {
    method: 'POST',
    headers: {
      ...tusHeaders(cookie),
      'upload-length': String(size),
      'upload-metadata': Object.entries(meta).map(([k, v]) => `${k} ${b64(v)}`).join(','),
    },
  });
const patch = (url: string, offset: number, body: Buffer, cookie: string) =>
  fetch(url, {
    method: 'PATCH',
    headers: { ...tusHeaders(cookie), 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
    body: new Uint8Array(body),
  });
const mkAlbum = async () =>
  (await t.pool.query(`insert into albums (title) values ('u') returning id`)).rows[0].id as string;

describe('tus uploads', () => {
  it('rejects HEIC with a helpful 400', async () => {
    const r = await create({ albumId: await mkAlbum(), filename: 'a.heic', filetype: 'image/heic' }, 10, await t.login());
    expect(r.status).toBe(400);
    expect(await r.text()).toContain('HEIC');
  });

  it('rejects unknown album with 400', async () => {
    const r = await create(
      { albumId: '00000000-0000-0000-0000-000000000000', filename: 'a.jpg', filetype: 'image/jpeg' },
      10,
      await t.login(),
    );
    expect(r.status).toBe(400);
  });

  it('requires a session', async () => {
    const r = await create({ albumId: await mkAlbum(), filename: 'a.jpg', filetype: 'image/jpeg' }, 10);
    expect(r.status).toBe(401);
  });

  it('rejects uploads over the size limit with 413', async () => {
    const r = await create({ albumId: await mkAlbum(), filename: 'a.jpg', filetype: 'image/jpeg' }, 9 * 1024 * 1024, await t.login());
    expect(r.status).toBe(413);
  });

  it('resumes an interrupted upload, then marks processing and enqueues one job', async () => {
    const cookie = await t.login();
    const albumId = await mkAlbum();
    const data = randomBytes(1000);
    const c = await create({ albumId, filename: 'pic.jpg', filetype: 'image/jpeg' }, data.length, cookie);
    expect(c.status).toBe(201);
    const loc = c.headers.get('location')!;
    const url = new URL(loc, base).href;
    const mediaId = loc.split('/').pop()!;
    const row = (await t.pool.query('select * from media where id=$1', [mediaId])).rows[0];
    expect(row).toMatchObject({ status: 'uploading', kind: 'image', original_name: 'pic.jpg', mime: 'image/jpeg', album_id: albumId });

    expect((await patch(url, 0, data.subarray(0, 500), cookie)).status).toBe(204);
    const h = await fetch(url, { method: 'HEAD', headers: tusHeaders(cookie) });
    expect(h.headers.get('upload-offset')).toBe('500');
    expect((await patch(url, 500, data.subarray(500), cookie)).status).toBe(204);

    expect((await t.pool.query('select status from media where id=$1', [mediaId])).rows[0].status).toBe('processing');
    const jobs = await t.boss.fetch<{ mediaId: string; uploadPath: string }>(JOB_PROCESS_MEDIA, { batchSize: 10 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.mediaId).toBe(mediaId);
    expect(jobs[0].data.uploadPath).toContain(mediaId);
  });

  it('accepts PATCH chunks larger than Fastify bodyLimit (3 MiB x 2)', async () => {
    const cookie = await t.login();
    const MiB3 = 3 * 1024 * 1024;
    const c = await create({ albumId: await mkAlbum(), filename: 'big.mp4', filetype: 'video/mp4' }, 2 * MiB3, cookie);
    expect(c.status).toBe(201);
    const url = new URL(c.headers.get('location')!, base).href;
    const chunk = randomBytes(MiB3);
    expect((await patch(url, 0, chunk, cookie)).status).toBe(204);
    const last = await patch(url, MiB3, chunk, cookie);
    expect(last.status).toBe(204);
    expect(last.headers.get('upload-offset')).toBe(String(2 * MiB3));
  });

  it('PATCH without a session returns 401', async () => {
    const r = await fetch(`${base}/api/uploads/${crypto.randomUUID()}`, {
      method: 'PATCH',
      headers: { ...tusHeaders(), 'upload-offset': '0', 'content-type': 'application/offset+octet-stream' },
      body: new Uint8Array(10),
    });
    expect(r.status).toBe(401);
  });
});
