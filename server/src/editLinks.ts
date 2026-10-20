import { randomBytes } from 'node:crypto';
import type { PageLayout } from '@scrapbook/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { loadBundle, uuidParams } from './albums.js';
import { isShareToken } from './share.js';

// Temporary edit links: a secret per-album code, valid for 8 hours. Its holder (a "guest", no password) may put
// photos/videos into the album's existing frames and change existing text — nothing else. The guest's session only
// remembers album + code; every request checks the code is still the album's and not expired, so revoking or
// expiry locks them out at once.
export const EDIT_HOURS = 8;

declare module 'fastify' {
  interface FastifyRequest { guestAlbumId: string | null } // set by the auth guard for a valid guest
}

export async function guestAlbum(pool: pg.Pool, req: FastifyRequest): Promise<string | null> {
  const g = req.session.get('guest');
  if (!g || !isShareToken(g.token)) return null;
  const r = await pool.query('select id from albums where id = $1 and edit_token = $2 and edit_expires_at > now()', [g.albumId, g.token]);
  return r.rows[0]?.id ?? null;
}

// A guest may change only a frame's photo (mediaId) and crop, and a text's words (and let a bubble grow to fit
// them, or shrink back). Everything else — elements, order, position, style, background, hidden — must stay exactly as it was.
export function guestEditAllowed(before: PageLayout, after: PageLayout): boolean {
  if (before.background !== after.background || !!before.hidden !== !!after.hidden) return false;
  if (before.elements.length !== after.elements.length) return false;
  return before.elements.every((b, i) => {
    const a = after.elements[i];
    if (a.id !== b.id || a.type !== b.type) return false;
    if (a.type === 'text' && a.y + a.h > 1.0001) return false;
    return canon(strip(a)) === canon(strip(b));
  });
}
const strip = (e: PageLayout['elements'][number]) => {
  if (e.type === 'frame') { const { mediaId: _m, crop: _c, ...rest } = e; return rest; }
  if (e.type === 'text') { const { text: _t, h: _h, ...rest } = e; return rest; }
  return e;
};
// JSON with sorted keys: stored and incoming layouts may list the same fields in a different order.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q))) : x);

// nginx media check / bucket media: a guest may load files of their album only.
export async function guestAllowsMedia(pool: pg.Pool, req: FastifyRequest, uri: unknown): Promise<boolean> {
  if (typeof uri !== 'string') return false;
  const m = /^\/media\/([0-9a-f-]{36})\//.exec(uri.split('?')[0]);
  const album = m && (await guestAlbum(pool, req));
  if (!album) return false;
  return ((await pool.query('select 1 from media where id = $1 and album_id = $2', [m[1], album])).rowCount ?? 0) > 0;
}

export function registerEditLinks(app: FastifyInstance, pool: pg.Pool): void {
  // Owner: make (or repeat, while still valid) / revoke the album's edit link.
  app.post<{ Params: { id: string } }>('/api/albums/:id/edit-link', { schema: uuidParams }, async (req, reply) => {
    const { rows } = await pool.query(
      `update albums set
         edit_token = case when edit_token is not null and edit_expires_at > now() then edit_token else $2 end,
         edit_expires_at = case when edit_token is not null and edit_expires_at > now() then edit_expires_at
                                else now() + make_interval(hours => $3) end
       where id = $1 returning edit_token, edit_expires_at`,
      [req.params.id, randomBytes(32).toString('base64url'), EDIT_HOURS]);
    if (!rows[0]) return reply.code(404).send({ error: 'not found' });
    return { editToken: rows[0].edit_token, expiresAt: new Date(rows[0].edit_expires_at).toISOString() };
  });

  app.delete<{ Params: { id: string } }>('/api/albums/:id/edit-link', { schema: uuidParams }, async (req, reply) => {
    const r = await pool.query('update albums set edit_token = null, edit_expires_at = null where id = $1', [req.params.id]);
    return reply.code(r.rowCount ? 204 : 404).send();
  });

  // Public (exempted in the auth guard): opening the link starts a guest session for that album.
  app.get<{ Params: { token: string } }>('/api/edit/:token', async (req, reply) => {
    const token = req.params.token;
    if (!isShareToken(token)) return reply.code(404).send({ error: 'not found' });
    const a = await pool.query('select * from albums where edit_token = $1 and edit_expires_at > now()', [token]);
    if (!a.rows[0]) return reply.code(404).send({ error: 'not found' });
    req.session.set('guest', { albumId: a.rows[0].id, token });
    const bundle = await loadBundle(pool, a.rows[0]);
    return { ...bundle, album: { ...bundle.album, shareToken: null, editToken: null, editExpiresAt: new Date(a.rows[0].edit_expires_at).toISOString() } };
  });
}
