import { afterAll, describe, expect, it } from 'vitest';
import type { PageLayout } from '@scrapbook/shared';
import { guestEditAllowed } from '../src/editLinks.js';
import { testApp } from './helpers.js';

const t = await testApp();
// Real HTTP for tus (light-my-request stalls on hijacked bodies).
const base = await t.app.listen({ port: 0, host: '127.0.0.1' });
afterAll(async () => {
  await t.app.close();
  await t.pool.end();
});

const owner = async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: { cookie: await t.login() } });
const as = (cookie: string | undefined, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as object, headers: cookie ? { cookie } : {} });
const sidOf = (res: { headers: Record<string, unknown> }) =>
  String([res.headers['set-cookie']].flat().find((c) => String(c).startsWith('sid=')) ?? '').split(';')[0];

const frame = (id: string, mediaId: string | null) => ({ type: 'frame', id, x: 0.1, y: 0.1, w: 0.5, h: 0.4, rotation: 0, z: 1,
  frameStyle: 'polaroid', mediaId, crop: { x: 0.5, y: 0.5, scale: 1 } });
const text = (id: string, t: string) => ({ type: 'text', id, x: 0.1, y: 0.7, w: 0.6, h: 0.1, rotation: 0, z: 2, text: t,
  font: 'patrick-hand', color: '#111111', size: 0.04, textStyle: 'speech', tail: 'bl' });
const baseLayout = (): PageLayout => ({ background: 'paper-cream', elements: [frame('f1', null), text('t1', 'Chào')] } as PageLayout);

async function albumWithPage() {
  const a = (await owner('POST', '/api/albums', { title: 'Đi chơi' })).json();
  const p = (await owner('POST', `/api/albums/${a.id}/pages`, { templateId: 'blank' })).json();
  await t.app.inject({ method: 'PUT', url: `/api/pages/${p.id}`, payload: { layout: baseLayout() }, headers: { cookie: await t.login() } });
  const m = (await t.pool.query(`insert into media (album_id, kind, status, mime) values ($1, 'image', 'ready', 'image/jpeg') returning id`, [a.id])).rows[0].id as string;
  return { albumId: a.id as string, pageId: p.id as string, mediaId: m };
}
async function guestFor(albumId: string) {
  const link = (await owner('POST', `/api/albums/${albumId}/edit-link`)).json();
  const open = await as(undefined, 'GET', `/api/edit/${link.editToken}`);
  expect(open.statusCode).toBe(200);
  return { token: link.editToken as string, cookie: sidOf(open), bundle: open.json() };
}

