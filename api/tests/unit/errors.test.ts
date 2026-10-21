/**
 * errors.test.ts — Unit tests
 *
 * Verify that error classes have correct statusCode, code, and isOperational.
 */
import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  MissingIdempotencyKeyError,
  IdempotencyKeyConflictError,
  PaymentNotFoundError,
  CustomerNotFoundError,
} from '../../src/utils/errors';

describe('Error classes', () => {
  it('ValidationError has 400 status', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.isOperational).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  it('MissingIdempotencyKeyError has 400 status', () => {
    const err = new MissingIdempotencyKeyError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('IdempotencyKeyConflictError has 409 status', () => {
    const err = new IdempotencyKeyConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('PaymentNotFoundError has 404 status', () => {
    const err = new PaymentNotFoundError('abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('PAYMENT_NOT_FOUND');
    expect(err.message).toContain('abc-123');
  });

  it('CustomerNotFoundError has 404 status', () => {
    const err = new CustomerNotFoundError('customer_001');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('CUSTOMER_NOT_FOUND');
  });
});
