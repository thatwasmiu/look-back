import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import { registerAlbums } from './albums.js';
import { registerAuth } from './auth.js';
import type { Config } from './config.js';
import { registerLocations } from './locations.js';
import { registerManage } from './manage.js';
import { registerRemoteMedia } from './remoteMedia.js';
import { registerMedia } from './media.js';
import { registerPages } from './pages.js';
import { registerShare } from './share.js';
import { registerUploads } from './uploads.js';

export async function buildApp(config: Config, pool: pg.Pool, boss: PgBoss): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: config.trustProxy });
  registerAuth(app, config, pool);
  app.get('/api/health', async () => ({ ok: true }));
  registerAlbums(app, pool, config, boss);
  registerShare(app, pool, config);
  registerManage(app, pool, config, boss);
  registerLocations(app, pool, config);
  registerRemoteMedia(app, pool, config);
  registerPages(app, pool);
  registerMedia(app, pool, config);
  registerUploads(app, config, pool, boss);
  return app;
}
