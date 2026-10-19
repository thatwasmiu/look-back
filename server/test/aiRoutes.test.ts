import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_MODEL } from '../src/gemini.js';
import { startFakeGemini } from './fakeGemini.js';
import { testApp } from './helpers.js';

const g = await startFakeGemini();
const t = await testApp({ geminiBase: g.base });
const cookie = await t.login();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
  await g.close();
});
const owner = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie } });
const KEY = 'AIzaSyTESTKEY-0123456789abcd';

describe('AI settings in /manage', () => {
  it('needs the owner', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/manage/ai' })).statusCode).toBe(401);
  });

  it('stores the key encrypted and never returns it', async () => {
    await owner('DELETE', '/api/manage/ai/key');
    expect((await owner('GET', '/api/manage/ai')).json()).toEqual({ hasKey: false, last4: null, model: DEFAULT_MODEL });
    const put = await owner('PUT', '/api/manage/ai', { key: KEY });
    expect(put.json()).toEqual({ hasKey: true, last4: 'abcd', model: DEFAULT_MODEL });
    const get = await owner('GET', '/api/manage/ai');
    expect(get.json()).toEqual({ hasKey: true, last4: 'abcd', model: DEFAULT_MODEL });
    expect(put.body + get.body).not.toContain(KEY);
    const row = (await t.pool.query('select key_enc from ai_settings')).rows[0];
    expect(row.key_enc).toBeTruthy();
    expect(row.key_enc).not.toContain(KEY);
  });

  it('changes the model and validates it', async () => {
    expect((await owner('PUT', '/api/manage/ai', { model: 'gemini-9.9-flash' })).json()).toMatchObject({ model: 'gemini-9.9-flash' });
    expect((await owner('PUT', '/api/manage/ai', { model: 'x y' })).statusCode).toBe(400);
    expect((await owner('PUT', '/api/manage/ai', { key: 'short' })).statusCode).toBe(400);
    await owner('PUT', '/api/manage/ai', { model: DEFAULT_MODEL });
  });

  it('Test calls Gemini with the saved key', async () => {
    await owner('PUT', '/api/manage/ai', { key: KEY });
    g.reply({ text: '{"ok":true}' });
    expect((await owner('POST', '/api/manage/ai/test')).json()).toEqual({ ok: true });
    expect(g.lastRequest()!.headers['x-goog-api-key']).toBe(KEY);
    g.reply({ status: 429, body: { error: { code: 429 } } });
    expect((await owner('POST', '/api/manage/ai/test')).json()).toEqual({ ok: false, error: 'Hết lượt miễn phí của Gemini, thử lại sau.' });
  });

  it('removing the key', async () => {
    expect((await owner('DELETE', '/api/manage/ai/key')).json()).toMatchObject({ hasKey: false, last4: null });
    expect((await owner('POST', '/api/manage/ai/test')).json()).toEqual({ ok: false, error: 'Chưa có Gemini key — thêm trong /manage.' });
  });
});
