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
