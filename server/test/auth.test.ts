import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { testApp } from './helpers.js';

describe('auth', () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  beforeAll(async () => { t = await testApp(); });
  afterAll(async () => { await t.app.close(); await t.pool.end(); });

  const login = (password: string) =>
    t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password } });

  it('hash/verify roundtrip', async () => {
    expect(await verifyPassword('x', await hashPassword('x'))).toBe(true);
    expect(await verifyPassword('y', await hashPassword('x'))).toBe(false);
  });

  it('check without cookie → 401, with cookie → 204', async () => {
    expect((await t.app.inject({ url: '/api/auth/check' })).statusCode).toBe(401);
    const cookie = await t.login();
    expect((await t.app.inject({ url: '/api/auth/check', headers: { cookie } })).statusCode).toBe(204);
  });

  it('login sets HttpOnly sid cookie', async () => {
    const res = await login(t.password);
    expect(res.statusCode).toBe(204);
    const sc = String(res.headers['set-cookie']);
    expect(sc).toContain('sid=');
    expect(sc).toContain('HttpOnly');
  });

  it('a login lasts past one day (not the plugin default) and is renewed by use; 30 idle days end it', async () => {
    const cookie = await t.login();
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(now + 2 * 864e5);
      const used = await t.app.inject({ url: '/api/albums', headers: { cookie } });
      expect(used.statusCode).toBe(200);
      const renewed = String(used.headers['set-cookie']).match(/sid=[^;]+/)![0];
      vi.setSystemTime(now + 31 * 864e5); // 29 days after the renewal: still in
      expect((await t.app.inject({ url: '/api/albums', headers: { cookie: renewed } })).statusCode).toBe(200);
      expect((await t.app.inject({ url: '/api/albums', headers: { cookie } })).statusCode).toBe(401); // never renewed
    } finally { vi.useRealTimers(); }
  });

  it('unknown /api route without cookie → 401', async () => {
    expect((await t.app.inject({ url: '/api/albums' })).statusCode).toBe(401);
  });

  it.each([
    ['GET', '/%61pi/albums'],
    ['GET', '/api/%61lbums'],
    ['GET', '/API/albums'],
    ['GET', '/api/auth/login'],
    ['POST', '/api/health'],
  ])('%s %s without cookie → 401 or bare 404', async (method, url) => {
    const res = await t.app.inject({ method: method as 'GET', url });
    expect([401, 404]).toContain(res.statusCode);
    if (res.statusCode === 404) expect(res.json()).not.toHaveProperty('albums');
    expect(res.body).not.toMatch(/\[\{|"id"/);
  });

  it('encoded-path DELETE of a real album without cookie → 401, album kept', async () => {
    const id = (await t.pool.query(`insert into albums (title) values ('keep') returning id`)).rows[0].id;
    const res = await t.app.inject({ method: 'DELETE', url: `/%61pi/albums/${id}` });
    expect(res.statusCode).toBe(401);
    expect((await t.pool.query('select 1 from albums where id=$1', [id])).rowCount).toBe(1);
  });

  it('health stays public', async () => {
    expect((await t.app.inject({ url: '/api/health' })).statusCode).toBe(200);
  });

  it('logout then check → 401', async () => {
    const cookie = await t.login();
    const out = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const next = String(out.headers['set-cookie']).split(';')[0];
    expect((await t.app.inject({ url: '/api/auth/check', headers: { cookie: next } })).statusCode).toBe(401);
  });

  it('wrong password → 401, 6th failure in a row → 429', async () => {
    // fresh app: rate-limit store is per instance
    const t2 = await testApp();
    const bad = () => t2.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'nope' } });
    for (let i = 0; i < 5; i++) expect((await bad()).statusCode).toBe(401);
    expect((await bad()).statusCode).toBe(429);
    await t2.app.close(); await t2.pool.end();
  });
});
