/**
 * payments.service.ts
 *
 * Business logic for payment creation, retrieval, and recovery.
 *
 * THE COMPLETE IDEMPOTENCY FLOW:
 *
 * POST /api/payments with Idempotency-Key: K arrives here.
 *
 * 1. Validate the request (Zod, customer exists)
 * 2. Compute request fingerprint (SHA-256 of business payload)
 * 3. Generate a payment UUID
 * 4. Open a SHORT database transaction:
 *    a. Try INSERT idempotency_keys ON CONFLICT DO NOTHING
 *       → if 1 row inserted: we are the FIRST request with this key → continue
 *       → if 0 rows inserted: someone else already reserved this key → go to 5
 *    b. If we "won": INSERT payment with the pre-generated UUID → COMMIT
 * 5. If we "lost" the race:
 *    a. SELECT the existing idempotency_keys record (FOR UPDATE to be safe)
 *    b. Compare fingerprints
 *       → if different: 409 Conflict
 *       → if same: check status
 *         IN_PROGRESS → 202 (still processing, same paymentId)
 *         COMPLETED   → return cached response snapshot
 *         FAILED      → return error snapshot
 * 6. After transaction COMMIT, run simulated processor (outside transaction)
 * 7. Update idempotency_keys with result → done
 *
 * See ARCHITECTURE.md for why each step is designed this way.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/pool';
import { computeFingerprint } from '../../utils/fingerprint';
import { logger } from '../../utils/logger';
import {
  IdempotencyKeyConflictError,
  CustomerNotFoundError,
  PaymentNotFoundError,
} from '../../utils/errors';
import { paymentsRepository, customersRepository } from './payments.repository';
import { idempotencyRepository } from './idempotency.repository';
import { simulatePaymentProcessing } from './payment-processor';
import type {
  CreatePaymentBody,
  Payment,
  PaymentResponse,
  IdempotencyKey,
  ResponseSnapshot,
} from './payment.types';
import { env } from '../../config/env';

/**
 * The result of createPayment — includes what HTTP status to send
 * and whether to suppress the response (dropResponse simulation).
 */
export interface CreatePaymentResult {
  httpStatus: number;
  payment: PaymentResponse;
  isReplay: boolean;
  dropResponse: boolean;
}

function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    paymentId: payment.id,
    status: payment.status,
    amount: payment.amount_minor,
    currency: payment.currency,
    customerId: payment.customer_id,
    processorReference: payment.processor_reference,
    failureReason: payment.failure_reason,
    simulationMode: payment.simulation_mode,
    createdAt: payment.created_at.toISOString(),
    updatedAt: payment.updated_at.toISOString(),
    completedAt: payment.completed_at?.toISOString() ?? null,
  };
}

function snapshotToPaymentResponse(snap: ResponseSnapshot): PaymentResponse {
  return {
    paymentId: snap.paymentId,
    status: snap.status,
    amount: snap.amount,
    currency: snap.currency,
    customerId: snap.customerId,
    processorReference: snap.processorReference,
    failureReason: snap.failureReason,
    simulationMode: null,
    createdAt: snap.createdAt,
    updatedAt: snap.createdAt,
    completedAt: snap.completedAt,
  };
}

