import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { AlbumBundle } from '@scrapbook/shared';
import { loadBundle, uuidParams } from './albums.js';
import type { Config } from './config.js';
import { readMediaFile } from './mediaFiles.js';

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
    const bundle = hideHiddenPages(await loadBundle(pool, a.rows[0]));
    reply.setCookie(SHARE_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 24 * 3600 });
    return { ...bundle, album: { ...bundle.album, shareToken: null, editToken: null, editExpiresAt: null } };
  });

  // Link previews (Facebook, Zalo, Messenger…): crawlers don't run the app, so nginx sends them here for the
  // album's own title / cover. Public like the share link itself; a dead or wrong token reveals nothing.
  const sharedAlbum = async (token: string) => (isShareToken(token)
    ? (await pool.query(`select a.*, (select count(*)::int from pages p where p.album_id = a.id and not coalesce((p.layout->>'hidden')::boolean, false)) as page_count from albums a where share_token = $1`, [token])).rows[0]
    : undefined);
  app.get<{ Params: { token: string } }>('/api/share/:token/preview', async (req, reply) => {
    const a = await sharedAlbum(req.params.token);
    if (!a) return reply.code(404).type('text/html; charset=utf-8').send('<!doctype html><title>Look Back</title>');
    const origin = `${req.protocol}://${req.hostname}`;
    const link = `${origin}/s/${req.params.token}`;
    const tags: [string, string][] = [
      ['og:type', 'website'], ['og:site_name', 'Look Back'], ['og:title', a.title],
      ['og:description', `${a.page_count} trang · album chia sẻ từ Look Back`], ['og:url', link],
      ['og:image', `${origin}/api/share/${req.params.token}/preview.jpg`], ['og:image:width', '1200'], ['og:image:height', '630'],
    ];
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache').send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${esc(a.title)} · Look Back</title>
${tags.map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join('\n')}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(link)}?app">
</head><body><a href="${esc(link)}?app">${esc(a.title)}</a></body></html>`);
  });

  // The preview picture: the cover photo, else the album's first ready photo (or video poster), cut to 1200×630.
  app.get<{ Params: { token: string } }>('/api/share/:token/preview.jpg', async (req, reply) => {
    const a = await sharedAlbum(req.params.token);
    if (!a) return reply.code(404).send();
    const { rows } = await pool.query(
      `select variants from media where album_id = $1 and status = 'ready' and kind in ('image', 'video')
        order by (id = $2) desc, created_at limit 1`, [a.id, a.cover_media_id]);
    const v = rows[0]?.variants as { display?: string; thumb?: string; poster?: string } | undefined;
    const key = v?.display ?? v?.poster ?? v?.thumb;
    if (!key) return reply.redirect('/brand/og.jpg');
    try {
      const jpg = await sharp(await readMediaFile(pool, config, key)).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
      return reply.type('image/jpeg').header('cache-control', 'public, max-age=3600').send(jpg);
    } catch {
      return reply.redirect('/brand/og.jpg'); // file missing or unreadable: the app's own picture
    }
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

// Viewers of a share link never get hidden pages, nor the photos/videos that only those pages show.
export function hideHiddenPages(b: AlbumBundle): AlbumBundle {
  const used = (pages: AlbumBundle['pages']) =>
    new Set(pages.flatMap((p) => p.layout.elements.flatMap((e) => (e.type === 'frame' && e.mediaId ? [e.mediaId] : []))));
  const pages = b.pages.filter((p) => !p.layout.hidden);
  const shown = used(pages);
  const hiddenOnly = [...used(b.pages.filter((p) => p.layout.hidden))].filter((id) =>
    !shown.has(id) && id !== b.album.coverMediaId && id !== b.album.musicMediaId);
  return { ...b, pages, media: b.media.filter((m) => !hiddenOnly.includes(m.id)) };
}

