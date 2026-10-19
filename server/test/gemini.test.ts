import { afterAll, describe, expect, it } from 'vitest';
import type { Config } from '../src/config.js';
import { aiErrorMessage, GeminiError, generateJson } from '../src/gemini.js';
import { startFakeGemini } from './fakeGemini.js';

const g = await startFakeGemini();
afterAll(() => g.close());
const config = { geminiBase: g.base } as Config;
const call = (timeoutMs?: number) => generateJson(config, 'AIzaSECRETKEY1234', 'gemini-test', 'hi', { type: 'object' }, timeoutMs);
const kind = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof GeminiError ? e.kind : String(e)));

describe('Gemini client', () => {
  it('sends the key only in a header and parses the JSON answer', async () => {
    g.reply({ text: '{"a":1}' });
    expect(await call()).toEqual({ a: 1 });
    const r = g.lastRequest()!;
    expect(r.url).toBe('/v1beta/models/gemini-test:generateContent');
    expect(r.url).not.toContain('key=');
    expect(r.headers['x-goog-api-key']).toBe('AIzaSECRETKEY1234');
    expect(r.body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: { type: 'object' } });
  });

  it('maps errors', async () => {
    g.reply({ status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } });
    expect(await kind(call())).toBe('bad-key');
    g.reply({ status: 403, body: { error: { code: 403 } } });
    expect(await kind(call())).toBe('bad-key');
    g.reply({ status: 429, body: { error: { code: 429 } } });
    expect(await kind(call())).toBe('quota');
    g.reply({ status: 503, body: { error: { code: 503 } } });
    expect(await kind(call())).toBe('busy');
    g.reply({ status: 500, body: {} });
    expect(await kind(call())).toBe('http');
    g.reply({ text: 'not json' });
    expect(await kind(call())).toBe('unusable');
    g.reply({ body: { candidates: [{ finishReason: 'SAFETY' }] } });
    expect(await kind(call())).toBe('unusable');
    g.reply({ text: '{}', delayMs: 500 });
    expect(await kind(call(100))).toBe('timeout');
  });

  it('error messages are Vietnamese and never echo the key', () => {
    expect(aiErrorMessage(new GeminiError('quota', 'x'))).toBe('Hết lượt miễn phí của Gemini, thử lại sau.');
    expect(aiErrorMessage(new GeminiError('bad-key', 'x'))).toBe('Key Gemini không hợp lệ.');
    expect(aiErrorMessage(new GeminiError('unusable', 'x'))).toBe('AI trả lời không dùng được, thử lại.');
    expect(aiErrorMessage(new Error('boom'))).toBe('Gọi Gemini lỗi.');
  });
});