export const paymentsService = {
  /**
   * Create (or replay) a payment.
   * This is where all the idempotency logic lives.
   */
  async createPayment(
    idempotencyKey: string,
    body: CreatePaymentBody,
    requestId: string
  ): Promise<CreatePaymentResult> {
    // ── Validate customer exists ────────────────────────────────────────────
    const customer = await customersRepository.findByExternalId(body.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(body.customerId);
    }

    // ── Compute fingerprint ─────────────────────────────────────────────────
    // The fingerprint captures the business intent of this request.
    // If the same key arrives with a different fingerprint, it's a conflict.
    const fingerprint = computeFingerprint({
      amount: body.amount,
      currency: body.currency,
      customerId: body.customerId,
      simulation: {
        outcome: body.simulation.outcome,
        delayMs: body.simulation.delayMs,
      },
    });

    logger.debug(
      { requestId, idempotencyKeyPrefix: idempotencyKey.slice(0, 8), fingerprint: fingerprint.slice(0, 16) },
      'Computed request fingerprint'
    );

    // ── Generate payment UUID before the transaction ─────────────────────────
    // Why before? Because idempotency_keys.payment_id references payments.id.
    // We need both rows to be inserted in the same transaction, so we need
    // the payment UUID available when we insert the idempotency_keys row.
    const paymentId = uuidv4();

    // ── Short transaction: reserve key + create payment ───────────────────────
    // This transaction is intentionally BRIEF. We do NOT process the payment
    // here — that happens AFTER this transaction commits.
    const client = await pool.connect();
    let existingIdempotencyRecord: IdempotencyKey | null = null;
    let newPayment: Payment | null = null;

    try {
      await client.query('BEGIN');

      // THE CRITICAL ATOMIC OPERATION:
      // Try to insert the idempotency key. The UNIQUE constraint on key means
      // at most one concurrent request can succeed here.
      const { inserted } = await idempotencyRepository.reserve(client, {
        key: idempotencyKey,
        requestFingerprint: fingerprint,
        paymentId,
      });

      if (inserted) {
        // We "won" — this is a new request. Create the payment.
        newPayment = await paymentsRepository.create(client, {
          id: paymentId,
          amount_minor: body.amount,
          currency: body.currency,
          customer_id: customer.id,
          simulation_mode: body.simulation.outcome,
        });

        await client.query('COMMIT');

        logger.info(
          {
            requestId,
            paymentId,
            idempotencyKeyPrefix: idempotencyKey.slice(0, 8),
            event: 'payment_created',
          },
          'payment_created'
        );
      } else {
        // We "lost" — the key already exists. Read the existing record.
        // FOR UPDATE prevents two concurrent retries from racing on this.
        existingIdempotencyRecord = await idempotencyRepository.findByKey(client, idempotencyKey);
        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // ── Handle: existing idempotency record ──────────────────────────────────
    if (existingIdempotencyRecord) {
      // Check fingerprint match
      if (existingIdempotencyRecord.request_fingerprint !== fingerprint) {
        logger.warn(
          {
            requestId,
            idempotencyKeyPrefix: idempotencyKey.slice(0, 8),
            event: 'idempotency_conflict',
          },
          'idempotency_conflict'
        );
        throw new IdempotencyKeyConflictError();
      }

      logger.info(
        {
          requestId,
          paymentId: existingIdempotencyRecord.payment_id,
          idempotencyKeyPrefix: idempotencyKey.slice(0, 8),
          status: existingIdempotencyRecord.status,
          event: 'idempotency_replay',
        },
        'idempotency_replay'
      );

      // Fingerprints match — replay the existing result
      switch (existingIdempotencyRecord.status) {
        case 'IN_PROGRESS': {
          // Payment still processing — return 202 with current state
          const existingPayment = await paymentsRepository.findById(
            existingIdempotencyRecord.payment_id
          );
          if (!existingPayment) {
            throw new PaymentNotFoundError(existingIdempotencyRecord.payment_id);
          }
          return {
            httpStatus: 202,
            payment: toPaymentResponse(existingPayment),
            isReplay: true,
            dropResponse: false,
          };
        }

        case 'COMPLETED':
        case 'FAILED': {
          // Processing is done — replay the stored snapshot
          const snap = existingIdempotencyRecord.response_snapshot;
          if (snap) {
            return {
              httpStatus: existingIdempotencyRecord.http_status ?? 200,
              payment: snapshotToPaymentResponse(snap),
              isReplay: true,
              dropResponse: false,
            };
          }
          // Fallback: re-fetch from DB if snapshot somehow missing
          const existingPayment = await paymentsRepository.findById(
            existingIdempotencyRecord.payment_id
          );
          if (!existingPayment) {
            throw new PaymentNotFoundError(existingIdempotencyRecord.payment_id);
          }
          return {
            httpStatus: 200,
            payment: toPaymentResponse(existingPayment),
            isReplay: true,
            dropResponse: false,
          };
        }
      }
    }

    // ── New payment: run the simulated processor ──────────────────────────────
    // The reservation transaction has committed. We are now OUTSIDE any transaction.
    // This is the correct place to do slow work (network calls, setTimeout, etc.).
    if (!newPayment) {
      throw new Error('Unexpected: newPayment is null after successful reservation');
    }

    const result = await simulatePaymentProcessing(
      paymentId,
      idempotencyKey,
      {
        outcome: body.simulation.outcome,
        delayMs: body.simulation.delayMs,
        dropResponse: body.simulation.dropResponse,
      },
      requestId
    );

    return {
      httpStatus: result.payment.status === 'SUCCESS' ? 201 : 200,
      payment: toPaymentResponse(result.payment),
      isReplay: false,
      dropResponse: result.dropResponse,
    };
  },

  async getPayment(id: string): Promise<PaymentResponse> {
    const payment = await paymentsRepository.findById(id);
    if (!payment) {
      throw new PaymentNotFoundError(id);
    }
    return toPaymentResponse(payment);
  },

  async listPayments(limit = 50, offset = 0): Promise<PaymentResponse[]> {
    const payments = await paymentsRepository.findAll(limit, offset);
    return payments.map(toPaymentResponse);
  },

  async getStats() {
    const [total, success, failed, processing, created, customers] = await Promise.all([
      paymentsRepository.countAll(),
      paymentsRepository.countByStatus('SUCCESS'),
      paymentsRepository.countByStatus('FAILED'),
      paymentsRepository.countByStatus('PROCESSING'),
      paymentsRepository.countByStatus('CREATED'),
      customersRepository.findAll(),
    ]);
    return { total, success, failed, processing, created, customers: customers.length };
  },

  async getCustomers() {
    return customersRepository.findAll();
  },

  /**
   * Recovery: detect and resolve payments stuck in PROCESSING state.
   *
   * In V1 this simply marks them as FAILED with a timeout reason.
   * A real system would attempt reconciliation with the payment provider first.
   *
   * This operation is concurrency-safe because updateStatus uses:
   *   WHERE id = $1 AND status = 'PROCESSING'
   * which means only one process can transition a given payment.
   */
  async recoverStalePayments(requestId: string): Promise<{ recovered: number }> {
    const stale = await paymentsRepository.findStaleProcessing(env.PROCESSING_TIMEOUT_SECONDS);

    let recovered = 0;
    for (const payment of stale) {
      const updated = await paymentsRepository.updateStatus(payment.id, 'FAILED', {
        failure_reason: `Processing timed out after ${env.PROCESSING_TIMEOUT_SECONDS}s`,
        completed_at: new Date(),
      });

      if (updated) {
        await idempotencyRepository.markFailedByPaymentId(payment.id);
        recovered++;
        logger.warn(
          { requestId, paymentId: payment.id, event: 'stale_recovery' },
          'Stale payment marked FAILED'
        );
      }
    }

    return { recovered };
  },
};
