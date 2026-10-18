import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const t = await testApp();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

const owner = async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });
const cookieOf = (res: { headers: Record<string, unknown> }) =>
  String([res.headers['set-cookie']].flat().find((c) => String(c).startsWith('lb_share=')) ?? '').split(';')[0];
const check = (uri: string, cookie?: string) =>
  t.app.inject({ method: 'GET', url: '/api/auth/check', headers: { 'x-original-uri': uri, ...(cookie ? { cookie } : {}) } });

async function albumWithMedia(title: string) {
  const a = (await owner('POST', '/api/albums', { title })).json();
  const { rows } = await t.pool.query(
    `insert into media (album_id, kind, status, mime) values ($1, 'image', 'ready', 'image/jpeg') returning id`, [a.id]);
  return { id: a.id as string, mediaId: rows[0].id as string };
}

describe('share links', () => {
  it('owner creates a link (same token on repeat), anyone with it gets the album read-only, revoke kills it', async () => {
    const a = await albumWithMedia('Shared');
    const s1 = await owner('POST', `/api/albums/${a.id}/share`);
    expect(s1.statusCode).toBe(200);
    const token = s1.json().shareToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect((await owner('POST', `/api/albums/${a.id}/share`)).json().shareToken).toBe(token);
    expect((await owner('GET', '/api/albums')).json().find((x: { id: string }) => x.id === a.id).shareToken).toBe(token);

    const pub = await t.app.inject({ method: 'GET', url: `/api/share/${token}` }); // no session
    expect(pub.statusCode).toBe(200);
    expect(pub.json().album).toMatchObject({ id: a.id, title: 'Shared', shareToken: null }); // token not echoed
    expect(pub.json().media).toHaveLength(1);
    expect(cookieOf(pub)).toBe(`lb_share=${token}`);

    expect((await owner('DELETE', `/api/albums/${a.id}/share`)).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: `/api/share/${token}` })).statusCode).toBe(404);
    const again = (await owner('POST', `/api/albums/${a.id}/share`)).json().shareToken;
    expect(again).not.toBe(token); // a new link, old copies stay dead
  });

  it('unknown or malformed tokens → 404; share routes for the owner still need a session', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/share/nope' })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/api/share/${'x'.repeat(43)}` })).statusCode).toBe(404);
    const a = await albumWithMedia('Private');
    expect((await t.app.inject({ method: 'POST', url: `/api/albums/${a.id}/share` })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: `/api/albums/${a.id}` })).statusCode).toBe(401);
  });

  it("media check: session → ok; share cookie → only that album's media; otherwise 401", async () => {
    const shared = await albumWithMedia('S');
    const other = await albumWithMedia('O');
    const token = (await owner('POST', `/api/albums/${shared.id}/share`)).json().shareToken;
    const cookie = `lb_share=${token}`;
    expect((await check(`/media/${shared.mediaId}/display.webp`, cookie)).statusCode).toBe(204);
    expect((await check(`/media/${other.mediaId}/display.webp`, cookie)).statusCode).toBe(401);
    expect((await check(`/media/${shared.mediaId}/display.webp`)).statusCode).toBe(401);
    expect((await check(`/media/${shared.mediaId}/../${other.mediaId}/x`, cookie)).statusCode).toBe(401);
    expect((await check(`/media/${shared.mediaId}/%2e%2e/${other.mediaId}/x`, cookie)).statusCode).toBe(401);
    expect((await check(`/media/${shared.mediaId}//x`, cookie)).statusCode).toBe(401);
    expect((await check(`/media/${shared.mediaId}/hls/720p_0001.ts?v=1`, cookie)).statusCode).toBe(204);
    expect((await check('/api/albums', cookie)).statusCode).toBe(401);
    const s = await t.app.inject({ method: 'GET', url: '/api/auth/check', headers: { cookie: await t.login() } });
    expect(s.statusCode).toBe(204);
    await owner('DELETE', `/api/albums/${shared.id}/share`);
    expect((await check(`/media/${shared.mediaId}/display.webp`, cookie)).statusCode).toBe(401);
  });
});

describe('share link previews (Facebook, Zalo…)', () => {
  const shareOf = async (id: string) => (await owner('POST', `/api/albums/${id}/share`)).json().shareToken as string;
  const anon = (url: string) => t.app.inject({ method: 'GET', url, headers: { host: 'lookback.test' } });

  it('the preview page carries the album title (escaped), page count, absolute image and link — no login needed', async () => {
    const a = (await owner('POST', '/api/albums', { title: 'Hà Giang <3 & "bạn"' })).json();
    const token = await shareOf(a.id);
    const res = await anon(`/api/share/${token}/preview`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    const html = res.body;
    expect(html).toContain('<meta property="og:title" content="Hà Giang &lt;3 &amp; &quot;bạn&quot;"');
    expect(html).toMatch(/<meta property="og:description" content="1 trang · [^"]*Look Back"/);
    expect(html).toMatch(new RegExp(`<meta property="og:image" content="https?://lookback\.test/api/share/${token}/preview\.jpg"`));
    expect(html).toMatch(new RegExp(`<meta property="og:url" content="https?://lookback\.test/s/${token}"`));
    expect(html).not.toContain('Hà Giang <3'); // never raw
  });

  it('unknown or revoked links give a 404 that reveals nothing', async () => {
    const a = (await owner('POST', '/api/albums', { title: 'Bí mật' })).json();
    const token = await shareOf(a.id);
    await owner('DELETE', `/api/albums/${a.id}/share`);
    for (const url of [`/api/share/${token}/preview`, `/api/share/${'x'.repeat(43)}/preview`, `/api/share/${token}/preview.jpg`]) {
      const res = await anon(url);
      expect(res.statusCode, url).toBe(404);
      expect(res.body).not.toContain('Bí mật');
    }
  });

  it('the preview image is the cover photo cut to 1200×630 JPEG; with no photos it falls back to the app image', async () => {
    const a = await albumWithMedia('Ảnh');
    await mkdir(join(t.config.mediaDir, a.mediaId), { recursive: true });
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#4a90d9' } }).webp().toFile(join(t.config.mediaDir, a.mediaId, 'display.webp'));
    await t.pool.query(`update media set variants = $2 where id = $1`, [a.mediaId, JSON.stringify({ display: `${a.mediaId}/display.webp`, original: `${a.mediaId}/display.webp` })]);
    const token = await shareOf(a.id);
    const img = await anon(`/api/share/${token}/preview.jpg`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(img.rawPayload).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630]);

    const empty = (await owner('POST', '/api/albums', { title: 'Trống' })).json();
    const res = await anon(`/api/share/${await shareOf(empty.id)}/preview.jpg`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/brand/og.jpg');
  });
});
