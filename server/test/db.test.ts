import { expect, test, vi } from 'vitest';
import type pg from 'pg';
import { waitForDb } from '../src/db.js';

const starting = Object.assign(new Error('the database system is starting up'), { code: '57P03' });

test('waitForDb retries while Postgres is still starting, then resolves', async () => {
  const query = vi.fn().mockRejectedValueOnce(starting).mockRejectedValueOnce(starting).mockResolvedValue({ rows: [] });
  await waitForDb({ query } as unknown as pg.Pool, { attempts: 5, delayMs: 1, log: () => {} });
  expect(query).toHaveBeenCalledTimes(3);
});

test('waitForDb gives up after the last attempt with the real error', async () => {
  const query = vi.fn().mockRejectedValue(starting);
  await expect(waitForDb({ query } as unknown as pg.Pool, { attempts: 3, delayMs: 1, log: () => {} })).rejects.toThrow('starting up');
  expect(query).toHaveBeenCalledTimes(3);
});
