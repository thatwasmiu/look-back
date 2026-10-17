import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
import { createQueue } from './queue.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);
const boss = await createQueue(config.databaseUrl);
const app = await buildApp(config, pool, boss);
await app.listen({ port: config.port, host: '0.0.0.0' });
