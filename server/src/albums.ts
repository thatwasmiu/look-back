import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  BACKGROUND_COLORS, BACKGROUND_EFFECTS, instantiateTemplate, templates,
  type AlbumBundle, type AlbumDTO, type AlbumSummary, type BackgroundColor, type BackgroundEffect,
} from '@scrapbook/shared';
import type { Config } from './config.js';
import { removeMediaDirs, toMediaDTO } from './media.js';
import { toPageDTO } from './pages.js';

export const uuidParams = {
  params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
} as const;

const toAlbumDTO = (r: any): AlbumDTO => ({ id: r.id, title: r.title, coverMediaId: r.cover_media_id, backgroundEffect: r.background_effect, backgroundColor: r.background_color });
const title = { type: 'string', minLength: 1, maxLength: 200 } as const;

export function registerAlbums(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  app.get('/api/albums', async (): Promise<AlbumSummary[]> => {
    const { rows } = await pool.query(
      `select a.*, coalesce(m.variants->>'thumb', m.variants->>'poster') as cover_thumb,
              (select count(*)::int from pages p where p.album_id = a.id) as page_count
         from albums a left join media m on m.id = a.cover_media_id
        order by a.created_at desc, a.id`,
    );
    return rows.map((r) => ({ ...toAlbumDTO(r), coverThumb: r.cover_thumb, pageCount: r.page_count }));
  });

  app.post<{ Body: { title: string } }>(
    '/api/albums',
    { schema: { body: { type: 'object', required: ['title'], properties: { title } } } },
    async (req, reply) => {
      const layout = instantiateTemplate(templates.some((t) => t.id === 'cover') ? 'cover' : 'blank', randomUUID);
      const c = await pool.connect();
      try {
        await c.query('begin');
        const { rows } = await c.query('insert into albums (title) values ($1) returning *', [req.body.title]);
        await c.query('insert into pages (album_id, position, layout) values ($1, 0, $2)', [rows[0].id, JSON.stringify(layout)]);
        await c.query('commit');
        return reply.code(201).send(toAlbumDTO(rows[0]));
      } catch (err) {
        await c.query('rollback').catch(() => {});
        throw err;
      } finally {
        c.release();
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { title?: string; coverMediaId?: string | null; backgroundEffect?: BackgroundEffect; backgroundColor?: BackgroundColor } }>(
    '/api/albums/:id',
    {
      schema: {
        ...uuidParams,
        body: { type: 'object', properties: {
          title, coverMediaId: { type: ['string', 'null'], format: 'uuid' }, backgroundEffect: { type: 'string', enum: [...BACKGROUND_EFFECTS] },
          backgroundColor: { type: 'string', enum: [...BACKGROUND_COLORS] },
        } },
      },
    },
    async (req, reply) => {
      const { title: t, coverMediaId, backgroundEffect, backgroundColor } = req.body;
      if (coverMediaId) {
        const m = await pool.query('select 1 from media where id = $1 and album_id = $2', [coverMediaId, req.params.id]);
        if (!m.rowCount) return reply.code(400).send({ error: 'cover media not in this album' });
      }
      const { rows } = await pool.query(
        `update albums set title = coalesce($2, title),
                cover_media_id = case when $3::boolean then $4::uuid else cover_media_id end,
                background_effect = coalesce($5, background_effect),
                background_color = coalesce($6, background_color),
                updated_at = now()
          where id = $1 returning *`,
        [req.params.id, t ?? null, coverMediaId !== undefined, coverMediaId ?? null, backgroundEffect ?? null, backgroundColor ?? null],
      );
      return rows[0] ? toAlbumDTO(rows[0]) : reply.code(404).send({ error: 'not found' });
    },
  );

  app.delete<{ Params: { id: string } }>('/api/albums/:id', { schema: uuidParams }, async (req, reply) => {
    const c = await pool.connect();
    let mediaIds: string[];
    try {
      await c.query('begin');
      mediaIds = (await c.query('select id from media where album_id = $1', [req.params.id])).rows.map((r) => r.id);
      const d = await c.query('delete from albums where id = $1', [req.params.id]);
      await c.query('commit');
      if (!d.rowCount) return reply.code(404).send({ error: 'not found' });
    } catch (err) {
      await c.query('rollback').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
    await removeMediaDirs(app, config, mediaIds);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/albums/:id', { schema: uuidParams }, async (req, reply) => {
    const a = await pool.query('select * from albums where id = $1', [req.params.id]);
    if (!a.rows[0]) return reply.code(404).send({ error: 'not found' });
    const [pages, media] = await Promise.all([
      pool.query('select * from pages where album_id = $1 order by position', [req.params.id]),
      pool.query('select * from media where album_id = $1 order by created_at, id', [req.params.id]),
    ]);
    const bundle: AlbumBundle = { album: toAlbumDTO(a.rows[0]), pages: pages.rows.map(toPageDTO), media: media.rows.map(toMediaDTO) };
    return bundle;
  });
}
