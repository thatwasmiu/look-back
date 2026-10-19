import { afterAll, expect, it } from 'vitest';
import { backupFileName, buildBackup } from '../src/backup.js';
import { testApp } from './helpers.js';

const t = await testApp();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

it('done reports bytes equal to the stream length and no missing files', async () => {
  const { stream, done } = buildBackup(t.pool, t.config);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const buf = Buffer.concat(chunks);
  expect(buf.length).toBeGreaterThan(0);
  expect((await done).bytes).toBe(buf.length);
  expect((await done).missing).toEqual([]);
});

it('backup file name uses the UTC date', () => {
  expect(backupFileName(new Date('2026-10-19T10:00:00Z'))).toBe('lookback-backup-2026-10-19.tar');
});
