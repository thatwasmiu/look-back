import PgBoss from 'pg-boss';

export const JOB_PROCESS_MEDIA = 'process-media';
export type ProcessMediaJob = { mediaId: string; uploadPath: string };
export const JOB_MOVE_MEDIA = 'move-media';
export type MoveMediaJob = { mediaId: string; to: string | null }; // to: a location id, null = the VPS disk

export async function createQueue(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (e) => console.error('pg-boss', e));
  await boss.start();
  // pg-boss expires (and retries) a job after 15 min by default, while ffmpeg keeps running.
  const opts = { name: JOB_PROCESS_MEDIA, retryLimit: 1, expireInSeconds: 4 * 3600 };
  await boss.createQueue(JOB_PROCESS_MEDIA, opts);
  await boss.updateQueue(JOB_PROCESS_MEDIA, opts); // createQueue is a no-op for an existing queue
  // A move is not retried by pg-boss: a failure is recorded on the media row and the owner retries from /manage.
  const move = { name: JOB_MOVE_MEDIA, retryLimit: 0, expireInSeconds: 4 * 3600 };
  await boss.createQueue(JOB_MOVE_MEDIA, move);
  await boss.updateQueue(JOB_MOVE_MEDIA, move);
  return boss;
}
