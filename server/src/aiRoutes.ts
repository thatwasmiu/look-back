import { randomUUID } from 'node:crypto';
import { ALBUM_MODES, READING_DIRECTIONS, type AlbumMode, type ReadingDirection } from '@scrapbook/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { answerSchema, buildPrompt, toDesign } from './aiAlbum.js';
import { aiErrorMessage, DEFAULT_MODEL, generateJson, NO_KEY } from './gemini.js';
import { decryptSecret, encryptSecret } from './secrets.js';

// /manage "AI (Gemini)": the API key (write-only; the UI sees only its last 4 chars) and the model name.
export type AiSettings = { key: string | null; model: string };

export async function loadAiSettings(pool: pg.Pool, config: Config): Promise<AiSettings> {
  const r = (await pool.query('select key_enc, model from ai_settings where id = 1')).rows[0];
  return { key: r?.key_enc ? decryptSecret(r.key_enc, config.sessionSecret) : null, model: r?.model || DEFAULT_MODEL };
}

export function registerAiRoutes(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  const view = async () => {
    const r = (await pool.query('select key_enc, key_last4, model from ai_settings where id = 1')).rows[0];
    return { hasKey: !!r?.key_enc, last4: r?.key_enc ? r.key_last4 : null, model: r?.model || DEFAULT_MODEL };
  };

  app.get('/api/manage/ai', view);

  app.put<{ Body: { key?: string; model?: string } }>('/api/manage/ai', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      key: { type: 'string', minLength: 20, maxLength: 200, pattern: '^[A-Za-z0-9_-]+$' }, // a pasted invisible char would break the header
      model: { type: 'string', pattern: '^[a-z0-9.-]{3,60}$' },
    } } },
  }, async (req) => {
    const { key, model } = req.body;
    await pool.query('insert into ai_settings (id) values (1) on conflict do nothing');
    if (key) await pool.query('update ai_settings set key_enc = $1, key_last4 = $2 where id = 1', [encryptSecret(key, config.sessionSecret), key.slice(-4)]);
    if (model) await pool.query('update ai_settings set model = $1 where id = 1', [model]);
    return view();
  });

  app.delete('/api/manage/ai/key', async () => {
    await pool.query('update ai_settings set key_enc = null, key_last4 = null where id = 1');
    return view();
  });

  app.post('/api/manage/ai/test', async () => {
    const s = await loadAiSettings(pool, config);
    if (!s.key) return { ok: false, error: NO_KEY };
    try {
      await generateJson(config, s.key, s.model, 'Reply with {"ok": true}.', { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: aiErrorMessage(e) };
    }
  });

  // New album from a description. The design goes through POST /api/albums (same validation, pages and
  // transaction as a built-in template), so there is one way an album gets created.
  app.post<{ Body: { prompt: string; mode: AlbumMode; readingDirection?: ReadingDirection; title?: string } }>('/api/ai/album', {
    schema: { body: { type: 'object', required: ['prompt', 'mode'], additionalProperties: false, properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
      mode: { type: 'string', enum: [...ALBUM_MODES] },
      readingDirection: { type: 'string', enum: [...READING_DIRECTIONS] },
      title: { type: 'string', maxLength: 200 },
    } } },
  }, async (req, reply) => {
    const { prompt, mode, readingDirection = 'ltr' } = req.body;
    const s = await loadAiSettings(pool, config);
    if (!s.key) return reply.code(400).send({ error: NO_KEY });
    let design;
    try {
      design = toDesign(await generateJson(config, s.key, s.model, buildPrompt(prompt.trim(), mode), answerSchema(mode)), mode, readingDirection, randomUUID);
    } catch (e) {
      req.log.warn({ err: e instanceof Error ? e.message : e }, 'ai album failed');
      return reply.code(502).send({ error: aiErrorMessage(e) });
    }
    const { title: aiTitle, ...rest } = design;
    const res = await app.inject({
      method: 'POST', url: '/api/albums', headers: { cookie: req.headers.cookie ?? '' },
      payload: { title: req.body.title?.trim() || aiTitle || 'Album AI', design: rest },
    });
    return reply.code(res.statusCode).type('application/json').send(res.body);
  });
}
