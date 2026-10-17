import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

export async function testApp() {
  const config: Config = {
    port: 0,
    databaseUrl: process.env.DATABASE_URL!,
    ownerPasswordHash: 'scrypt$00$00',
    sessionSecret: 'test-secret',
    mediaDir: mkdtempSync(join(tmpdir(), 'media-')),
    uploadDir: mkdtempSync(join(tmpdir(), 'upload-')),
    maxUploadBytes: 1024 * 1024,
    videoRenditions: [720],
    ffmpegPreset: 'veryfast',
    cookieSecure: false,
  };
  const pool = createPool(config.databaseUrl);
  await migrate(pool);
  await pool.query('truncate albums, pages, media cascade');
  const app = await buildApp(config, pool, null);
  await app.ready();
  return {
    app,
    pool,
    config,
    async login(): Promise<string> {
      throw new Error('login not implemented until auth task');
    },
  };
}
