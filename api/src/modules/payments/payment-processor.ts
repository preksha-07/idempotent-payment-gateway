/**
 * payment-processor.ts
 *
 * Simulated payment processor.
 *
 * PURPOSE:
 * In a real payment gateway, this layer would call an external payment provider
 * (Stripe, Razorpay, etc.) to charge a customer. Here we simulate that external
 * call so we can demonstrate retry/idempotency behavior without real money.
 *
 * IMPORTANT ARCHITECTURAL CONSTRAINT:
 * This processor runs AFTER the reservation transaction commits.
 *
 * WHY?
 * If we held the PostgreSQL transaction open while doing setTimeout(),
 * we would keep a database connection locked for the entire simulated
 * processing duration. With 20 concurrent requests and a 1-second delay,
 * we'd need 20 connections held open for 1 second each — that's wasteful
 * and doesn't scale. More importantly, long-running transactions block
 * other operations that need to read those rows.
 *
 * The correct pattern:
 *   1. Open a short transaction
 *   2. Reserve the idempotency key
 *   3. Create the payment record
 *   4. COMMIT (transaction is done)
 *   5. Run the processor outside any transaction
 *   6. Update the payment status in a new, short transaction
 *
 * LIMITATION:
 * If the server crashes between step 4 and step 6, the payment stays in
 * PROCESSING status permanently. In V1 this is handled by the "stale processing"
 * recovery mechanism — see payments.service.ts and ARCHITECTURE.md §8.
 *
 * RESPONSE DROPPING:
 * When simulation.dropResponse = true, we return a special signal to the
 * controller indicating it should NOT send a response to the HTTP client.
 * The payment STILL completes. The next retry with the same idempotency key
 * will get the stored result replayed from the database.
 * This simulates a network failure where the payment succeeded but the
 * response was lost in transit.
 */

import { logger } from '../../utils/logger';
import { paymentsRepository } from './payments.repository';
import { idempotencyRepository } from './idempotency.repository';
import type { Payment, ResponseSnapshot } from './payment.types';

export interface ProcessorOptions {
  outcome: 'SUCCESS' | 'FAILURE';
  delayMs: number;
  dropResponse: boolean;
}

export interface ProcessorResult {
  payment: Payment;
  dropResponse: boolean;
}

export async function simulatePaymentProcessing(
  paymentId: string,
  idempotencyKey: string,
  options: ProcessorOptions,
  requestId: string
): Promise<ProcessorResult> {
  // ── Step 1: transition CREATED → PROCESSING ──────────────────────────────
  const processing = await paymentsRepository.startProcessing(paymentId);
  if (!processing) {
    // Payment doesn't exist or is already past CREATED — shouldn't happen
    // in normal flow, but defensive check is important
    throw new Error(`Cannot start processing for payment ${paymentId}: unexpected state`);
  }

  logger.info(
    { requestId, paymentId, delayMs: options.delayMs, outcome: options.outcome },
    'payment_processing'
  );

  // ── Step 2: simulated network/processing delay ────────────────────────────
  if (options.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }

  // ── Step 3: apply outcome ─────────────────────────────────────────────────
  let finishedPayment: Payment | null;

  if (options.outcome === 'SUCCESS') {
    const processorRef = `proc_${Date.now()}_${paymentId.slice(0, 8)}`;
    finishedPayment = await paymentsRepository.updateStatus(paymentId, 'SUCCESS', {
      processor_reference: processorRef,
      completed_at: new Date(),
    });

    logger.info(
      { requestId, paymentId, processorRef, event: 'payment_completed' },
      'payment_completed'
    );
  } else {
    finishedPayment = await paymentsRepository.updateStatus(paymentId, 'FAILED', {
      failure_reason: 'Simulated payment failure',
      completed_at: new Date(),
    });

    logger.warn(
      { requestId, paymentId, event: 'payment_failed' },
      'payment_failed'
    );
  }

  if (!finishedPayment) {
    throw new Error(`Payment ${paymentId} disappeared during processing`);
  }

  // ── Step 4: store response snapshot in idempotency record ─────────────────
  // This is what gets replayed when the client retries.
  const httpStatus = options.outcome === 'SUCCESS' ? 201 : 200;
  const snapshot: ResponseSnapshot = {
    paymentId: finishedPayment.id,
    status: finishedPayment.status,
    amount: finishedPayment.amount_minor,
    currency: finishedPayment.currency,
    customerId: finishedPayment.customer_id,
    processorReference: finishedPayment.processor_reference,
    failureReason: finishedPayment.failure_reason,
    createdAt: finishedPayment.created_at.toISOString(),
    completedAt: finishedPayment.completed_at?.toISOString() ?? null,
  };

  await idempotencyRepository.markCompleted(idempotencyKey, httpStatus, snapshot);

  return {
    payment: finishedPayment,
    dropResponse: options.dropResponse,
  };
}
