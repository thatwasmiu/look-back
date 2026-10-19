import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { uuidParams } from './albums.js';
import type { Config } from './config.js';
import { deleteMediaRows } from './mediaFiles.js';
import { checkBucket, type BucketConfig } from './objectStore.js';
import { decryptSecret, encryptSecret } from './secrets.js';

// Storage locations (S3-compatible buckets) managed on the hidden /manage page. The VPS disk is the implicit
// location (media.storage_id null) and has no row. Secret keys are stored encrypted and never sent back.

const SELECT = `select l.*,
  (select count(*)::int from media m where m.storage_id = l.id) as files,
  (select coalesce(sum(m.bytes), 0)::bigint from media m where m.storage_id = l.id) as used_bytes,
  (select count(*)::int from pending_deletes p where p.storage_id = l.id) as pending
  from storage_locations l`;

const toDTO = (r: any) => ({
  id: r.id, name: r.name, kind: r.kind, endpoint: r.endpoint, region: r.region, bucket: r.bucket,
  accessKeyId: r.access_key_id, capBytes: r.cap_bytes === null ? null : Number(r.cap_bytes),
  status: r.check_status, statusMessage: r.check_message, checkedAt: r.checked_at,
  files: r.files, bytes: Number(r.used_bytes), pendingDeletes: r.pending,
});

// The bucket behind a location, ready for objectStore; null when the row is gone or its keys must be re-entered.
export async function loadBucket(pool: pg.Pool, sessionSecret: string, storageId: string): Promise<BucketConfig | null> {
  const r = (await pool.query('select * from storage_locations where id = $1', [storageId])).rows[0];
  if (!r?.secret_enc) return null;
  return { endpoint: r.endpoint, region: r.region, bucket: r.bucket, accessKeyId: r.access_key_id,
    secretAccessKey: decryptSecret(r.secret_enc, sessionSecret) };
}

// Record the outcome of talking to a location (null = it worked).
export async function markLocation(pool: pg.Pool, storageId: string, error: string | null): Promise<void> {
  await pool.query(`update storage_locations set check_status = $2, check_message = $3, checked_at = now()
    where id = $1 and check_status <> 'needs-keys'`, [storageId, error ? 'error' : 'ok', error]);
}

type Body = { name?: string; endpoint?: string; region?: string; bucket?: string; accessKeyId?: string; secretAccessKey?: string; capBytes?: number | null };
const str = { type: 'string', minLength: 1, maxLength: 500 } as const;
const cap = { type: ['integer', 'null'], minimum: 1 } as const;
const createSchema = { body: { type: 'object', required: ['name', 'endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'], additionalProperties: false,
  properties: { name: str, endpoint: { type: 'string', pattern: '^https?://', maxLength: 500 }, region: str, bucket: str, accessKeyId: str, secretAccessKey: str, capBytes: cap } } };
const patchSchema = { ...uuidParams, body: { type: 'object', additionalProperties: false, minProperties: 1,
  properties: { name: str, accessKeyId: str, secretAccessKey: str, capBytes: cap } } };

