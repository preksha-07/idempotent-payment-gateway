/**
 * schema.test.ts — Unit tests
 *
 * Tests for Zod request validation.
 */
import { describe, it, expect } from 'vitest';
import { createPaymentSchema } from '../../src/modules/payments/payment.schema';

const valid = {
  amount: 50000,
  currency: 'INR',
  customerId: 'customer_001',
  simulation: { outcome: 'SUCCESS', delayMs: 1000, dropResponse: false },
};

describe('createPaymentSchema', () => {
  it('accepts a valid payment request', () => {
    const result = createPaymentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const result = createPaymentSchema.safeParse({ ...valid, amount: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects zero amount', () => {
    const result = createPaymentSchema.safeParse({ ...valid, amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer amount', () => {
    const result = createPaymentSchema.safeParse({ ...valid, amount: 500.5 });
    expect(result.success).toBe(false);
  });

  it('rejects unsupported currency', () => {
    const result = createPaymentSchema.safeParse({ ...valid, currency: 'XYZ' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid simulation outcome', () => {
    const result = createPaymentSchema.safeParse({
      ...valid,
      simulation: { ...valid.simulation, outcome: 'REFUND' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects delayMs above 10 seconds', () => {
    const result = createPaymentSchema.safeParse({
      ...valid,
      simulation: { ...valid.simulation, delayMs: 15000 },
    });
    expect(result.success).toBe(false);
  });

  it('defaults delayMs to 1000 if not provided', () => {
    const input = { ...valid, simulation: { outcome: 'SUCCESS', dropResponse: false } };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.simulation.delayMs).toBe(1000);
  });

  it('defaults dropResponse to false if not provided', () => {
    const input = { ...valid, simulation: { outcome: 'SUCCESS', delayMs: 500 } };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.simulation.dropResponse).toBe(false);
  });
});
