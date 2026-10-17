import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import type { Config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const TEST_PASSWORD = 'test-password';

export async function testApp() {
  const config: Config = {
    port: 0,
    databaseUrl: process.env.DATABASE_URL!,
    ownerPasswordHash: await hashPassword(TEST_PASSWORD),
    sessionSecret: 'test-secret',
    mediaDir: mkdtempSync(join(tmpdir(), 'media-')),
    uploadDir: mkdtempSync(join(tmpdir(), 'upload-')),
    maxUploadBytes: 1024 * 1024,
    videoRenditions: [720],
    ffmpegPreset: 'veryfast',
    cookieSecure: false,
    trustProxy: false,
  };
  const pool = createPool(config.databaseUrl);
  await migrate(pool);
  await pool.query('truncate albums, pages, media cascade');
  const app = await buildApp(config, pool, null);
  await app.ready();
  let cookie: string | undefined;
  return {
    app,
    pool,
    config,
    password: TEST_PASSWORD,
    async login(): Promise<string> {
      if (cookie) return cookie;
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: TEST_PASSWORD } });
      if (res.statusCode !== 204) throw new Error(`test login failed: ${res.statusCode}`);
      cookie = String(res.headers['set-cookie']).split(';')[0];
      return cookie;
    },
  };
}
