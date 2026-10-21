/**
 * pool.ts
 *
 * PostgreSQL connection pool.
 *
 * We use a single shared pool across the entire application.
 * pg's Pool handles connection lifecycle, limits, and timeouts automatically.
 *
 * WHY NOT CREATE CONNECTIONS MANUALLY?
 * Creating a new connection per request is expensive (~50–100ms).
 * A pool keeps connections alive and reuses them, which is essential
 * for the concurrency tests where 20 requests arrive simultaneously.
 */
import { Pool } from 'pg';
import { getDbConfig } from '../config/env';
import { logger } from '../utils/logger';

const config = getDbConfig();

export const pool = new Pool({
  ...config,
  max: 20,              // Maximum connections in pool
  idleTimeoutMillis: 30_000,   // Close connections idle for 30s
  connectionTimeoutMillis: 5_000, // Fail fast if can't connect in 5s
});

// Log and crash on unexpected pool-level errors (e.g. DB server went down)
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
  process.exit(1);
});

/**
 * Test that the database is reachable.
 * Called during startup health check.
 */
export async function checkDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info(
      { host: config.host, port: config.port, database: config.database },
      'Database connection established'
    );
  } finally {
    client.release();
  }
}
