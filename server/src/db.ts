import pg from 'pg';

export const createPool = (url: string) => new pg.Pool({ connectionString: url });
