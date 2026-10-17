import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createQueue, JOB_PROCESS_MEDIA, type ProcessMediaJob } from './queue.js';
import { runProcessMedia } from './processing/run.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const boss = await createQueue(config.databaseUrl);

await boss.work<ProcessMediaJob>(JOB_PROCESS_MEDIA, { batchSize: 1 }, async ([job]) => {
  await runProcessMedia(job.data, pool, config);
});

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
