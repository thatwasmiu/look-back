import type { Config } from './config.js';

// Google Gemini over plain fetch (like drive.ts): one generateContent call that must answer JSON matching `schema`.
// The key goes only in the x-goog-api-key header, never in the URL.
export const DEFAULT_MODEL = 'gemini-3.8-flash';

export type GeminiErrorKind = 'bad-key' | 'no-model' | 'quota' | 'busy' | 'timeout' | 'unusable' | 'http';
export class GeminiError extends Error {
  constructor(public kind: GeminiErrorKind, message: string) {
    super(message);
  }
}

// 45 s: answers well within nginx's 90 s read timeout for /api/ai/ (a late answer must not create a hidden album).
export async function generateJson(config: Config, key: string, model: string, prompt: string, schema: object, timeoutMs = 45_000): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${config.geminiBase}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.9 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new GeminiError('timeout', 'Gemini timed out');
    throw new GeminiError('http', `Gemini unreachable: ${e instanceof Error ? e.message : e}`);
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || (res.status === 400 && text.includes('API_KEY_INVALID'))) throw new GeminiError('bad-key', 'invalid key');
    if (res.status === 404) throw new GeminiError('no-model', `no model ${model}`);
    if (res.status === 429) throw new GeminiError('quota', 'quota exhausted');
    if (res.status === 503) throw new GeminiError('busy', 'model overloaded');
    throw new GeminiError('http', `Gemini HTTP ${res.status}`);
  }
  try {
    const answer = JSON.parse(text).candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof answer !== 'string') throw new Error('no text');
    return JSON.parse(answer);
  } catch {
    throw new GeminiError('unusable', 'answer is not JSON');
  }
}

export const NO_KEY = 'Chưa có Gemini key — thêm trong /manage.';
const MESSAGES: Record<GeminiErrorKind, string> = {
  'bad-key': 'Key Gemini không hợp lệ.',
  'no-model': 'Không có model này — kiểm tra tên model trong /manage.',
  quota: 'Hết lượt miễn phí của Gemini, thử lại sau.',
  busy: 'Gemini đang quá tải, thử lại sau ít phút.',
  timeout: 'Gemini không trả lời kịp, thử lại.',
  unusable: 'AI trả lời không dùng được, thử lại.',
  http: 'Gọi Gemini lỗi.',
};
export const aiErrorMessage = (e: unknown): string => MESSAGES[e instanceof GeminiError ? e.kind : 'http'];
