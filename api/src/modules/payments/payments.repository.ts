/**
 * payments.repository.ts
 *
 * All database operations for the payments table.
 * This layer only speaks SQL — no business logic lives here.
 *
 * WHY PARAMETERIZED QUERIES?
 * Using $1, $2, ... placeholders means the pg driver sends the SQL and
 * parameters separately to PostgreSQL, which makes SQL injection impossible.
 * Never concatenate user input into a SQL string.
 */
import { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import type { Payment, PaymentStatus, Customer } from './payment.types';

export const paymentsRepository = {
  /**
   * Insert a new payment record.
   * The caller provides the UUID so it can be pre-generated before the
   * idempotency reservation (see idempotency.repository.ts and ARCHITECTURE.md).
   */
  async create(
    client: PoolClient,
    params: {
      id: string;
      amount_minor: number;
      currency: string;
      customer_id: string;
      simulation_mode: string;
    }
  ): Promise<Payment> {
    const { rows } = await client.query<Payment>(
      `INSERT INTO payments
         (id, amount_minor, currency, customer_id, status, simulation_mode, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, 'CREATED', $5, NOW(), NOW())
       RETURNING *`,
      [params.id, params.amount_minor, params.currency, params.customer_id, params.simulation_mode]
    );
    return rows[0];
  },

  /**
   * Transition payment status.
   * Returns null if the payment was not found (prevents silent failures).
   */
  async updateStatus(
    id: string,
    status: PaymentStatus,
    extra?: {
      failure_reason?: string;
      processor_reference?: string;
      completed_at?: Date;
    }
  ): Promise<Payment | null> {
    const { rows } = await pool.query<Payment>(
      `UPDATE payments
       SET
         status              = $2,
         failure_reason      = COALESCE($3, failure_reason),
         processor_reference = COALESCE($4, processor_reference),
         completed_at        = COALESCE($5, completed_at),
         updated_at          = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        status,
        extra?.failure_reason ?? null,
        extra?.processor_reference ?? null,
        extra?.completed_at ?? null,
      ]
    );
    return rows[0] ?? null;
  },

  /**
   * Transition CREATED → PROCESSING.
   * Returns null if the payment doesn't exist or is already past CREATED.
   * This prevents double-starting processing.
   */
  async startProcessing(id: string): Promise<Payment | null> {
    const { rows } = await pool.query<Payment>(
      `UPDATE payments
       SET status = 'PROCESSING', updated_at = NOW()
       WHERE id = $1 AND status = 'CREATED'
       RETURNING *`,
      [id]
    );
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<Payment | null> {
    const { rows } = await pool.query<Payment>(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findAll(limit = 50, offset = 0): Promise<Payment[]> {
    const { rows } = await pool.query<Payment>(
      'SELECT * FROM payments ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return rows;
  },

  /**
   * Find payments that have been stuck in PROCESSING for longer than
   * `timeoutSeconds`. These are candidates for recovery/reconciliation.
   */
  async findStaleProcessing(timeoutSeconds: number): Promise<Payment[]> {
    const { rows } = await pool.query<Payment>(
      `SELECT * FROM payments
       WHERE status = 'PROCESSING'
         AND updated_at < NOW() - ($1 || ' seconds')::INTERVAL`,
      [timeoutSeconds]
    );
    return rows;
  },

  async countAll(): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM payments'
    );
    return parseInt(rows[0].count, 10);
  },

  async countByStatus(status: PaymentStatus): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM payments WHERE status = $1',
      [status]
    );
    return parseInt(rows[0].count, 10);
  },
};

export const customersRepository = {
  async findByExternalId(externalId: string): Promise<Customer | null> {
    const { rows } = await pool.query<Customer>(
      'SELECT * FROM customers WHERE external_id = $1',
      [externalId]
    );
    return rows[0] ?? null;
  },

  async findAll(): Promise<Customer[]> {
    const { rows } = await pool.query<Customer>(
      'SELECT * FROM customers ORDER BY name'
    );
    return rows;
  },
};
