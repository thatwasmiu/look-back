import pg from 'pg';

export const createPool = (url: string) => new pg.Pool({ connectionString: url });

// After a reboot Docker starts every container at once (restart policies ignore depends_on), so Postgres may
// still be starting or not resolvable yet. Wait for it instead of crashing; give up after ~2 minutes.
export async function waitForDb(
  pool: pg.Pool,
  { attempts = 60, delayMs = 2000, log = console.warn }: { attempts?: number; delayMs?: number; log?: (msg: string) => void } = {},
): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      log(`database not ready (${(err as Error).message}); retry ${i}/${attempts - 1}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
