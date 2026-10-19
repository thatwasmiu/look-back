import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
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

async function setup(name: string) {
  const b = await testBucket(name);
  const loc = (await owner('POST', '/api/manage/locations', { name, ...b })).json().id as string;
  const album = (await owner('POST', '/api/albums', { title: name })).json().id as string;
  const id = (await t.pool.query(`insert into media (album_id, kind, status, storage_id, variants) values ($1, 'image', 'ready', $2, $3) returning id`,
    [album, loc, JSON.stringify({ display: 'x' })])).rows[0].id as string;
  return { loc, album, id, c: bucketClient(b) };
}
const shareCookie = async (album: string) => `lb_share=${(await owner('POST', `/api/albums/${album}/share`)).json().shareToken}`;

describe.skipIf(!s3Available)('serving files that live in a bucket', () => {
  it('owner gets a 302 to a working presigned URL', async () => {
    const s = await setup('srv-a');
    await s.c.put(`${s.id}/display.webp`, Buffer.from('pixels'), 6);
    const r = await owner('GET', `/media/${s.id}/display.webp`);
    expect(r.statusCode).toBe(302);
    const f = await fetch(r.headers.location as string);
    expect(f.status).toBe(200);
    expect(await f.text()).toBe('pixels');
  });

  it('share cookie of album A cannot open bucket media of album B', async () => {
    const a = await setup('srv-b');
    const b = await setup('srv-c');
    const cookie = await shareCookie(a.album);
    expect((await t.app.inject({ method: 'GET', url: `/media/${b.id}/display.webp`, headers: { cookie } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: `/media/${a.id}/display.webp`, headers: { cookie } })).statusCode).toBe(302);
    expect((await t.app.inject({ method: 'GET', url: `/media/${a.id}/display.webp` })).statusCode).toBe(401);
  });

  it('HLS playlists are served from the app with relative links; each segment redirects on its own', async () => {
    const s = await setup('srv-d');
    const master0 = Buffer.from('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n0.m3u8\n');
    await s.c.put(`${s.id}/hls/master.m3u8`, master0, master0.length);
    const variant = Buffer.from('#EXTM3U\n#EXTINF:4.0,\n0_0001.ts\n#EXT-X-ENDLIST\n');
    await s.c.put(`${s.id}/hls/0.m3u8`, variant, variant.length);
    await s.c.put(`${s.id}/hls/0_0001.ts`, Buffer.from('seg'), 3);
    const master = await owner('GET', `/media/${s.id}/hls/master.m3u8`);
    expect(master.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(master.body).toBe(master0.toString());
    expect((await owner('GET', `/media/${s.id}/hls/0.m3u8`)).body).toContain('\n0_0001.ts\n');
    const seg = await owner('GET', `/media/${s.id}/hls/0_0001.ts`);
    expect(seg.statusCode).toBe(302);
    expect(await (await fetch(seg.headers.location as string)).text()).toBe('seg');

    // A playlist that isn't there is a 404 for that file only — the location stays usable.
    expect((await owner('GET', `/media/${s.id}/hls/missing.m3u8`)).statusCode).toBe(404);
    expect((await t.pool.query('select check_status from storage_locations where id = $1', [s.loc])).rows[0].check_status).toBe('ok');
    expect((await owner('GET', `/media/${s.id}/hls/0.m3u8`)).statusCode).toBe(200);
  });

  it('broken location → 503; a local media missing on disk → 404', async () => {
    const s = await setup('srv-e');
    await t.pool.query(`update storage_locations set check_status = 'error' where id = $1`, [s.loc]);
    expect((await owner('GET', `/media/${s.id}/display.webp`)).statusCode).toBe(503);
    const local = (await t.pool.query(`insert into media (album_id, kind, status) values ($1, 'image', 'ready') returning id`, [s.album])).rows[0].id;
    expect((await owner('GET', `/media/${local}/display.webp`)).statusCode).toBe(404);
  });

  it('link preview of an album whose cover lives in a bucket', async () => {
    const s = await setup('srv-f');
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#c66' } }).webp().toBuffer();
    await s.c.put(`${s.id}/display.webp`, png, png.length);
    await t.pool.query(`update media set variants = $2 where id = $1`, [s.id, JSON.stringify({ display: `${s.id}/display.webp` })]);
    await t.pool.query('update albums set cover_media_id = $2 where id = $1', [s.album, s.id]);
    const token = (await owner('POST', `/api/albums/${s.album}/share`)).json().shareToken;
    const r = await t.app.inject({ method: 'GET', url: `/api/share/${token}/preview.jpg` });
    expect(r.headers['content-type']).toBe('image/jpeg');
    expect(await sharp(r.rawPayload).metadata()).toMatchObject({ width: 1200, height: 630 });
  });
});
