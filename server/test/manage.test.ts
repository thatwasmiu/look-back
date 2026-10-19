import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bucketClient } from '../src/objectStore.js';
import { restoreBackup } from '../src/restore.js';
import { testApp } from './helpers.js';
import { s3Available, testBucket } from './s3.js';

const t = await testApp();
await t.login(); // password hashing is slow on purpose: once, outside the tests' time limit
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});
const owner = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });

async function setup() {
  const a = (await owner('POST', '/api/albums', { title: 'Đà Lạt' })).json();
  const ids: string[] = [];
  for (const [size, status] of [[100, 'ready'], [50, 'ready'], [0, 'failed']] as const) {
    const { rows } = await t.pool.query(`insert into media (album_id, kind, status, variants) values ($1, 'image', $2, $3) returning id`,
      [a.id, status, JSON.stringify({ thumb: 'x/thumb.webp' })]);
    ids.push(rows[0].id);
    if (size) {
      await mkdir(join(t.config.mediaDir, rows[0].id), { recursive: true });
      await writeFile(join(t.config.mediaDir, rows[0].id, 'display.webp'), Buffer.alloc(size, 1));
    }
  }
  const page = (await owner('GET', `/api/albums/${a.id}`)).json().pages[0];
  const layout = { background: 'paper-cream', elements: [
    { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: ids[0], crop: { x: 0.5, y: 0.5, scale: 1 } },
  ] };
  expect((await owner('PUT', `/api/pages/${page.id}`, { layout })).statusCode).toBe(200);
  return { albumId: a.id as string, ids };
}

describe('manage (hidden owner page)', () => {
  it('needs the owner session', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/manage' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/manage/backup' })).statusCode).toBe(401);
  });

  it('lists every file with its size and whether a page / cover / music uses it, plus disk and totals', async () => {
    const { ids } = await setup();
    const r = (await owner('GET', '/api/manage')).json();
    const f = (id: string) => r.files.find((x: { id: string }) => x.id === id);
    expect(f(ids[0])).toMatchObject({ albumTitle: 'Đà Lạt', bytes: 100, used: true, status: 'ready', thumb: 'x/thumb.webp' });
    expect(f(ids[1])).toMatchObject({ bytes: 50, used: false });
    expect(f(ids[2])).toMatchObject({ bytes: 0, used: false, status: 'failed' });
    expect(r.mediaBytes).toBe(150);
    expect(r.disk.total).toBeGreaterThan(r.disk.free);
    expect(r.dbBytes).toBeGreaterThan(0);
  });

  it('backup is one tar (db.json + media/); restore brings back rows and files after everything is gone', async () => {
    await t.pool.query('truncate albums, pages, media cascade');
    await rm(t.config.mediaDir, { recursive: true, force: true });
    await mkdir(t.config.mediaDir);
    const { albumId, ids } = await setup();
    const res = await owner('GET', '/api/manage/backup');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="lookback-backup-\d{4}-\d{2}-\d{2}\.tar"/);
    const dir = mkdtempSync(join(tmpdir(), 'bk-'));
    const tarFile = join(dir, 'b.tar');
    await writeFile(tarFile, res.rawPayload);
    const listing = execFileSync('tar', ['-t', '-f', tarFile]).toString();
    expect(listing).toContain('db.json');
    expect(listing).toContain(`${ids[0]}/display.webp`);
    execFileSync('tar', ['-x', '-f', tarFile, '-C', dir, 'db.json']);
    expect(JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8')).tables.media).toHaveLength(3);

    // Disaster: album deleted, files gone.
    expect((await owner('DELETE', `/api/albums/${albumId}`)).statusCode).toBe(204);
    await rm(join(t.config.mediaDir, ids[0]), { recursive: true, force: true });
    expect(await restoreBackup(t.pool, t.config.mediaDir, tarFile)).toEqual({ albums: 1, media: 3 });
    const back = (await owner('GET', `/api/albums/${albumId}`)).json();
    expect(back.album.title).toBe('Đà Lạt');
    expect(back.pages[0].layout.elements[0].mediaId).toBe(ids[0]);
    expect(existsSync(join(t.config.mediaDir, ids[0], 'display.webp'))).toBe(true);
    expect((await owner('GET', '/api/manage')).json().mediaBytes).toBe(150);
  });
});

describe.skipIf(!s3Available)('backup with bucket files', () => {
  async function bucketMedia(name: string) {
    const b = await testBucket(name);
    const loc = (await owner('POST', '/api/manage/locations', { name, ...b })).json().id as string;
    const a = (await owner('POST', '/api/albums', { title: `bk ${name}` })).json().id as string;
    const id = (await t.pool.query(`insert into media (album_id, kind, status, storage_id, bytes) values ($1, 'image', 'ready', $2, 5) returning id`, [a, loc])).rows[0].id as string;
    await bucketClient(b).put(`${id}/display.webp`, Buffer.from('cloud'), 5);
    return { b, loc, id };
  }
  async function backupTar() {
    const res = await owner('GET', '/api/manage/backup');
    expect(res.statusCode).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), 'bk-'));
    const file = join(dir, 'b.tar');
    await writeFile(file, res.rawPayload);
    return { dir, file, raw: res.rawPayload, listing: execFileSync('tar', ['-t', '-f', file]).toString() };
  }

  it('backup contains bucket files and no secrets', async () => {
    const m = await bucketMedia('bk-a');
    const { dir, file, raw, listing } = await backupTar();
    expect(listing).toContain(`media/${m.id}/display.webp`);
    expect(listing).not.toContain('MISSING.txt');
    expect(raw.includes(Buffer.from(m.b.secretAccessKey))).toBe(false);
    execFileSync('tar', ['-x', '-f', file, '-C', dir, 'db.json']);
    const db = JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
    expect(db.tables.storage_locations.find((l: { id: string }) => l.id === m.loc).secret_enc).toBeNull();
  });

  it('unreadable bucket → MISSING.txt, backup still completes', async () => {
    const m = await bucketMedia('bk-b');
    await t.pool.query(`update storage_locations set bucket = 'no-such-bucket-here' where id = $1`, [m.loc]);
    const { dir, file, listing } = await backupTar();
    expect(listing).toContain('MISSING.txt');
    execFileSync('tar', ['-x', '-f', file, '-C', dir, 'MISSING.txt']);
    expect(readFileSync(join(dir, 'MISSING.txt'), 'utf8')).toContain(m.id);
  });

  it('restore puts everything on the VPS and asks for the keys again', async () => {
    await t.pool.query('truncate albums, pages, media, pending_deletes, storage_locations cascade');
    const m = await bucketMedia('bk-c');
    const { file } = await backupTar();
    await restoreBackup(t.pool, t.config.mediaDir, file);
    expect((await t.pool.query('select storage_id from media where id = $1', [m.id])).rows[0].storage_id).toBeNull();
    expect(readFileSync(join(t.config.mediaDir, m.id, 'display.webp'), 'utf8')).toBe('cloud');
    expect((await t.pool.query('select check_status, secret_enc from storage_locations where id = $1', [m.loc])).rows[0])
      .toEqual({ check_status: 'needs-keys', secret_enc: null });
  });
});
