import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDriveBackup } from '../src/driveBackup.js';
import { encryptSecret } from '../src/secrets.js';
import { startFakeGoogle } from './fakeGoogle.js';
import { testApp } from './helpers.js';
import { s3Available } from './s3.js';

const g = await startFakeGoogle();
const t = await testApp({ googleClientId: 'cid', googleClientSecret: 'cs', googleOauthBase: g.base, googleAuthBase: g.base, googleApiBase: g.base });
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
  await g.close();
});

const row = async () => (await t.pool.query('select * from drive_backup where id = 1')).rows[0];
const backups = () => [...g.files].filter(([, f]) => f.name.startsWith('lookback-backup-') && !f.trashed);
const run = () => runDriveBackup(t.pool, t.config);

beforeEach(async () => {
  await t.pool.query('truncate albums, pages, media, pending_deletes, storage_locations, drive_backup cascade');
  for (const [id, f] of g.files) if (f.name.startsWith('lookback-backup-')) g.files.delete(id);
  await t.pool.query(`insert into drive_backup (id, account_email, refresh_enc) values (1, 'owner@example.com', $1)`,
    [encryptSecret('rt-good', t.config.sessionSecret)]);
  const a = (await t.pool.query(`insert into albums (title) values ('Đà Lạt') returning id`)).rows[0].id;
  const m = (await t.pool.query(`insert into media (album_id, kind, status) values ($1, 'image', 'ready') returning id`, [a])).rows[0].id;
  await mkdir(join(t.config.mediaDir, m), { recursive: true });
  await writeFile(join(t.config.mediaDir, m, 'display.webp'), Buffer.alloc(5000, 1));
});

describe('Google Drive backup job', () => {
  it('first run uploads one file and records ok', async () => {
    await run();
    const r = await row();
    expect(r).toMatchObject({ status: 'ok', message: null });
    const files = backups();
    expect(files).toHaveLength(1);
    const [id, f] = files[0];
    expect(f.name).toMatch(/^lookback-backup-\d{4}-\d{2}-\d{2}\.tar$/);
    expect(f.parents).toEqual([r.folder_id]);
    expect(Number(r.last_bytes)).toBe(f.data.length);
    expect(r.complete_file_id).toBe(id);
    const tarFile = join(mkdtempSync(join(tmpdir(), 'drive-')), 'b.tar');
    writeFileSync(tarFile, f.data);
    expect(execFileSync('tar', ['-t', '-f', tarFile]).toString()).toContain('db.json');
  });

  it('a second complete run replaces the first', async () => {
    await run();
    await run();
    const files = backups();
    expect(files).toHaveLength(1);
    expect((await row()).complete_file_id).toBe(files[0][0]);
  });

  it('revoked token: needs reconnect, Drive untouched', async () => {
    await run();
    const before = backups().map(([id]) => id);
    await t.pool.query('update drive_backup set refresh_enc = $1', [encryptSecret('rt-revoked', t.config.sessionSecret)]);
    g.revokeToken('rt-revoked');
    await run();
    expect(await row()).toMatchObject({ status: 'needs-reconnect', message: 'Quyền truy cập Drive đã hết — bấm Kết nối lại.' });
    expect(backups().map(([id]) => id)).toEqual(before);
  });

  it('quota exceeded mid-upload keeps the old backup', async () => {
    await run();
    const before = backups().map(([id]) => id);
    g.failNextChunkWith('storageQuotaExceeded');
    await run();
    const r = await row();
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/^Drive không đủ chỗ: cần khoảng \d+\.\d GB trống\.$/);
    expect(backups().map(([id]) => id)).toEqual(before);
    expect(r.finished_at).not.toBeNull();
  });

  it('stale running state does not block; a fresh one does', async () => {
    await t.pool.query(`update drive_backup set status = 'running', started_at = now() - interval '10 minutes'`);
    await run();
    expect((await row()).status).toBe('running');
    expect(backups()).toHaveLength(0);
    await t.pool.query(`update drive_backup set started_at = now() - interval '5 hours'`);
    await run();
    expect((await row()).status).toBe('ok');
  });

  it('missing folder is recreated', async () => {
    await run();
    const first = (await row()).folder_id;
    g.files.get(first)!.trashed = true;
    await run();
    const r = await row();
    expect(r.status).toBe('ok');
    expect(r.folder_id).not.toBe(first);
  });

  it.skipIf(!s3Available)('incomplete run keeps the last complete backup', async () => {
    await run();
    const complete = (await row()).complete_file_id;
    const loc = (await t.pool.query(`insert into storage_locations (name, kind, endpoint, region, bucket, access_key_id, secret_enc)
      values ('Gone', 's3', $1, 'us-east-1', 'no-such-bucket-here', $2, $3) returning id`,
    [process.env.S3_TEST_ENDPOINT, process.env.S3_TEST_KEY, encryptSecret(process.env.S3_TEST_SECRET!, t.config.sessionSecret)])).rows[0].id;
    const a = (await t.pool.query('select id from albums limit 1')).rows[0].id;
    const m = (await t.pool.query(`insert into media (album_id, kind, status, storage_id) values ($1, 'image', 'ready', $2) returning id`, [a, loc])).rows[0].id;
    await run();
    const r = await row();
    expect(r.status).toBe('incomplete');
    expect(r.message).toBe('Thiếu 1 file (nơi lưu đang lỗi) — vẫn giữ bản đầy đủ trước đó.');
    expect(backups().map(([id]) => id)).toContain(complete);
    expect(backups()).toHaveLength(2);
    await run(); // still incomplete: the older incomplete one is replaced, the complete one stays
    expect(backups()).toHaveLength(2);
    await t.pool.query('delete from media where id = $1', [m]);
    await run(); // complete again → only the new one
    expect(backups()).toHaveLength(1);
    expect((await row()).status).toBe('ok');
  });
});
