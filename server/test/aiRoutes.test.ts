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

  it('POST /api/ai/album builds a manga album from the answer', async () => {
    await owner('PUT', '/api/manage/ai', { key: KEY });
    const pages = ['manga-cover', 'manga-grid', 'manga-yonkoma', 'manga-action', 'manga-ending'].map((template) => ({ template, texts: ['Đi làm'], stickers: [] }));
    g.reply({ text: JSON.stringify({ title: 'Một ngày đi làm', backgroundColor: 'slate', backgroundEffect: 'rain', pages }) });
    const before = (await t.pool.query('select count(*)::int as n from albums')).rows[0].n;
    const res = await owner('POST', '/api/ai/album', { prompt: '1 ngày đi làm', mode: 'manga', readingDirection: 'rtl' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: 'Một ngày đi làm', mode: 'manga', readingDirection: 'rtl', backgroundColor: 'slate', backgroundEffect: 'rain' });
    expect(g.lastRequest()!.body.contents[0].parts[0].text).toContain('1 ngày đi làm');
    const rows = (await t.pool.query('select layout from pages where album_id = $1 order by position', [res.json().id])).rows;
    expect(rows).toHaveLength(5);
    for (const r of rows) for (const e of r.layout.elements) if (e.type === 'frame') expect(e.mediaId).toBeNull();
    expect((await t.pool.query('select count(*)::int as n from albums')).rows[0].n).toBe(before + 1);
  });

  it('the typed title wins over the AI one', async () => {
    const pages = ['cover', 'journal', 'six-grid', 'the-end'].map((template) => ({ template, texts: [], stickers: [] }));
    g.reply({ text: JSON.stringify({ title: 'AI title', backgroundColor: 'rose', backgroundEffect: 'none', pages }) });
    const res = await owner('POST', '/api/ai/album', { prompt: 'sinh nhật', mode: 'scrapbook', title: 'Của tôi' });
    expect(res.json()).toMatchObject({ title: 'Của tôi', mode: 'scrapbook' });
  });

  it('rejects bad input and maps Gemini failures without creating an album', async () => {
    const count = async () => (await t.pool.query('select count(*)::int as n from albums')).rows[0].n;
    const before = await count();
    expect((await owner('POST', '/api/ai/album', { prompt: 'x'.repeat(201), mode: 'manga' })).statusCode).toBe(400);
    expect((await owner('POST', '/api/ai/album', { prompt: '', mode: 'manga' })).statusCode).toBe(400);
    g.reply({ text: 'not json' });
    const bad = await owner('POST', '/api/ai/album', { prompt: 'abc', mode: 'manga' });
    expect(bad.statusCode).toBe(502);
    expect(bad.json()).toEqual({ error: 'AI trả lời không dùng được, thử lại.' });
    g.reply({ status: 429, body: {} });
    expect((await owner('POST', '/api/ai/album', { prompt: 'abc', mode: 'manga' })).json()).toEqual({ error: 'Hết lượt miễn phí của Gemini, thử lại sau.' });
    expect(await count()).toBe(before);
  });

  it('removing the key', async () => {
    expect((await owner('DELETE', '/api/manage/ai/key')).json()).toMatchObject({ hasKey: false, last4: null });
    expect((await owner('POST', '/api/manage/ai/test')).json()).toEqual({ ok: false, error: 'Chưa có Gemini key — thêm trong /manage.' });
    const res = await owner('POST', '/api/ai/album', { prompt: 'abc', mode: 'scrapbook' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Chưa có Gemini key — thêm trong /manage.' });
  });
});
