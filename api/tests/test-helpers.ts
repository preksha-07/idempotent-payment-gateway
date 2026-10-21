/**
 * test-helpers.ts
 *
 * Shared setup/teardown for integration and API tests.
 * Runs migrations against the TEST database and provides a clean slate per test.
 */
import { pool } from '../src/db/pool';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '../src/db/migrations');

export async function runMigrations() {
  const client = await pool.connect();
  try {
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
      if (rowCount && rowCount > 0) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations_log (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    }
  } finally {
    client.release();
  }
}

/**
 * Wipe all transactional data between tests.
 * Truncates in reverse dependency order to respect foreign keys.
 */
export async function cleanDatabase() {
  await pool.query('TRUNCATE TABLE idempotency_keys, payments RESTART IDENTITY CASCADE');
}

/**
 * Close the pool after all tests complete.
 */
export async function closePool() {
  await pool.end();
}
