import PgBoss from 'pg-boss';

export const JOB_PROCESS_MEDIA = 'process-media';
export type ProcessMediaJob = { mediaId: string; uploadPath: string };

export async function createQueue(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (e) => console.error('pg-boss', e));
  await boss.start();
  await boss.createQueue(JOB_PROCESS_MEDIA);
  return boss;
}
