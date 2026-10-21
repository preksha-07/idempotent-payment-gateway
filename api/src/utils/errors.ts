/**
 * errors.ts
 *
 * Application error hierarchy and error codes.
 *
 * All application errors extend AppError so the error handler middleware
 * can reliably identify them and produce a consistent API response format.
 *
 * Error codes are string constants so they are meaningful in logs and
 * client error handling (not just HTTP status numbers).
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'MISSING_IDEMPOTENCY_KEY'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'PAYMENT_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'INVALID_STATE_TRANSITION'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';

/**
 * Base class for all known application errors.
 * The error handler middleware checks instanceof AppError
 * to decide whether to expose the message or return a generic 500.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Operational errors are expected; programming errors are not
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class MissingIdempotencyKeyError extends AppError {
  constructor() {
    super(
      'The Idempotency-Key header is required for this request.',
      400,
      'MISSING_IDEMPOTENCY_KEY'
    );
  }
}

export class InvalidIdempotencyKeyError extends AppError {
  constructor(message: string) {
    super(message, 400, 'INVALID_IDEMPOTENCY_KEY');
  }
}

/**
 * Returned when the same idempotency key is reused with a different
 * request body (different fingerprint). This prevents accidental
 * mutation of an existing operation.
 */
export class IdempotencyKeyConflictError extends AppError {
  constructor() {
    super(
      'The idempotency key was already used with a different request payload.',
      409,
      'IDEMPOTENCY_KEY_CONFLICT'
    );
  }
}

export class PaymentNotFoundError extends AppError {
  constructor(id: string) {
    super(`Payment not found: ${id}`, 404, 'PAYMENT_NOT_FOUND');
  }
}

export class CustomerNotFoundError extends AppError {
  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`, 404, 'CUSTOMER_NOT_FOUND');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    // Never expose raw DB messages to the client — the controller/middleware
    // logs the original error and replaces it with this generic wrapper.
    super(message, 500, 'DATABASE_ERROR');
  }
}
