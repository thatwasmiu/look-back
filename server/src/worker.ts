import { loadConfig } from './config.js';
import { createPool, waitForDb } from './db.js';
import { createQueue, JOB_DRIVE_BACKUP, JOB_MOVE_MEDIA, JOB_PROCESS_MEDIA, type MoveMediaJob, type ProcessMediaJob } from './queue.js';
import { moveMedia } from './moveMedia.js';
import { runDriveBackup } from './driveBackup.js';
import { runProcessMedia } from './processing/run.js';
import { cleanupAbandonedUploads } from './uploads.js';
import { runPendingDeletes } from './mediaFiles.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await waitForDb(pool);
const boss = await createQueue(config.databaseUrl);

await boss.work<ProcessMediaJob>(JOB_PROCESS_MEDIA, { batchSize: 1 }, async ([job]) => {
  await runProcessMedia(job.data, pool, config);
});
await boss.work<MoveMediaJob>(JOB_MOVE_MEDIA, { batchSize: 1 }, async ([job]) => {
  await moveMedia(pool, config, job.data);
});
// Google Drive backup (cron schedule from /manage, or "Backup ngay").
await boss.work(JOB_DRIVE_BACKUP, { batchSize: 1 }, async () => {
  await runDriveBackup(pool, config);
});

const cleanup = () => cleanupAbandonedUploads(pool, config.uploadDir).catch((e) => console.error('upload cleanup', e));
void cleanup();
const cleanupTimer = setInterval(cleanup, 3600 * 1000);
// Bucket objects of deleted media (retried while a bucket is down).
const deletes = () => runPendingDeletes(pool, config).catch((e) => console.error('pending deletes', e));
void deletes();
const deletesTimer = setInterval(deletes, 10 * 60 * 1000);

const shutdown = async () => {
  clearInterval(cleanupTimer);
  clearInterval(deletesTimer);
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
