import { loadConfig } from './config.js';
import { createPool, waitForDb } from './db.js';
import { createQueue, JOB_PROCESS_MEDIA, type ProcessMediaJob } from './queue.js';
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
