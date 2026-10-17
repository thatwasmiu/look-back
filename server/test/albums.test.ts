import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const t = await testApp();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });

describe('albums', () => {
  it('requires session', async () => {
    expect((await t.app.inject('/api/albums')).statusCode).toBe(401);
  });

  it('create/list/rename', async () => {
    const a = await call('POST', '/api/albums', { title: 'A' });
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({ title: 'A', coverMediaId: null });
    await new Promise((r) => setTimeout(r, 5));
    const b = (await call('POST', '/api/albums', { title: 'B' })).json();

    const list = (await call('GET', '/api/albums')).json();
    expect(list.map((x: { title: string }) => x.title)).toEqual(['B', 'A']);
    expect(list[0]).toMatchObject({ pageCount: 1, coverThumb: null });

    const r = await call('PATCH', `/api/albums/${b.id}`, { title: 'B2' });
    expect(r.statusCode).toBe(200);
    expect(r.json().title).toBe('B2');
  });

  it('validates title and ids', async () => {
    expect((await call('POST', '/api/albums', { title: '' })).statusCode).toBe(400);
    expect((await call('GET', '/api/albums/not-a-uuid')).statusCode).toBe(400);
    expect((await call('GET', '/api/albums/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('bundle returns pages in order with media', async () => {
    const album = (await call('POST', '/api/albums', { title: 'Bundle' })).json();
    const p1 = (await call('POST', `/api/albums/${album.id}/pages`, { templateId: 'blank' })).json();
    const p2 = (await call('POST', `/api/albums/${album.id}/pages`, { templateId: 'blank' })).json();
    expect([p1.position, p2.position]).toEqual([1, 2]);
    await t.pool.query(
      `insert into media (album_id, kind, status, blur_data_url, variants) values ($1,'image','ready','data:x', $2)`,
      [album.id, JSON.stringify({ original: 'x/original.jpg', thumb: 'x/thumb.webp' })],
    );
    const bundle = (await call('GET', `/api/albums/${album.id}`)).json();
    expect(bundle.album.id).toBe(album.id);
    expect(bundle.pages.map((p: { position: number }) => p.position)).toEqual([0, 1, 2]);
    expect(bundle.media).toHaveLength(1);
    expect(bundle.media[0]).toMatchObject({ blurDataUrl: 'data:x', variants: { thumb: 'x/thumb.webp' } });
  });

  it('cover thumb in list; delete album removes rows and media dirs', async () => {
    const album = (await call('POST', '/api/albums', { title: 'Del' })).json();
    const { rows } = await t.pool.query(
      `insert into media (album_id, kind, status, variants) values ($1,'image','ready',$2) returning id`,
      [album.id, JSON.stringify({ original: 'o', thumb: 'k/thumb.webp' })],
    );
    const mid = rows[0].id;
    const dir = join(t.config.mediaDir, mid);
    mkdirSync(dir);
    writeFileSync(join(dir, 'thumb.webp'), 'x');

    const patched = await call('PATCH', `/api/albums/${album.id}`, { coverMediaId: mid });
    expect(patched.json().coverMediaId).toBe(mid);
    const sum = (await call('GET', '/api/albums')).json().find((x: { id: string }) => x.id === album.id);
    expect(sum.coverThumb).toBe('k/thumb.webp');

    expect((await call('DELETE', `/api/albums/${album.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/albums/${album.id}`)).statusCode).toBe(404);
    expect(existsSync(dir)).toBe(false);
    expect((await t.pool.query('select 1 from media where id=$1', [mid])).rowCount).toBe(0);
  });

  it('a video cover shows its poster in the list', async () => {
    const album = (await call('POST', '/api/albums', { title: 'Vid' })).json();
    const { rows } = await t.pool.query(
      `insert into media (album_id, kind, status, variants) values ($1,'video','ready',$2) returning id`,
      [album.id, JSON.stringify({ original: 'o', poster: 'v/poster.webp', hls: 'v/hls/master.m3u8' })],
    );
    await call('PATCH', `/api/albums/${album.id}`, { coverMediaId: rows[0].id });
    const sum = (await call('GET', '/api/albums')).json().find((x: { id: string }) => x.id === album.id);
    expect(sum.coverThumb).toBe('v/poster.webp');
  });
});
