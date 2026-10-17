import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { testApp } from './helpers.js';

const t = await testApp();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

describe('health', () => {
  it('GET /api/health -> 200 {ok:true}', async () => {
    const res = await t.app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('loadConfig', () => {
  const base = { DATABASE_URL: 'x', OWNER_PASSWORD_HASH: 'x', SESSION_SECRET: 'x', MEDIA_DIR: '/m', UPLOAD_DIR: '/u' };
  it('throws listing missing vars', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL.*OWNER_PASSWORD_HASH/);
  });
  it('parses VIDEO_RENDITIONS, defaults [720]', () => {
    expect(loadConfig({ ...base, VIDEO_RENDITIONS: '720,1080' }).videoRenditions).toEqual([720, 1080]);
    expect(loadConfig(base).videoRenditions).toEqual([720]);
  });
  it('COOKIE_SECURE', () => {
    expect(loadConfig(base).cookieSecure).toBe(true);
    expect(loadConfig({ ...base, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  });
});
