import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type PgBoss from 'pg-boss';
import type pg from 'pg';
import {
  BACKGROUND_COLORS, BACKGROUND_EFFECTS, albumDesignSchema, instantiateTemplate, templates,
  type AlbumBundle, type AlbumDTO, type PageLayout, type AlbumSummary, type BackgroundColor, type BackgroundEffect,
} from '@scrapbook/shared';
import type { Config } from './config.js';
import { removeMediaDirs, toMediaDTO } from './media.js';
import { toPageDTO } from './pages.js';
import { JOB_PROCESS_MEDIA, type ProcessMediaJob } from './queue.js';

export const uuidParams = {
  params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
} as const;

const toAlbumDTO = (r: any): AlbumDTO => ({ id: r.id, title: r.title, coverMediaId: r.cover_media_id, backgroundEffect: r.background_effect, backgroundColor: r.background_color, shareToken: r.share_token ?? null, musicMediaId: r.music_media_id ?? null });
const title = { type: 'string', minLength: 1, maxLength: 200 } as const;
export const withoutMedia = (l: PageLayout): PageLayout => ({
  ...l,
  elements: l.elements.map((e) => (e.type === 'frame' ? { ...e, mediaId: null, crop: { x: 0.5, y: 0.5, scale: 1 } } : e)),
});

