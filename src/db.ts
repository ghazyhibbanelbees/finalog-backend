import { Pool, PoolClient, types } from 'pg';
import { config } from './config';

// Kolom DATE dikembalikan sebagai teks "YYYY-MM-DD" (bukan objek Date) agar tidak bergeser zona waktu.
types.setTypeParser(1082, (v: string) => v);

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
