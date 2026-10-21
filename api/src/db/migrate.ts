/**
 * migrate.ts
 *
 * Simple migration runner.
 * Reads all .sql files from migrations/ in lexicographic order and executes them.
 * Uses a migrations_log table to track which files have been applied so it
 * is safe to run multiple times (idempotent, naturally).
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { pool } from './pool';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const client = await pool.connect();
  try {
    // Create tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id         SERIAL PRIMARY KEY,
        filename   TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM migrations_log WHERE filename = $1',
        [file]
      );

      if (rowCount && rowCount > 0) {
        logger.debug({ file }, 'Migration already applied, skipping');
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations_log (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ file }, 'Migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('All migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
