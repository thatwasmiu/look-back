import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { loadBundle, uuidParams } from './albums.js';
import type { Config } from './config.js';

// Read-only share links: a secret per-album code (32 random bytes). Anyone holding it can view that album —
// nothing else. Revoking clears it; sharing again makes a new code, so old copies stay dead.
export const SHARE_COOKIE = 'lb_share';
export const isShareToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export function registerShare(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.post<{ Params: { id: string } }>('/api/albums/:id/share', { schema: uuidParams }, async (req, reply) => {
    const { rows } = await pool.query(
      'update albums set share_token = coalesce(share_token, $2) where id = $1 returning share_token',
      [req.params.id, randomBytes(32).toString('base64url')],
    );
    return rows[0] ? { shareToken: rows[0].share_token } : reply.code(404).send({ error: 'not found' });
  });

  app.delete<{ Params: { id: string } }>('/api/albums/:id/share', { schema: uuidParams }, async (req, reply) => {
    const r = await pool.query('update albums set share_token = null where id = $1', [req.params.id]);
    return reply.code(r.rowCount ? 204 : 404).send();
  });

  // Public (no session; exempted in the auth guard). Also sets a cookie the media check accepts for this album.
  app.get<{ Params: { token: string } }>('/api/share/:token', async (req, reply) => {
    const token = req.params.token;
    if (!isShareToken(token)) return reply.code(404).send({ error: 'not found' });
    const a = await pool.query('select * from albums where share_token = $1', [token]);
    if (!a.rows[0]) return reply.code(404).send({ error: 'not found' });
    const bundle = await loadBundle(pool, a.rows[0]);
    reply.setCookie(SHARE_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 24 * 3600 });
    return { ...bundle, album: { ...bundle.album, shareToken: null } };
  });
}

// For nginx auth_request on /media/<mediaId>/…: does the visitor's share cookie belong to that media's album?
// `uri` is the raw $request_uri. Only plain paths pass — no '..', no %-escapes, no '//', plain file names — so
// nginx's normalization can't turn it into a different file than the one checked here.
export async function shareAllowsMedia(pool: pg.Pool, token: unknown, uri: unknown): Promise<boolean> {
  if (!isShareToken(token) || typeof uri !== 'string') return false;
  const path = uri.split('?')[0];
  if (path.includes('..') || path.includes('%')) return false;
  const m = /^\/media\/([0-9a-f-]{36})\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$/.exec(path);
  if (!m) return false;
  const r = await pool.query(
    'select 1 from media m join albums a on a.id = m.album_id where m.id = $1 and a.share_token = $2', [m[1], token]);
  return (r.rowCount ?? 0) > 0;
}
