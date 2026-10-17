import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import { registerAlbums } from './albums.js';
import { registerAuth } from './auth.js';
import type { Config } from './config.js';
import { registerMedia } from './media.js';
import { registerPages } from './pages.js';

// boss is consumed by routes added in later tasks.
export async function buildApp(config: Config, pool: pg.Pool, _boss: PgBoss | null): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: config.trustProxy });
  registerAuth(app, config);
  app.get('/api/health', async () => ({ ok: true }));
  registerAlbums(app, pool, config);
  registerPages(app, pool);
  registerMedia(app, pool, config);
  return app;
}
