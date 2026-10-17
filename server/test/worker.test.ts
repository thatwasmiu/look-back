import { describe, it, expect, afterAll } from 'vitest';
import { copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { testApp } from './helpers';
import { runProcessMedia } from '../src/processing/run';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function setup(mime: string, name: string, src: Buffer | string) {
  const t = await testApp();
  const album = await t.pool.query(`insert into albums (title) values ('a') returning id`);
  const m = await t.pool.query(
    `insert into media (album_id, kind, status, original_name, mime) values ($1,'image','processing',$2,$3) returning id`,
    [album.rows[0].id, name, mime]);
  const id: string = m.rows[0].id;
  const uploadPath = join(t.config.uploadDir, id);
  if (typeof src === 'string') await copyFile(src, uploadPath); else await writeFile(uploadPath, src);
  await writeFile(uploadPath + '.json', '{}');
  return { t, id, uploadPath };
}
const row = async (t: Awaited<ReturnType<typeof testApp>>, id: string) =>
  (await t.pool.query('select * from media where id=$1', [id])).rows[0];

describe('runProcessMedia', () => {
  const apps: Awaited<ReturnType<typeof testApp>>[] = [];
  afterAll(async () => { for (const t of apps) { await t.app.close(); await t.pool.end(); } });

  it('image job -> ready, variants set, upload files removed', async () => {
    const { t, id, uploadPath } = await setup('image/jpeg', 'x.jpg', join(fx, 'rotated.jpg'));
    apps.push(t);
    await runProcessMedia({ mediaId: id, uploadPath }, t.pool, t.config);
    const r = await row(t, id);
    expect(r.status).toBe('ready');
    expect([r.width, r.height]).toEqual([300, 400]);
    expect(r.variants.original).toBe(`${id}/original.jpg`);
    expect(r.blur_data_url).toMatch(/^data:image\/webp/);
    expect(existsSync(uploadPath)).toBe(false);
    expect(existsSync(uploadPath + '.json')).toBe(false);
  });

  it('corrupt file -> failed, error set, no media dir left', async () => {
    const { t, id, uploadPath } = await setup('image/jpeg', 'x.jpg', randomBytes(2048));
    apps.push(t);
    await runProcessMedia({ mediaId: id, uploadPath }, t.pool, t.config);
    const r = await row(t, id);
    expect(r.status).toBe('failed');
    expect(r.error.length).toBeGreaterThan(0);
    expect(existsSync(join(t.config.mediaDir, id))).toBe(false);
    expect(existsSync(uploadPath)).toBe(false);
    expect(existsSync(uploadPath + '.json')).toBe(false);
  });

  it('unknown mime -> failed "unsupported type"', async () => {
    const { t, id, uploadPath } = await setup('application/pdf', 'x.pdf', randomBytes(64));
    apps.push(t);
    await runProcessMedia({ mediaId: id, uploadPath }, t.pool, t.config);
    const r = await row(t, id);
    expect([r.status, r.error]).toEqual(['failed', 'unsupported type']);
  });

  it('row deleted meanwhile -> upload files removed, no throw', async () => {
    const { t, id, uploadPath } = await setup('image/jpeg', 'x.jpg', join(fx, 'rotated.jpg'));
    apps.push(t);
    await t.pool.query('delete from media where id=$1', [id]);
    await runProcessMedia({ mediaId: id, uploadPath }, t.pool, t.config);
    expect(existsSync(uploadPath)).toBe(false);
    expect(existsSync(join(t.config.mediaDir, id))).toBe(false);
  });
});
