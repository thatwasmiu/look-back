import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.js';
import { loadBucket, markLocation } from './locations.js';
import { bucketClient } from './objectStore.js';
import { SHARE_COOKIE, shareAllowsMedia } from './share.js';

// /media/<id>/<file> for files that live in a bucket. nginx serves files on the VPS disk itself and hands only disk
// misses to this route. Access is checked here again (owner session or a share link for that album), then the
// browser is sent to a short-lived presigned URL; HLS playlists are rewritten so their segments are presigned too.
const PRESIGN_SECONDS = 600;
const UUID = /^[0-9a-f-]{36}$/;

export function registerRemoteMedia(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.get<{ Params: { mediaId: string; '*': string } }>('/media/:mediaId/*', async (req, reply) => {
    const { mediaId } = req.params;
    const rest = req.params['*'];
    if (!UUID.test(mediaId) || !rest || rest.split('/').some((p) => !p || p === '..')) return reply.code(404).send();
    if (!req.session.get('owner') && !(await shareAllowsMedia(pool, req.cookies[SHARE_COOKIE], req.url))) return reply.code(401).send();

    const m = (await pool.query(`select m.storage_id, l.check_status from media m
      left join storage_locations l on l.id = m.storage_id where m.id = $1`, [mediaId])).rows[0];
    if (!m?.storage_id) return reply.code(404).send(); // on the VPS (nginx would have served it) or gone
    const bucket = m.check_status === 'ok' ? await loadBucket(pool, config.sessionSecret, m.storage_id) : null;
    if (!bucket) return reply.code(503).send();
    const c = bucketClient(bucket);
    const key = `${mediaId}/${rest}`;

    if (!key.endsWith('.m3u8')) {
      return reply.header('cache-control', `private, max-age=${PRESIGN_SECONDS / 2}`).redirect(await c.presign(key, PRESIGN_SECONDS), 302);
    }
    let text: string;
    try {
      text = await (await c.get(key)).text();
    } catch (e) {
      await markLocation(pool, m.storage_id, (e instanceof Error ? e.message : String(e)).slice(0, 300));
      return reply.code(503).send();
    }
    const dir = key.slice(0, key.lastIndexOf('/') + 1);
    const sign = (ref: string) => (ref.endsWith('.m3u8') || /^https?:/.test(ref) ? ref : c.presign(dir + ref, PRESIGN_SECONDS));
    const lines = await Promise.all(text.split('\n').map(async (line) => {
      const l = line.trim();
      if (!l) return line;
      if (l.startsWith('#')) { // EXT-X-MAP / EXT-X-MEDIA URIs
        const m2 = /URI="([^"]+)"/.exec(l);
        return m2 ? l.replace(m2[0], `URI="${await sign(m2[1])}"`) : line;
      }
      return sign(l);
    }));
    return reply.type('application/vnd.apple.mpegurl').header('cache-control', 'no-store').send(lines.join('\n'));
  });
}
