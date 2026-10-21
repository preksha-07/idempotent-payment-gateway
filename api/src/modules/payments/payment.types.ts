/**
 * payment.types.ts
 *
 * TypeScript types for the payments domain.
 * These mirror the database schema exactly so there is no impedance mismatch.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentStatus = 'CREATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface Payment {
  id: string;
  amount_minor: number;
  currency: string;
  customer_id: string;
  status: PaymentStatus;
  failure_reason: string | null;
  processor_reference: string | null;
  simulation_mode: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY KEY
// ─────────────────────────────────────────────────────────────────────────────

export type IdempotencyKeyStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface IdempotencyKey {
  id: string;
  key: string;
  request_fingerprint: string;
  payment_id: string;
  status: IdempotencyKeyStatus;
  http_status: number | null;
  response_snapshot: ResponseSnapshot | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API SHAPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cached response snapshot stored in idempotency_keys.response_snapshot.
 * Used to replay identical responses for duplicate requests.
 */
export interface ResponseSnapshot {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  customerId: string;
  processorReference: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Incoming payment request body (after Zod validation).
 */
export interface CreatePaymentBody {
  amount: number;
  currency: string;
  customerId: string;
  simulation: {
    outcome: 'SUCCESS' | 'FAILURE';
    delayMs: number;
    dropResponse: boolean;
  };
}

/**
 * Standardised API response envelope.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  requestId: string;
}

/**
 * Payment data returned in API responses (client-facing).
 */
export interface PaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  customerId: string;
  processorReference: string | null;
  failureReason: string | null;
  simulationMode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/**
 * Customer data as returned in list endpoints.
 */
export interface Customer {
  id: string;
  external_id: string;
  name: string;
  created_at: Date;
}
