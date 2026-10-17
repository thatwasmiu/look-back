import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import type { Config } from './config.js';

// config/pool/boss are consumed by routes added in later tasks.
export async function buildApp(_config: Config, _pool: pg.Pool, _boss: PgBoss | null): Promise<FastifyInstance> {
  const app = Fastify();
  app.get('/api/health', async () => ({ ok: true }));
  return app;
}
