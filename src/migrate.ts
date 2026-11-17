import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { pool, withTx } from './db';

async function main() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
  );
  const dir = join(__dirname, '..', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rowCount) continue;
    await withTx(async (c) => {
      await c.query(readFileSync(join(dir, file), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log('Migrasi diterapkan:', file);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