export function registerLocations(app: FastifyInstance, pool: pg.Pool, config: Config): void {
  const one = async (id: string) => (await pool.query(`${SELECT} where l.id = $1`, [id])).rows[0];
  const nameTaken = (e: any) => e?.code === '23505';

  app.get('/api/manage/locations', async () => (await pool.query(`${SELECT} order by l.created_at`)).rows.map(toDTO));

  app.post<{ Body: Body }>('/api/manage/locations', { schema: createSchema }, async (req, reply) => {
    const b = req.body;
    const bucket: BucketConfig = { endpoint: b.endpoint!, region: b.region ?? 'auto', bucket: b.bucket!, accessKeyId: b.accessKeyId!, secretAccessKey: b.secretAccessKey! };
    const err = await checkBucket(bucket);
    if (err) return reply.code(400).send({ error: err });
    try {
      const { rows } = await pool.query(`insert into storage_locations (name, kind, endpoint, region, bucket, access_key_id, secret_enc, cap_bytes, checked_at)
        values ($1, 's3', $2, $3, $4, $5, $6, $7, now()) returning id`,
      [b.name, bucket.endpoint, bucket.region, bucket.bucket, bucket.accessKeyId, encryptSecret(bucket.secretAccessKey, config.sessionSecret), b.capBytes ?? null]);
      return reply.code(201).send(toDTO(await one(rows[0].id)));
    } catch (e) {
      if (nameTaken(e)) return reply.code(409).send({ error: 'Tên nơi lưu đã có.' });
      throw e;
    }
  });

  // Name / cap change freely; new keys are checked against the bucket first and leave the row untouched on failure.
  app.patch<{ Params: { id: string }; Body: Body }>('/api/manage/locations/:id', { schema: patchSchema }, async (req, reply) => {
    const row = await one(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const b = req.body;
    let secretEnc: string | undefined;
    if (b.accessKeyId !== undefined || b.secretAccessKey !== undefined) {
      const current = await loadBucket(pool, config.sessionSecret, row.id);
      const secret = b.secretAccessKey ?? current?.secretAccessKey;
      if (!secret) return reply.code(400).send({ error: 'Cần nhập secret key.' });
      const err = await checkBucket({ endpoint: row.endpoint, region: row.region, bucket: row.bucket, accessKeyId: b.accessKeyId ?? row.access_key_id, secretAccessKey: secret });
      if (err) return reply.code(400).send({ error: err });
      secretEnc = encryptSecret(secret, config.sessionSecret);
    }
    try {
      await pool.query(`update storage_locations set name = coalesce($2, name), access_key_id = coalesce($3, access_key_id),
        secret_enc = coalesce($4, secret_enc), cap_bytes = case when $5 then $6::bigint else cap_bytes end,
        check_status = case when $4::text is null then check_status else 'ok' end,
        check_message = case when $4::text is null then check_message else null end where id = $1`,
      [row.id, b.name ?? null, b.accessKeyId ?? null, secretEnc ?? null, b.capBytes !== undefined, b.capBytes ?? null]);
    } catch (e) {
      if (nameTaken(e)) return reply.code(409).send({ error: 'Tên nơi lưu đã có.' });
      throw e;
    }
    return toDTO(await one(row.id));
  });

  app.post<{ Params: { id: string } }>('/api/manage/locations/:id/check', { schema: uuidParams }, async (req, reply) => {
    if (!(await one(req.params.id))) return reply.code(404).send({ error: 'not found' });
    const bucket = await loadBucket(pool, config.sessionSecret, req.params.id);
    if (bucket) await markLocation(pool, req.params.id, await checkBucket(bucket));
    return toDTO(await one(req.params.id));
  });

  // Plain removal: only an empty location (no media, no deletes still queued). A dead one is dropped instead.
  app.delete<{ Params: { id: string } }>('/api/manage/locations/:id', { schema: uuidParams }, async (req, reply) => {
    const row = await one(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    if (row.files > 0 || row.pending > 0) return reply.code(409).send({ error: 'Nơi lưu còn file — hãy chuyển file đi trước.' });
    await pool.query('delete from storage_locations where id = $1', [row.id]);
    return reply.code(204).send();
  });

  // A location that is gone for good: forget it and every media stored there (their frames empty out, covers and
  // music clear). Nothing is sent to the bucket. The caller must type the location's name.
  app.post<{ Params: { id: string }; Body: { confirmName?: string } }>('/api/manage/locations/:id/drop', {
    schema: { ...uuidParams, body: { type: 'object', required: ['confirmName'], properties: { confirmName: { type: 'string' } } } },
  }, async (req, reply) => {
    const row = await one(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    if (req.body.confirmName !== row.name) return reply.code(400).send({ error: 'Tên xác nhận không khớp.' });
    const c = await pool.connect();
    try {
      await c.query('begin');
      const ids = (await c.query('select id from media where storage_id = $1', [row.id])).rows.map((r) => r.id);
      const gone = await deleteMediaRows(c, ids);
      await c.query('delete from storage_locations where id = $1', [row.id]); // queued deletes go with it (cascade)
      await c.query('commit');
      return { dropped: gone.length };
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  });
}
