/**
 * idempotency.repository.ts
 *
 * Database operations for the idempotency_keys table.
 *
 * THE CORE CONCURRENCY MECHANISM LIVES HERE.
 *
 * The most important function is `reserve()`. It uses:
 *
 *   INSERT INTO idempotency_keys (...) ON CONFLICT (key) DO NOTHING
 *
 * This is an ATOMIC operation in PostgreSQL. No matter how many concurrent
 * requests arrive with the same key, PostgreSQL guarantees that only ONE
 * of them can insert the row. The others see 0 rows affected and know
 * they need to look up the existing record instead.
 *
 * This works because PostgreSQL's UNIQUE constraint is enforced at the
 * storage level — it's not possible for two rows with the same key to
 * exist simultaneously, even if inserts happen in parallel.
 *
 * See ARCHITECTURE.md §5 for the full race condition analysis.
 */
import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import type { IdempotencyKey, IdempotencyKeyStatus, ResponseSnapshot } from './payment.types';
import { env } from '../../config/env';

export const idempotencyRepository = {
  /**
   * Attempt to atomically reserve an idempotency key.
   *
   * Returns:
   *   { inserted: true }  — this request "won" the race; proceed to create payment
   *   { inserted: false } — another request already reserved this key; look it up
   *
   * WHY GENERATE paymentId BEFORE CALLING THIS?
   *   We need to insert the idempotency_keys row and the payments row in the
   *   SAME transaction. If we generated the paymentId inside this function,
   *   we'd have a chicken-and-egg problem (idempotency_keys.payment_id references
   *   payments.id, but we haven't created the payment yet).
   *
   *   The solution: generate a UUID before the transaction, reserve the key with
   *   that UUID, then create the payment with the same UUID. Both are committed
   *   together. If the transaction rolls back, neither record exists.
   *
   * The PoolClient parameter means this runs INSIDE the caller's transaction.
   */
  async reserve(
    client: PoolClient,
    params: {
      key: string;
      requestFingerprint: string;
      paymentId: string;
    }
  ): Promise<{ inserted: boolean }> {
    const expiresAt = new Date(Date.now() + env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);

    const result = await client.query(
      `INSERT INTO idempotency_keys
         (id, key, request_fingerprint, payment_id, status, created_at, updated_at, expires_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, 'IN_PROGRESS', NOW(), NOW(), $4)
       ON CONFLICT (key) DO NOTHING`,
      [params.key, params.requestFingerprint, params.paymentId, expiresAt]
    );

    // rowCount = 1 → insert succeeded (we "won" the race)
    // rowCount = 0 → key already existed (another request got there first)
    return { inserted: (result.rowCount ?? 0) > 0 };
  },

  /**
   * Read an existing idempotency key record.
   * Uses SELECT ... FOR UPDATE to prevent concurrent readers from
   * acting on a stale IN_PROGRESS record simultaneously.
   *
   * This is NOT the primary concurrency protection — that's the UNIQUE constraint.
   * FOR UPDATE here prevents two retries from simultaneously reading an
   * IN_PROGRESS key and both trying to wait/proceed.
   */
  async findByKey(client: PoolClient, key: string): Promise<IdempotencyKey | null> {
    const { rows } = await client.query<IdempotencyKey>(
      `SELECT * FROM idempotency_keys
       WHERE key = $1
       FOR UPDATE`,
      [key]
    );
    return rows[0] ?? null;
  },

  /**
   * Find by key without locking — for read-only checks (e.g. health monitoring).
   */
  async findByKeyReadOnly(key: string): Promise<IdempotencyKey | null> {
    const { rows } = await pool.query<IdempotencyKey>(
      'SELECT * FROM idempotency_keys WHERE key = $1',
      [key]
    );
    return rows[0] ?? null;
  },

  /**
   * Mark the idempotency key as COMPLETED and store the response snapshot.
   * Called after the payment processor finishes (outside the reservation transaction).
   */
  async markCompleted(
    key: string,
    httpStatus: number,
    responseSnapshot: ResponseSnapshot
  ): Promise<void> {
    await pool.query(
      `UPDATE idempotency_keys
       SET
         status            = 'COMPLETED',
         http_status       = $2,
         response_snapshot = $3,
         updated_at        = NOW()
       WHERE key = $1`,
      [key, httpStatus, JSON.stringify(responseSnapshot)]
    );
  },

  /**
   * Mark the idempotency key as FAILED.
   * Called when an unexpected error occurs during processing.
   */
  async markFailed(key: string): Promise<void> {
    await pool.query(
      `UPDATE idempotency_keys
       SET status = 'FAILED', updated_at = NOW()
       WHERE key = $1`,
      [key]
    );
  },

  async markFailedByPaymentId(paymentId: string): Promise<void> {
    await pool.query(
      `UPDATE idempotency_keys
       SET status = 'FAILED', updated_at = NOW()
       WHERE payment_id = $1`,
      [paymentId]
    );
  },

  async countReplays(): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM idempotency_keys WHERE status = 'COMPLETED'"
    );
    return parseInt(rows[0].count, 10);
  },

  async countConflicts(): Promise<number> {
    // We don't store conflicts in the DB, but we can count keys used
    // for both — this is tracked via logs in V1
    return 0;
  },

  async findRecent(limit = 10): Promise<IdempotencyKey[]> {
    const { rows } = await pool.query<IdempotencyKey>(
      'SELECT * FROM idempotency_keys ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  },
};
