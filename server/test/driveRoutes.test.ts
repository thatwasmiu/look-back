import { afterAll, describe, expect, it } from 'vitest';
import { nextRunAt } from '../src/driveRoutes.js';
import { decryptSecret } from '../src/secrets.js';
import { startFakeGoogle } from './fakeGoogle.js';
import { testApp } from './helpers.js';

const g = await startFakeGoogle();
const t = await testApp({ googleClientId: 'cid', googleClientSecret: 'cs', googleOauthBase: g.base, googleAuthBase: g.base, googleApiBase: g.base });
let cookie = await t.login();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
  await g.close();
});
const owner = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie } });
const newCookie = (res: { headers: Record<string, unknown> }) => {
  const c = [res.headers['set-cookie']].flat().find((x) => String(x).startsWith('sid='));
  if (c) cookie = String(c).split(';')[0];
};
async function connect() {
  const go = await owner('GET', '/api/manage/drive/connect');
  expect(go.statusCode).toBe(302);
  newCookie(go);
  const state = new URL(go.headers.location as string).searchParams.get('state')!;
  const back = await owner('GET', `/api/manage/drive/callback?code=abc&state=${state}`);
  newCookie(back);
  return back;
}
const scheduled = async () => (await t.pool.query(`select cron, timezone from pgboss.schedule where name = 'drive-backup'`)).rows[0];

describe('Google Drive backup routes', () => {
  it('connect → callback stores an encrypted token and never returns it', async () => {
    const back = await connect();
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('/manage#drive');
    const s = await owner('GET', '/api/manage/drive');
    expect(s.json()).toMatchObject({ configured: true, connected: true, email: 'owner@example.com', schedule: 'weekly', status: 'idle' });
    expect(s.body).not.toContain('rt-abc');
    const row = (await t.pool.query('select refresh_enc, folder_id from drive_backup')).rows[0];
    expect(decryptSecret(row.refresh_enc, t.config.sessionSecret)).toBe('rt-abc');
    expect(g.files.get(row.folder_id)!.name).toBe('Look Back backup');
    expect(await scheduled()).toEqual({ cron: '0 3 * * 0', timezone: 'Asia/Ho_Chi_Minh' });
  });

  it('wrong state is refused', async () => {
    expect((await owner('GET', '/api/manage/drive/callback?code=x&state=nope')).statusCode).toBe(400);
  });

  it('schedule change re-registers the cron; off removes it', async () => {
    expect((await owner('PATCH', '/api/manage/drive', { schedule: 'daily' })).statusCode).toBe(200);
    expect(await scheduled()).toEqual({ cron: '0 3 * * *', timezone: 'Asia/Ho_Chi_Minh' });
    await owner('PATCH', '/api/manage/drive', { schedule: 'off' });
    expect(await scheduled()).toBeUndefined();
    expect((await owner('GET', '/api/manage/drive')).json().nextRun).toBeNull();
    await owner('PATCH', '/api/manage/drive', { schedule: 'weekly' });
  });

  it('run now is refused while running', async () => {
    await t.pool.query(`delete from pgboss.job where name = 'drive-backup'`); // no worker in tests: start from an empty queue
    await t.pool.query(`update drive_backup set status = 'running', started_at = now()`);
    const jobs = async () => Number((await t.pool.query(`select count(*) from pgboss.job where name = 'drive-backup'`)).rows[0].count);
    const before = await jobs();
    const r = await owner('POST', '/api/manage/drive/run');
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('Đang backup…');
    expect(await jobs()).toBe(before);
    await t.pool.query(`update drive_backup set status = 'ok'`);
    expect((await owner('POST', '/api/manage/drive/run')).json()).toEqual({ queued: true });
    expect(await jobs()).toBe(before + 1);
    await owner('POST', '/api/manage/drive/run'); // a second click before the worker starts: still one job
    expect(await jobs()).toBe(before + 1);
  });

  it('disconnect revokes and forgets', async () => {
    expect((await owner('DELETE', '/api/manage/drive')).statusCode).toBe(204);
    expect((await owner('GET', '/api/manage/drive')).json()).toMatchObject({ connected: false, email: null });
    expect(await scheduled()).toBeUndefined();
  });

  it('not configured → GET says configured:false, connect 400', async () => {
    const plain = await testApp();
    const c = await plain.login();
    expect((await plain.app.inject({ method: 'GET', url: '/api/manage/drive', headers: { cookie: c } })).json().configured).toBe(false);
    expect((await plain.app.inject({ method: 'GET', url: '/api/manage/drive/connect', headers: { cookie: c } })).statusCode).toBe(400);
    await plain.app.close();
    await plain.pool.end();
  });
});

describe('nextRunAt (Asia/Ho_Chi_Minh, 03:00)', () => {
  it('weekly: Saturday 23:00 VN → Sunday 03:00 VN; Sunday 04:00 VN → next Sunday', () => {
    // 2026-10-17 is a Saturday. 23:00 VN = 16:00 UTC; Sunday 03:00 VN = Saturday 20:00 UTC.
    expect(nextRunAt('weekly', new Date('2026-10-17T16:00:00Z'))!.toISOString()).toBe('2026-10-17T20:00:00.000Z');
    expect(nextRunAt('weekly', new Date('2026-10-17T21:00:00Z'))!.toISOString()).toBe('2026-10-24T20:00:00.000Z');
  });
  it('daily and off', () => {
    expect(nextRunAt('daily', new Date('2026-10-19T10:00:00Z'))!.toISOString()).toBe('2026-10-19T20:00:00.000Z');
    expect(nextRunAt('off')).toBeNull();
  });
});
