import { loadConfig } from './config.js';
import { createPool, waitForDb } from './db.js';
import { createQueue, JOB_PROCESS_MEDIA, type ProcessMediaJob } from './queue.js';
import { runProcessMedia } from './processing/run.js';
import { cleanupAbandonedUploads } from './uploads.js';

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

const shutdown = async () => {
  clearInterval(cleanupTimer);
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
