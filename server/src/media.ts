import { rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { MediaDTO, PageLayout } from '@scrapbook/shared';
import { uuidParams } from './albums.js';
import type { Config } from './config.js';
import { absPath } from './storage.js';

export const toMediaDTO = (r: any): MediaDTO => ({
  id: r.id, albumId: r.album_id, kind: r.kind, status: r.status,
  width: r.width, height: r.height, durationSec: r.duration_sec,
  blurDataUrl: r.blur_data_url, variants: r.variants, error: r.error,
});

// File removal must never fail the request; the DB rows are already gone.
export async function removeMediaDirs(app: FastifyInstance, config: Config, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await rm(absPath(config.mediaDir, id), { recursive: true, force: true });
    } catch (err) {
      app.log.error({ err, mediaId: id }, 'failed to remove media files');
    }
  }
}

export function registerMedia(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.get<{ Params: { id: string } }>('/api/media/:id', { schema: uuidParams }, async (req, reply) => {
    const { rows } = await pool.query('select * from media where id = $1', [req.params.id]);
    return rows[0] ? toMediaDTO(rows[0]) : reply.code(404).send({ error: 'not found' });
  });

  app.delete<{ Params: { id: string } }>('/api/media/:id', { schema: uuidParams }, async (req, reply) => {
    const id = req.params.id;
    const c = await pool.connect();
    try {
      await c.query('begin');
      const m = await c.query('select album_id from media where id = $1 for update', [id]);
      if (!m.rows[0]) {
        await c.query('rollback');
        return reply.code(404).send({ error: 'not found' });
      }
      const albumId = m.rows[0].album_id;
      const pages = await c.query('select id, layout from pages where album_id = $1 for update', [albumId]);
      for (const p of pages.rows as { id: string; layout: PageLayout }[]) {
        if (!p.layout.elements.some((e) => e.type === 'frame' && e.mediaId === id)) continue;
        const layout = {
          ...p.layout,
          elements: p.layout.elements.map((e) => (e.type === 'frame' && e.mediaId === id ? { ...e, mediaId: null } : e)),
        };
        await c.query('update pages set layout = $2, updated_at = now() where id = $1', [p.id, JSON.stringify(layout)]);
      }
      await c.query('update albums set cover_media_id = null, updated_at = now() where id = $1 and cover_media_id = $2', [albumId, id]);
      await c.query('delete from media where id = $1', [id]);
      await c.query('commit');
    } catch (err) {
      await c.query('rollback').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
    await removeMediaDirs(app, config, [id]);
    return reply.code(204).send();
  });
}
