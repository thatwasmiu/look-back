import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import { registerAuth } from './auth.js';
import type { Config } from './config.js';

// pool/boss are consumed by routes added in later tasks.
export async function buildApp(config: Config, _pool: pg.Pool, _boss: PgBoss | null): Promise<FastifyInstance> {
  const app = Fastify();
  registerAuth(app, config);
  app.get('/api/health', async () => ({ ok: true }));
  return app;
}
