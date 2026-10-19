import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
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
      key: { type: 'string', minLength: 20, maxLength: 200, pattern: '^\\S+$' },
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
      await generateJson(config, s.key, s.model, 'Reply with {"ok": true}.', { type: 'object', properties: { ok: { type: 'boolean' } } });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: aiErrorMessage(e) };
    }
  });
}