export function registerAlbums(app: FastifyInstance, pool: pg.Pool, config: Config, boss: PgBoss): void {
  const templateTrack = (name: string) => {
    for (const [ext, mime] of [['mp3', 'audio/mpeg'], ['m4a', 'audio/mp4']] as const) {
      const path = config.templateMusicDir && join(config.templateMusicDir, `${name}.${ext}`);
      if (path && existsSync(path)) return { path, name: `${name}.${ext}`, mime };
    }
    return null;
  };

  app.get('/api/albums', async (): Promise<AlbumSummary[]> => {
    const { rows } = await pool.query(
      `select a.*, coalesce(m.variants->>'thumb', m.variants->>'poster') as cover_thumb,
              (select count(*)::int from pages p where p.album_id = a.id) as page_count,
              (select layout from pages p where p.album_id = a.id order by position limit 1) as cover_layout
         from albums a left join media m on m.id = a.cover_media_id
        order by a.created_at desc, a.id`,
    );
    const ids = rows.flatMap((r) => (r.cover_layout as PageLayout | null)?.elements.flatMap((e) => (e.type === 'frame' && e.mediaId ? [e.mediaId] : [])) ?? []);
    const media = ids.length ? (await pool.query('select * from media where id = any($1::uuid[])', [ids])).rows.map(toMediaDTO) : [];
    return rows.map((r) => {
      const layout = r.cover_layout as PageLayout | null;
      const coverPage = layout && { layout, media: media.filter((m) => layout.elements.some((e) => e.type === 'frame' && e.mediaId === m.id)) };
      return { ...toAlbumDTO(r), coverThumb: r.cover_thumb, pageCount: r.page_count, coverPage };
    });
  });

  // Start from a design instead of one cover page, with every frame emptied (photos/videos are never copied):
  //  fromAlbumId — another album's pages, papers, stickers, text, effects and colors;
  //  design — a built-in album template sent by the web app (validated like any saved page).
  app.post<{ Body: { title: string; fromAlbumId?: string; design?: unknown } }>(
    '/api/albums',
    { schema: { body: { type: 'object', required: ['title'], properties: { title, fromAlbumId: { type: 'string', format: 'uuid' }, design: { type: 'object' } } } } },
    async (req, reply) => {
      const { fromAlbumId } = req.body;
      const design = req.body.design === undefined ? null : albumDesignSchema.safeParse(req.body.design);
      if (design && !design.success) return reply.code(400).send({ error: 'invalid design' });
      const c = await pool.connect();
      try {
        await c.query('begin');
        let layouts: PageLayout[] = [instantiateTemplate(templates.some((t) => t.id === 'cover') ? 'cover' : 'blank', randomUUID)];
        let look = { effect: 'none', color: 'walnut' };
        if (design?.success) {
          look = { effect: design.data.backgroundEffect, color: design.data.backgroundColor };
          layouts = design.data.pages.map(withoutMedia);
        } else if (fromAlbumId) {
          const src = await c.query('select background_effect, background_color from albums where id = $1', [fromAlbumId]);
          if (!src.rowCount) {
            await c.query('rollback');
            return reply.code(404).send({ error: 'template album not found' });
          }
          look = { effect: src.rows[0].background_effect, color: src.rows[0].background_color };
          const pages = await c.query('select layout from pages where album_id = $1 order by position', [fromAlbumId]);
          layouts = pages.rows.map((r: { layout: PageLayout }) => withoutMedia(r.layout));
        }
        const { rows } = await c.query(
          'insert into albums (title, background_effect, background_color) values ($1, $2, $3) returning *',
          [req.body.title, look.effect, look.color],
        );
        for (const [i, layout] of layouts.entries()) {
          await c.query('insert into pages (album_id, position, layout) values ($1, $2, $3)', [rows[0].id, i, JSON.stringify(layout)]);
        }
        // A template's own track, if this server has it (files live outside the repo and the images). The worker
        // processes a copy like any upload; without the file the album simply starts silent.
        const track = design?.success && design.data.music ? templateTrack(design.data.music) : null;
        let job: ProcessMediaJob | null = null;
        if (track) {
          const m = await c.query(
            `insert into media (album_id, kind, status, original_name, mime) values ($1, 'audio', 'processing', $2, $3) returning id`,
            [rows[0].id, track.name, track.mime]);
          job = { mediaId: m.rows[0].id, uploadPath: join(config.uploadDir, m.rows[0].id) };
          rows[0] = (await c.query('update albums set music_media_id = $2 where id = $1 returning *', [rows[0].id, job.mediaId])).rows[0];
        }
        await c.query('commit');
        if (job && track) {
          await copyFile(track.path, job.uploadPath);
          await boss.send(JOB_PROCESS_MEDIA, job);
        }
        return reply.code(201).send(toAlbumDTO(rows[0]));
      } catch (err) {
        await c.query('rollback').catch(() => {});
        throw err;
      } finally {
        c.release();
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { title?: string; coverMediaId?: string | null; musicMediaId?: string | null; backgroundEffect?: BackgroundEffect; backgroundColor?: BackgroundColor } }>(
    '/api/albums/:id',
    {
      schema: {
        ...uuidParams,
        body: { type: 'object', properties: {
          title, coverMediaId: { type: ['string', 'null'], format: 'uuid' }, backgroundEffect: { type: 'string', enum: [...BACKGROUND_EFFECTS] },
          backgroundColor: { type: 'string', enum: [...BACKGROUND_COLORS] }, musicMediaId: { type: ['string', 'null'], format: 'uuid' },
        } },
      },
    },
    async (req, reply) => {
      const { title: t, coverMediaId, musicMediaId, backgroundEffect, backgroundColor } = req.body;
      if (musicMediaId) {
        const m = await pool.query(`select 1 from media where id = $1 and album_id = $2 and kind = 'audio'`, [musicMediaId, req.params.id]);
        if (!m.rowCount) return reply.code(400).send({ error: 'music must be an audio file of this album' });
      }
      if (coverMediaId) {
        const m = await pool.query('select 1 from media where id = $1 and album_id = $2', [coverMediaId, req.params.id]);
        if (!m.rowCount) return reply.code(400).send({ error: 'cover media not in this album' });
      }
      const { rows } = await pool.query(
        `update albums set title = coalesce($2, title),
                cover_media_id = case when $3::boolean then $4::uuid else cover_media_id end,
                background_effect = coalesce($5, background_effect),
                background_color = coalesce($6, background_color),
                music_media_id = case when $7::boolean then $8::uuid else music_media_id end,
                updated_at = now()
          where id = $1 returning *`,
        [req.params.id, t ?? null, coverMediaId !== undefined, coverMediaId ?? null, backgroundEffect ?? null, backgroundColor ?? null,
          musicMediaId !== undefined, musicMediaId ?? null],
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
    return loadBundle(pool, a.rows[0]);
  });
}

export async function loadBundle(pool: pg.Pool, albumRow: any): Promise<AlbumBundle> {
  const [pages, media] = await Promise.all([
    pool.query('select * from pages where album_id = $1 order by position', [albumRow.id]),
    pool.query('select * from media where album_id = $1 order by created_at, id', [albumRow.id]),
  ]);
  return { album: toAlbumDTO(albumRow), pages: pages.rows.map(toPageDTO), media: media.rows.map(toMediaDTO) };
}
