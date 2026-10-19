import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type PgBoss from 'pg-boss';
import type pg from 'pg';
import type { Config } from './config.js';
import { authUrl, ensureFolder, exchangeCode, accessToken, revoke } from './drive.js';
import { JOB_DRIVE_BACKUP } from './queue.js';
import { decryptSecret, encryptSecret } from './secrets.js';

// /manage "Backup Drive": connect the owner's Google Drive, pick the schedule, run now, disconnect.
export type DriveSchedule = 'weekly' | 'daily' | 'off';
const CRON: Record<Exclude<DriveSchedule, 'off'>, string> = { weekly: '0 3 * * 0', daily: '0 3 * * *' };
const TZ = 'Asia/Ho_Chi_Minh';
const VN_OFFSET = 7 * 3600_000; // Vietnam has no daylight saving
export const STALE_MS = 4 * 3600_000; // a run "running" longer than the job expiry was cut off (worker restart)

// Next 03:00 in Vietnam (a Sunday for weekly), as a UTC Date.
export function nextRunAt(schedule: DriveSchedule, now = new Date()): Date | null {
  if (schedule === 'off') return null;
  const vn = new Date(now.getTime() + VN_OFFSET);
  const t = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), 3));
  while (t <= vn || (schedule === 'weekly' && t.getUTCDay() !== 0)) t.setUTCDate(t.getUTCDate() + 1);
  return new Date(t.getTime() - VN_OFFSET);
}

export async function applySchedule(boss: PgBoss, schedule: DriveSchedule): Promise<void> {
  if (schedule === 'off') await boss.unschedule(JOB_DRIVE_BACKUP);
  else await boss.schedule(JOB_DRIVE_BACKUP, CRON[schedule], {}, { tz: TZ });
}

const redirectUri = (req: FastifyRequest) => `${req.protocol}://${req.host}/api/manage/drive/callback`;

export function registerDriveRoutes(app: FastifyInstance, pool: pg.Pool, config: Config, boss: PgBoss): void {
  const configured = () => !!(config.googleClientId && config.googleClientSecret);
  const row = async () => (await pool.query('select * from drive_backup where id = 1')).rows[0];

  app.get('/api/manage/drive', async () => {
    const r = await row();
    const connected = !!r?.refresh_enc;
    return {
      configured: configured(), connected, email: r?.account_email ?? null,
      schedule: (r?.schedule ?? 'weekly') as DriveSchedule, status: r?.status ?? 'idle', message: r?.message ?? null,
      startedAt: r?.started_at ?? null, finishedAt: r?.finished_at ?? null,
      bytesSent: r?.bytes_sent === null || r?.bytes_sent === undefined ? null : Number(r.bytes_sent),
      lastBytes: r?.last_bytes === null || r?.last_bytes === undefined ? null : Number(r.last_bytes),
      nextRun: connected ? nextRunAt(r.schedule)?.toISOString() ?? null : null,
    };
  });

  app.get('/api/manage/drive/connect', async (req, reply) => {
    if (!configured()) return reply.code(400).send({ error: 'Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.' });
    const state = randomBytes(24).toString('base64url');
    req.session.set('driveState', state);
    return reply.redirect(authUrl(config, redirectUri(req), state), 302);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/manage/drive/callback', async (req, reply) => {
    const expected = req.session.get('driveState');
    req.session.set('driveState', undefined);
    if (!expected || req.query.state !== expected) return reply.code(400).send({ error: 'Phiên kết nối không hợp lệ — hãy thử lại.' });
    if (!req.query.code) return reply.redirect('/manage#drive', 302); // the owner cancelled on Google's page
    const { refreshToken, email } = await exchangeCode(config, req.query.code, redirectUri(req));
    const folder = await ensureFolder(config, await accessToken(config, refreshToken), (await row())?.folder_id ?? null);
    const { rows } = await pool.query(`insert into drive_backup (id, account_email, refresh_enc, folder_id, status, message)
      values (1, $1, $2, $3, 'idle', null)
      on conflict (id) do update set account_email = $1, refresh_enc = $2, folder_id = $3, status = 'idle', message = null
      returning schedule`, [email, encryptSecret(refreshToken, config.sessionSecret), folder]);
    await applySchedule(boss, rows[0].schedule);
    return reply.redirect('/manage#drive', 302);
  });

  app.patch<{ Body: { schedule: DriveSchedule } }>('/api/manage/drive', {
    schema: { body: { type: 'object', required: ['schedule'], additionalProperties: false, properties: { schedule: { enum: ['weekly', 'daily', 'off'] } } } },
  }, async (req, reply) => {
    const r = await row();
    if (!r?.refresh_enc) return reply.code(400).send({ error: 'Chưa kết nối Google Drive.' });
    await pool.query('update drive_backup set schedule = $1 where id = 1', [req.body.schedule]);
    await applySchedule(boss, req.body.schedule);
    return { schedule: req.body.schedule };
  });

  app.post('/api/manage/drive/run', async (_req, reply) => {
    const r = await row();
    if (!r?.refresh_enc) return reply.code(400).send({ error: 'Chưa kết nối Google Drive.' });
    if (r.status === 'running' && Date.now() - new Date(r.started_at).getTime() < STALE_MS) return reply.code(409).send({ error: 'Đang backup…' });
    await boss.send(JOB_DRIVE_BACKUP, {});
    return { queued: true };
  });

  // Existing backup files stay in Drive.
  app.delete('/api/manage/drive', async (_req, reply) => {
    const r = await row();
    if (r?.refresh_enc) await revoke(config, decryptSecret(r.refresh_enc, config.sessionSecret)).catch(() => {});
    await pool.query('delete from drive_backup where id = 1');
    await applySchedule(boss, 'off');
    return reply.code(204).send();
  });
}
