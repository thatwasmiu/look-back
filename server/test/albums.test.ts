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
    expect(list[0].coverPage).toMatchObject({ layout: { background: 'paper-kraft' }, media: [] }); // first page stands in for the cover

    const r = await call('PATCH', `/api/albums/${b.id}`, { title: 'B2' });
    expect(r.statusCode).toBe(200);
    expect(r.json().title).toBe('B2');
  });

  it('fromAlbumId copies pages, papers and colors but empties every frame; unknown template → 404', async () => {
    const src = (await call('POST', '/api/albums', { title: 'Src' })).json();
    await call('PATCH', `/api/albums/${src.id}`, { backgroundEffect: 'snow', backgroundColor: 'sage' });
    const m = await t.pool.query(`insert into media (album_id, kind, status, variants) values ($1,'image','ready','{}') returning id`, [src.id]);
    const layout = { background: 'paper-grid', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 3, z: 1, frameStyle: 'heart', mediaId: m.rows[0].id, crop: { x: 0.2, y: 0.8, scale: 2 } },
      { type: 'text', id: 't1', x: 0.1, y: 0.7, w: 0.5, h: 0.1, rotation: 0, z: 2, text: 'Hi', font: 'patrick-hand', color: '#4a3b2c', size: 0.05 },
    ] };
    await t.pool.query('update pages set layout = $2 where album_id = $1', [src.id, JSON.stringify(layout)]);
    await t.pool.query(`insert into pages (album_id, position, layout) values ($1, 1, '{"background":"paper-kraft","elements":[]}')`, [src.id]);

    const res = await call('POST', '/api/albums', { title: 'Copy', fromAlbumId: src.id });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: 'Copy', backgroundEffect: 'snow', backgroundColor: 'sage', coverMediaId: null });
    const bundle = (await call('GET', `/api/albums/${res.json().id}`)).json();
    expect(bundle.media).toEqual([]);
    expect(bundle.pages.map((p: { layout: { background: string } }) => p.layout.background)).toEqual(['paper-grid', 'paper-kraft']);
    expect(bundle.pages[0].layout.elements[0]).toMatchObject({ frameStyle: 'heart', rotation: 3, mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } });
    expect(bundle.pages[0].layout.elements[1]).toMatchObject({ text: 'Hi' });

    const missing = await call('POST', '/api/albums', { title: 'X', fromAlbumId: '00000000-0000-4000-8000-000000000000' });
    expect(missing.statusCode).toBe(404);
  });

  it('design creates the pages and look it carries, frames emptied; a bad design is a 400', async () => {
    const page = { background: 'paper-dots', elements: [
      { type: 'frame', id: 'f1', x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1, frameStyle: 'polaroid', mediaId: 'lb-cover', crop: { x: 0.1, y: 0.1, scale: 3 } },
    ] };
    const res = await call('POST', '/api/albums', { title: 'Tpl', design: { backgroundColor: 'rose', backgroundEffect: 'stars', pages: [page, page] } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ backgroundColor: 'rose', backgroundEffect: 'stars' });
    const bundle = (await call('GET', `/api/albums/${res.json().id}`)).json();
    expect(bundle.pages).toHaveLength(2);
    expect(bundle.pages[1].layout.elements[0]).toMatchObject({ mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } });
    expect((await call('POST', '/api/albums', { title: 'Bad', design: { backgroundColor: 'neon', backgroundEffect: 'none', pages: [page] } })).statusCode).toBe(400);
    expect((await call('POST', '/api/albums', { title: 'Bad', design: { backgroundColor: 'rose', backgroundEffect: 'none', pages: [] } })).statusCode).toBe(400);
  });

  it('musicMediaId must be an audio file of the album; deleting it clears the album music', async () => {
    const a = (await call('POST', '/api/albums', { title: 'Music' })).json();
    expect(a.musicMediaId).toBeNull();
    const img = await t.pool.query(`insert into media (album_id, kind, status, variants) values ($1,'image','ready','{}') returning id`, [a.id]);
    const song = await t.pool.query(`insert into media (album_id, kind, status, variants) values ($1,'audio','ready','{}') returning id`, [a.id]);
    expect((await call('PATCH', `/api/albums/${a.id}`, { musicMediaId: img.rows[0].id })).statusCode).toBe(400);
    const ok = await call('PATCH', `/api/albums/${a.id}`, { musicMediaId: song.rows[0].id });
    expect(ok.json().musicMediaId).toBe(song.rows[0].id);
    expect((await call('DELETE', `/api/media/${song.rows[0].id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/albums/${a.id}`)).json().album.musicMediaId).toBeNull();
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

  it('background effect: defaults to none, PATCH sets it, bundle returns it, unknown → 400', async () => {
    const a = (await call('POST', '/api/albums', { title: 'Fx' })).json();
    expect(a.backgroundEffect).toBe('none');
    const p = await call('PATCH', `/api/albums/${a.id}`, { backgroundEffect: 'snow' });
    expect(p.statusCode).toBe(200);
    expect(p.json()).toMatchObject({ title: 'Fx', backgroundEffect: 'snow' });
    expect((await call('GET', `/api/albums/${a.id}`)).json().album.backgroundEffect).toBe('snow');
    expect((await call('PATCH', `/api/albums/${a.id}`, { backgroundEffect: 'lava' })).statusCode).toBe(400);
  });

  it('desk color: defaults to walnut, PATCH sets it, unknown → 400', async () => {
    const a = (await call('POST', '/api/albums', { title: 'Color' })).json();
    expect(a.backgroundColor).toBe('walnut');
    const p = await call('PATCH', `/api/albums/${a.id}`, { backgroundColor: 'ocean' });
    expect(p.json()).toMatchObject({ backgroundColor: 'ocean', backgroundEffect: 'none' });
    expect((await call('GET', `/api/albums/${a.id}`)).json().album.backgroundColor).toBe('ocean');
    expect((await call('PATCH', `/api/albums/${a.id}`, { backgroundColor: 'neon' })).statusCode).toBe(400);
  });
});
