import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const t = await testApp();
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });

const frame = (id: string, mediaId: string | null) => ({
  id, type: 'frame', x: 0.1, y: 0.1, w: 0.4, h: 0.4, rotation: 0, z: 0,
  frameStyle: 'plain', mediaId, crop: { x: 0.5, y: 0.5, scale: 1 },
});

const newAlbum = async () => (await call('POST', '/api/albums', { title: 't' })).json() as { id: string };
const bundle = async (id: string) => (await call('GET', `/api/albums/${id}`)).json();
const addPage = (albumId: string, extra: object = {}) =>
  call('POST', `/api/albums/${albumId}/pages`, { templateId: 'blank', ...extra });
const mkMedia = async (album: string) =>
  (await t.pool.query(`insert into media (album_id, kind, status) values ($1,'image','ready') returning id`, [album])).rows[0].id as string;

describe('pages', () => {
  it('add page appends; unknown template 400', async () => {
    const a = await newAlbum();
    const r = await addPage(a.id);
    expect(r.statusCode).toBe(201);
    expect(r.json().position).toBe(1);
    expect((await addPage(a.id, { templateId: 'nope' })).statusCode).toBe(400);
  });

  it('add page at position shifts others', async () => {
    const a = await newAlbum();
    const p = (await addPage(a.id, { position: 0 })).json();
    const b = await bundle(a.id);
    expect(b.pages[0].id).toBe(p.id);
    expect(b.pages.map((x: { position: number }) => x.position)).toEqual([0, 1]);
  });

  it('save layout: valid, invalid element, foreign media', async () => {
    const a = await newAlbum();
    const other = await newAlbum();
    const page = (await bundle(a.id)).pages[0];
    const mine = await mkMedia(a.id);
    const theirs = await mkMedia(other.id);

    const ok = await call('PUT', `/api/pages/${page.id}`, { layout: { background: 'paper-kraft', elements: [frame('f1', mine)] } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().layout.elements[0].mediaId).toBe(mine);

    const bad = await call('PUT', `/api/pages/${page.id}`, { layout: { background: 'paper-kraft', elements: [{ id: 'x', type: 'bogus' }] } });
    expect(bad.statusCode).toBe(400);

    const foreign = await call('PUT', `/api/pages/${page.id}`, { layout: { background: 'paper-kraft', elements: [frame('f1', theirs)] } });
    expect(foreign.statusCode).toBe(400);
    expect((await call('PUT', '/api/pages/nope', { layout: {} })).statusCode).toBe(400);
  });

  it('delete page compacts positions', async () => {
    const a = await newAlbum();
    await addPage(a.id);
    await addPage(a.id);
    await addPage(a.id);
    const pages = (await bundle(a.id)).pages;
    expect((await call('DELETE', `/api/pages/${pages[1].id}`)).statusCode).toBe(204);
    const after = (await bundle(a.id)).pages;
    expect(after.map((p: { position: number }) => p.position)).toEqual([0, 1, 2]);
    expect(after.map((p: { id: string }) => p.id)).toEqual([pages[0].id, pages[2].id, pages[3].id]);
  });

  it('page-order: wrong set 400, valid reorders', async () => {
    const a = await newAlbum();
    await addPage(a.id);
    await addPage(a.id);
    const ids = (await bundle(a.id)).pages.map((p: { id: string }) => p.id) as string[];
    const url = `/api/albums/${a.id}/page-order`;
    expect((await call('PUT', url, { pageIds: ids.slice(1) })).statusCode).toBe(400);
    expect((await call('PUT', url, { pageIds: [...ids, ids[0]] })).statusCode).toBe(400);
    expect((await call('PUT', url, { pageIds: [ids[0], ids[1], '00000000-0000-4000-8000-000000000000'] })).statusCode).toBe(400);
    const reversed = [...ids].reverse();
    expect((await call('PUT', url, { pageIds: reversed })).statusCode).toBe(204);
    expect((await bundle(a.id)).pages.map((p: { id: string }) => p.id)).toEqual(reversed);
  });
});
