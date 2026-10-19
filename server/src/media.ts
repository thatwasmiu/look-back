import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { MediaDTO } from '@scrapbook/shared';
import { uuidParams } from './albums.js';
import type { Config } from './config.js';
import { deleteMediaRows, removeMediaFiles } from './mediaFiles.js';

export const toMediaDTO = (r: any): MediaDTO => ({
  id: r.id, albumId: r.album_id, kind: r.kind, status: r.status,
  width: r.width, height: r.height, durationSec: r.duration_sec,
  blurDataUrl: r.blur_data_url, variants: r.variants, error: r.error, name: r.original_name ?? null,
});

export function registerMedia(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.get<{ Params: { id: string } }>('/api/media/:id', { schema: uuidParams }, async (req, reply) => {
    const { rows } = await pool.query('select * from media where id = $1', [req.params.id]);
    return rows[0] ? toMediaDTO(rows[0]) : reply.code(404).send({ error: 'not found' });
  });

  app.delete<{ Params: { id: string } }>('/api/media/:id', { schema: uuidParams }, async (req, reply) => {
    const c = await pool.connect();
    let gone;
    try {
      await c.query('begin');
      gone = await deleteMediaRows(c, [req.params.id]);
      await c.query(gone.length ? 'commit' : 'rollback');
    } catch (err) {
      await c.query('rollback').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
    if (!gone.length) return reply.code(404).send({ error: 'not found' });
    await removeMediaFiles(pool, config, gone);
    return reply.code(204).send();
  });
}
