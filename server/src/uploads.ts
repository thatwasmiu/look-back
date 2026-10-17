import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type PgBoss from 'pg-boss';
import type { Config } from './config.js';
import { JOB_PROCESS_MEDIA, type ProcessMediaJob } from './queue.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
const HEIC = "HEIC not supported — choose 'Most Compatible' or let the browser convert to JPEG";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (body: string) => ({ status_code: 400, body });

export function registerUploads(app: FastifyInstance, config: Config, pool: pg.Pool, boss: PgBoss): void {
  const tus = new Server({
    path: '/api/uploads',
    datastore: new FileStore({ directory: config.uploadDir }),
    maxSize: config.maxUploadBytes,
    relativeLocation: true,
    namingFunction: () => randomUUID(), // also the media row id
    async onUploadCreate(_req, upload) {
      const { albumId, filename, filetype } = upload.metadata ?? {};
      if (!albumId || !filename || !filetype) return Promise.reject(bad('albumId, filename and filetype are required'));
      if (/heic|heif/i.test(filetype)) return Promise.reject(bad(HEIC));
      if (!ALLOWED.includes(filetype)) return Promise.reject(bad(`Unsupported file type: ${filetype}`));
      if (!UUID.test(albumId) || !(await pool.query('select 1 from albums where id=$1', [albumId])).rowCount) {
        return Promise.reject(bad('Unknown album'));
      }
      await pool.query(
        `insert into media (id, album_id, kind, status, original_name, mime) values ($1,$2,$3,'uploading',$4,$5)`,
        [upload.id, albumId, filetype.startsWith('video/') ? 'video' : 'image', filename, filetype],
      );
      return {};
    },
    async onUploadFinish(_req, upload) {
      await pool.query(`update media set status='processing' where id=$1`, [upload.id]);
      const job: ProcessMediaJob = { mediaId: upload.id, uploadPath: join(config.uploadDir, upload.id) };
      await boss.send(JOB_PROCESS_MEDIA, job);
      return {};
    },
  });

  // Leave tus bodies unparsed so the raw stream reaches the tus server.
  app.addContentTypeParser('application/offset+octet-stream', (_req, _payload, done) => done(null));
  // The session guard (global onRequest hook) has already run by the time this handler is reached.
  const handler = async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    reply.hijack();
    await tus.handle(req.raw, reply.raw);
  };
  app.all('/api/uploads', handler);
  app.all('/api/uploads/*', handler);
}
