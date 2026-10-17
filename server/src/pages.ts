import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { instantiateTemplate, pageLayoutSchema, type PageDTO } from '@scrapbook/shared';
import { uuidParams } from './albums.js';

export const toPageDTO = (r: any): PageDTO => ({ id: r.id, albumId: r.album_id, position: r.position, layout: r.layout });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (err) {
    await c.query('rollback').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

export function registerPages(app: FastifyInstance, pool: pg.Pool): void {
  app.post<{ Params: { id: string }; Body: { templateId: string; position?: number } }>(
    '/api/albums/:id/pages',
    {
      schema: {
        ...uuidParams,
        body: {
          type: 'object', required: ['templateId'],
          properties: { templateId: { type: 'string' }, position: { type: 'integer', minimum: 0 } },
        },
      },
    },
    async (req, reply) => {
      let layout;
      try {
        layout = instantiateTemplate(req.body.templateId, randomUUID);
      } catch {
        return reply.code(400).send({ error: 'unknown template' });
      }
      const row = await tx(pool, async (c) => {
        const a = await c.query('select id from albums where id = $1 for update', [req.params.id]);
        if (!a.rows[0]) return null;
        const { rows } = await c.query('select count(*)::int as n from pages where album_id = $1', [req.params.id]);
        const pos = Math.min(req.body.position ?? rows[0].n, rows[0].n);
        await c.query('update pages set position = position + 1 where album_id = $1 and position >= $2', [req.params.id, pos]);
        const ins = await c.query(
          'insert into pages (album_id, position, layout) values ($1, $2, $3) returning *',
          [req.params.id, pos, JSON.stringify(layout)],
        );
        return ins.rows[0];
      });
      return row ? reply.code(201).send(toPageDTO(row)) : reply.code(404).send({ error: 'not found' });
    },
  );

  app.put<{ Params: { id: string }; Body: { layout?: unknown } }>('/api/pages/:id', { schema: uuidParams }, async (req, reply) => {
    const parsed = pageLayoutSchema.safeParse(req.body?.layout);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid layout', issues: parsed.error.issues });
    const layout = parsed.data;
    const page = await pool.query('select album_id from pages where id = $1', [req.params.id]);
    if (!page.rows[0]) return reply.code(404).send({ error: 'not found' });

    const mediaIds = [...new Set(layout.elements.flatMap((e) => (e.type === 'frame' && e.mediaId ? [e.mediaId] : [])))];
    if (mediaIds.length) {
      const ok = mediaIds.every((m) => UUID_RE.test(m)) &&
        (await pool.query('select count(*)::int as n from media where album_id = $1 and id = any($2::uuid[])', [page.rows[0].album_id, mediaIds])).rows[0].n === mediaIds.length;
      if (!ok) return reply.code(400).send({ error: 'frame references media outside this album' });
    }
    const { rows } = await pool.query(
      'update pages set layout = $2, updated_at = now() where id = $1 returning *',
      [req.params.id, JSON.stringify(layout)],
    );
    return toPageDTO(rows[0]);
  });

  app.delete<{ Params: { id: string } }>('/api/pages/:id', { schema: uuidParams }, async (req, reply) => {
    const found = await tx(pool, async (c) => {
      const d = await c.query('delete from pages where id = $1 returning album_id, position', [req.params.id]);
      if (!d.rows[0]) return false;
      await c.query('update pages set position = position - 1 where album_id = $1 and position > $2', [d.rows[0].album_id, d.rows[0].position]);
      return true;
    });
    return found ? reply.code(204).send() : reply.code(404).send({ error: 'not found' });
  });

  app.put<{ Params: { id: string }; Body: { pageIds: string[] } }>(
    '/api/albums/:id/page-order',
    {
      schema: {
        ...uuidParams,
        body: { type: 'object', required: ['pageIds'], properties: { pageIds: { type: 'array', items: { type: 'string', format: 'uuid' } } } },
      },
    },
    async (req, reply) => {
      const ids = req.body.pageIds;
      const status = await tx(pool, async (c) => {
        const { rows } = await c.query('select id from pages where album_id = $1 for update', [req.params.id]);
        const have = new Set<string>(rows.map((r) => r.id));
        if (!have.size) return 404;
        if (ids.length !== have.size || new Set(ids).size !== ids.length || !ids.every((i) => have.has(i))) return 400;
        for (const [pos, id] of ids.entries()) await c.query('update pages set position = $2 where id = $1', [id, pos]);
        return 204;
      });
      if (status === 204) return reply.code(204).send();
      return reply.code(status).send({ error: status === 404 ? 'not found' : 'pageIds must be exactly the pages of this album' });
    },
  );
}
