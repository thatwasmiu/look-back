import { randomBytes } from 'node:crypto';
import type { PageLayout } from '@scrapbook/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { loadBundle, uuidParams } from './albums.js';
import { isShareToken } from './share.js';

// Temporary edit links: a secret per-album code, valid for the hours the owner picks (default 8, up to a week). Its holder (a "guest", no password) may put
// photos/videos into the album's existing frames and change existing text — nothing else. The guest's session only
// remembers album + code; every request checks the code is still the album's and not expired, so revoking or
// expiry locks them out at once.
export const EDIT_HOURS = 8, MAX_EDIT_HOURS = 168;

declare module 'fastify' {
  interface FastifyRequest { guestAlbumId: string | null } // set by the auth guard for a valid guest
}

export async function guestAlbum(pool: pg.Pool, req: FastifyRequest): Promise<string | null> {
  const g = req.session.get('guest');
  if (!g || !isShareToken(g.token)) return null;
  const r = await pool.query('select id from albums where id = $1 and edit_token = $2 and edit_expires_at > now()', [g.albumId, g.token]);
  return r.rows[0]?.id ?? null;
}

// A guest may change anything on a page except its structure: the frames/panels (none added or removed; each keeps
// its place, size, style and shape — only its photo, crop, video trim and layer may change) and the page's hidden
// flag. Pages themselves (add, delete, reorder) are owner-only routes anyway. Text, stickers, tape, effects and the
// paper are free.
export function guestEditAllowed(before: PageLayout, after: PageLayout): boolean {
  if (!!before.hidden !== !!after.hidden) return false;
  const frames = (l: PageLayout) => new Map(l.elements.flatMap((e) => (e.type === 'frame' ? [[e.id, e] as const] : [])));
  const b = frames(before), a = frames(after);
  if (a.size !== b.size) return false;
  return [...b].every(([id, f]) => { const g = a.get(id); return !!g && canon(strip(g)) === canon(strip(f)); });
}
const strip = (f: Extract<PageLayout['elements'][number], { type: 'frame' }>) => {
  const { mediaId: _m, crop: _c, trim: _t, z: _z, ...rest } = f;
  return rest;
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
  // Owner: make the album's edit link, valid `hours` from now (a still-valid link keeps its code, gets the new
  // expiry; without `hours` it is just returned as is) / revoke it.
  app.post<{ Params: { id: string }; Body: { hours?: number } | undefined }>('/api/albums/:id/edit-link', {
    schema: { ...uuidParams, body: { type: ['object', 'null'], additionalProperties: false, properties: {
      hours: { type: 'integer', minimum: 1, maximum: MAX_EDIT_HOURS } } } },
  }, async (req, reply) => {
    const hours = req.body?.hours ?? null;
    const { rows } = await pool.query(
      `update albums set
         edit_token = case when edit_token is not null and edit_expires_at > now() then edit_token else $2 end,
         edit_expires_at = case when $3::int is null and edit_token is not null and edit_expires_at > now() then edit_expires_at
                                else now() + make_interval(hours => coalesce($3::int, $4)) end
       where id = $1 returning edit_token, edit_expires_at`,
      [req.params.id, randomBytes(32).toString('base64url'), hours, EDIT_HOURS]);
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

  // Public: the app manifest a link's page points to, so "Add to Home Screen" from /e/<code> or /s/<code> opens that
  // album — the installed app starts there (and on iPhone it doesn't share Safari's cookies, so it needs the code).
  app.get<{ Params: { kind: string; token: string } }>('/api/manifest/:kind/:token', async (req, reply) => {
    const { kind, token } = req.params;
    if ((kind !== 'e' && kind !== 's') || !isShareToken(token)) return reply.code(404).send({ error: 'not found' });
    const start = `/${kind}/${token}`;
    return reply.type('application/manifest+json').header('cache-control', 'no-cache').send({
      name: 'Look Back', short_name: 'Look Back', description: 'Album được chia sẻ trên Look Back.',
      id: start, start_url: start, scope: '/', display: 'standalone', orientation: 'any',
      background_color: '#efe6d4', theme_color: '#efe6d4',
      icons: [
        { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });
}