describe('edit links (owner)', () => {
  it('creates an 8-hour link, repeats it while valid, and revokes it', async () => {
    const { albumId } = await albumWithPage();
    const r1 = await owner('POST', `/api/albums/${albumId}/edit-link`);
    expect(r1.statusCode).toBe(200);
    const { editToken, expiresAt } = r1.json();
    expect(editToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hours = (new Date(expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);
    expect((await owner('POST', `/api/albums/${albumId}/edit-link`)).json().editToken).toBe(editToken);
    // The owner picks the hours (1–168): same link, new expiry.
    const r2 = (await owner('POST', `/api/albums/${albumId}/edit-link`, { hours: 24 })).json();
    expect(r2.editToken).toBe(editToken);
    expect((new Date(r2.expiresAt).getTime() - Date.now()) / 3600_000).toBeGreaterThan(23.9);
    for (const hours of [0, 169, 1.5]) expect((await owner('POST', `/api/albums/${albumId}/edit-link`, { hours })).statusCode).toBe(400);
    const back = (await owner('POST', `/api/albums/${albumId}/edit-link`, { hours: 8 })).json();
    const bundle = (await owner('GET', `/api/albums/${albumId}`)).json();
    expect(bundle.album).toMatchObject({ editToken, editExpiresAt: back.expiresAt });
    expect((await owner('DELETE', `/api/albums/${albumId}/edit-link`)).statusCode).toBe(204);
    expect((await as(undefined, 'GET', `/api/edit/${editToken}`)).statusCode).toBe(404);
    expect((await owner('POST', `/api/albums/${albumId}/edit-link`)).json().editToken).not.toBe(editToken); // a new one
  });

  it('a view-only share link never carries the edit code', async () => {
    const { albumId } = await albumWithPage();
    await owner('POST', `/api/albums/${albumId}/edit-link`);
    const share = (await owner('POST', `/api/albums/${albumId}/share`)).json().shareToken;
    const pub = (await as(undefined, 'GET', `/api/share/${share}`)).json();
    expect(pub.album).toMatchObject({ editToken: null, editExpiresAt: null });
  });

  it('only the owner manages links', async () => {
    const { albumId } = await albumWithPage();
    expect((await as(undefined, 'POST', `/api/albums/${albumId}/edit-link`)).statusCode).toBe(401);
    const g = await guestFor(albumId);
    expect((await as(g.cookie, 'POST', `/api/albums/${albumId}/edit-link`)).statusCode).toBe(401);
    expect((await as(g.cookie, 'DELETE', `/api/albums/${albumId}/edit-link`)).statusCode).toBe(401);
  });
});

describe('edit links (guest)', () => {
  it('opening the link gives that album, without its share or edit codes', async () => {
    const { albumId, pageId } = await albumWithPage();
    const g = await guestFor(albumId);
    expect(g.cookie).toMatch(/^sid=/);
    expect(g.bundle.album).toMatchObject({ id: albumId, shareToken: null, editToken: null });
    expect(g.bundle.pages.map((p: { id: string }) => p.id)).toContain(pageId);
    expect((await as(undefined, 'GET', '/api/edit/not-a-token')).statusCode).toBe(404);
  });

  it('may put a photo in a frame, crop it and change text (a bubble may grow); nothing else', async () => {
    const { albumId, pageId, mediaId } = await albumWithPage();
    const g = await guestFor(albumId);
    const save = (layout: unknown) => as(g.cookie, 'PUT', `/api/pages/${pageId}`, { layout });
    const ok = baseLayout();
    ok.elements[0] = { ...frame('f1', mediaId), crop: { x: 0.3, y: 0.6, scale: 1.4 } } as never;
    ok.elements[1] = { ...text('t1', 'Đi làm thôi, muộn rồi!'), h: 0.16 } as never;
    expect((await save(ok)).statusCode).toBe(200);
    expect((await save(baseLayout())).statusCode).toBe(200); // emptying a frame and resetting text is fine

    const moved = baseLayout(); (moved.elements[0] as { x: number }).x = 0.3;
    const added = baseLayout(); added.elements.push(frame('f2', null) as never);
    const removed = baseLayout(); removed.elements.pop();
    const restyled = baseLayout(); (restyled.elements[1] as { color: string }).color = '#ff0000';
    const paper = { ...baseLayout(), background: 'paper-kraft' };
    const hidden = { ...baseLayout(), hidden: true };
    for (const bad of [moved, added, removed, restyled, paper, hidden]) expect((await save(bad)).statusCode).toBe(403);

    const other = await albumWithPage();
    const foreign = baseLayout(); (foreign.elements[0] as { mediaId: string }).mediaId = other.mediaId;
    expect((await save(foreign)).statusCode).toBe(400);
    expect((await as(g.cookie, 'PUT', `/api/pages/${other.pageId}`, { layout: baseLayout() })).statusCode).toBe(403);
  });

  it('cannot reach anything else', async () => {
    const { albumId, pageId, mediaId } = await albumWithPage();
    const g = await guestFor(albumId);
    for (const [method, url] of [['GET', '/api/albums'], ['GET', `/api/albums/${albumId}`], ['POST', `/api/albums/${albumId}/pages`],
      ['DELETE', `/api/pages/${pageId}`], ['DELETE', `/api/media/${mediaId}`], ['GET', '/api/manage'], ['GET', '/api/manage/ai'],
      ['POST', `/api/albums/${albumId}/share`]] as const) {
      expect((await as(g.cookie, method, url, method === 'POST' ? { templateId: 'blank' } : undefined)).statusCode, `${method} ${url}`).toBe(401);
    }
    expect((await as(g.cookie, 'GET', `/api/media/${mediaId}`)).statusCode).toBe(200);
    const other = await albumWithPage();
    expect((await as(g.cookie, 'GET', `/api/media/${other.mediaId}`)).statusCode).toBe(403);
  });

  it('media files: the guest may load this album\'s files only', async () => {
    const { albumId, mediaId } = await albumWithPage();
    const other = await albumWithPage();
    const g = await guestFor(albumId);
    const check = (uri: string) => t.app.inject({ method: 'GET', url: '/api/auth/check', headers: { 'x-original-uri': uri, cookie: g.cookie } });
    expect((await check(`/media/${mediaId}/display.webp`)).statusCode).toBe(204);
    expect((await check(`/media/${other.mediaId}/display.webp`)).statusCode).toBe(401);
  });

  it('revoked or expired: the guest is locked out at once', async () => {
    const a = await albumWithPage();
    const g = await guestFor(a.albumId);
    await owner('DELETE', `/api/albums/${a.albumId}/edit-link`);
    expect((await as(g.cookie, 'PUT', `/api/pages/${a.pageId}`, { layout: baseLayout() })).statusCode).toBe(401);

    const b = await albumWithPage();
    const h = await guestFor(b.albumId);
    await t.pool.query(`update albums set edit_expires_at = now() - interval '1 minute' where id = $1`, [b.albumId]);
    expect((await as(h.cookie, 'PUT', `/api/pages/${b.pageId}`, { layout: baseLayout() })).statusCode).toBe(401);
    expect((await as(undefined, 'GET', `/api/edit/${h.token}`)).statusCode).toBe(404);
  });

  it('uploads: photos and videos into this album only', async () => {
    const { albumId } = await albumWithPage();
    const other = await albumWithPage();
    const g = await guestFor(albumId);
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const create = (meta: Record<string, string>) => fetch(`${base}/api/uploads`, { method: 'POST', headers: {
      'tus-resumable': '1.0.0', cookie: g.cookie, 'upload-length': '10',
      'upload-metadata': Object.entries(meta).map(([k, v]) => `${k} ${b64(v)}`).join(','),
    } });
    expect((await create({ albumId, filename: 'a.jpg', filetype: 'image/jpeg' })).status).toBe(201);
    expect((await create({ albumId: other.albumId, filename: 'a.jpg', filetype: 'image/jpeg' })).status).toBe(403);
    expect((await create({ albumId, filename: 'a.mp3', filetype: 'audio/mpeg' })).status).toBe(403);
    // Someone else's upload id can't be continued or cancelled.
    const own = await (await fetch(`${base}/api/uploads`, { method: 'POST', headers: {
      'tus-resumable': '1.0.0', cookie: await t.login(), 'upload-length': '10',
      'upload-metadata': `albumId ${b64(other.albumId)},filename ${b64('b.jpg')},filetype ${b64('image/jpeg')}`,
    } })).headers.get('location');
    const r = await fetch(`${base}/api/uploads/${own!.split('/').pop()}`, { method: 'HEAD', headers: { 'tus-resumable': '1.0.0', cookie: g.cookie } });
    expect(r.status).toBe(403);
  });
});

describe('guestEditAllowed', () => {
  it('compares structure, not the editable fields', () => {
    const a = baseLayout();
    expect(guestEditAllowed(a, structuredClone(a))).toBe(true);
    const z = structuredClone(a); (z.elements[0] as { z: number }).z = 5;
    expect(guestEditAllowed(a, z)).toBe(false);
    const reordered = { ...a, elements: [a.elements[1], a.elements[0]] };
    expect(guestEditAllowed(a, reordered)).toBe(false);
    const shrink = structuredClone(a); (shrink.elements[1] as { h: number }).h = 0.05;
    expect(guestEditAllowed(a, shrink)).toBe(true); // a bubble's height follows its words
    const offPage = structuredClone(a); (offPage.elements[1] as { h: number }).h = 0.5;
    expect(guestEditAllowed(a, offPage)).toBe(false);
  });
});
