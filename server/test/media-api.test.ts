import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const t = await testApp();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });

const frame = (id: string, mediaId: string | null) => ({
  id, type: 'frame', x: 0.1, y: 0.1, w: 0.4, h: 0.4, rotation: 0, z: 0,
  frameStyle: 'plain', mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
});
const mkMedia = async (album: string) =>
  (await t.pool.query(`insert into media (album_id, kind, status) values ($1,'image','ready') returning id`, [album])).rows[0].id as string;

describe('media api', () => {
  it('GET /api/media/:id', async () => {
    const a = (await call('POST', '/api/albums', { title: 'm' })).json();
    const { rows } = await t.pool.query(
      `insert into media (album_id, kind, status, width, height, blur_data_url, variants) values ($1,'image','ready',10,20,'data:b',$2) returning id`,
      [a.id, JSON.stringify({ original: 'o' })],
    );
    const r = await call('GET', `/api/media/${rows[0].id}`);
    expect(r.json()).toEqual({
      id: rows[0].id, albumId: a.id, kind: 'image', status: 'ready', width: 10, height: 20,
      durationSec: null, blurDataUrl: 'data:b', variants: { original: 'o' }, error: null,
    });
    expect((await call('GET', '/api/media/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await call('GET', '/api/media/zzz')).statusCode).toBe(400);
  });

  it('delete media nulls frames in all pages, clears cover, removes files', async () => {
    const a = (await call('POST', '/api/albums', { title: 'm' })).json();
    await call('POST', `/api/albums/${a.id}/pages`, { templateId: 'blank' });
    const mid = await mkMedia(a.id);
    const keep = await mkMedia(a.id);
    const dir = join(t.config.mediaDir, mid);
    mkdirSync(dir);
    writeFileSync(join(dir, 'thumb.webp'), 'x');
    await call('PATCH', `/api/albums/${a.id}`, { coverMediaId: mid });

    const pages = (await call('GET', `/api/albums/${a.id}`)).json().pages;
    await call('PUT', `/api/pages/${pages[0].id}`, { layout: { background: 'paper-cream', elements: [frame('a', mid), frame('b', keep)] } });
    await call('PUT', `/api/pages/${pages[1].id}`, { layout: { background: 'paper-cream', elements: [frame('c', mid)] } });

    expect((await call('DELETE', `/api/media/${mid}`)).statusCode).toBe(204);

    const b = (await call('GET', `/api/albums/${a.id}`)).json();
    expect(b.album.coverMediaId).toBeNull();
    expect(b.media.map((m: { id: string }) => m.id)).toEqual([keep]);
    const els = b.pages.flatMap((p: { layout: { elements: { id: string; mediaId: string | null }[] } }) => p.layout.elements);
    expect(els.map((e: { id: string; mediaId: string | null }) => [e.id, e.mediaId])).toEqual([['a', null], ['b', keep], ['c', null]]);
    expect(existsSync(dir)).toBe(false);
    expect((await call('DELETE', `/api/media/${mid}`)).statusCode).toBe(404);
  });
});
