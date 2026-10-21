/**
 * fingerprint.test.ts — Unit tests
 *
 * Tests for the request fingerprinting utility.
 * These tests have no database dependency.
 */
import { describe, it, expect } from 'vitest';
import { computeFingerprint, type FingerprintPayload } from '../../src/utils/fingerprint';

const base: FingerprintPayload = {
  amount: 50000,
  currency: 'INR',
  customerId: 'customer_001',
  simulation: { outcome: 'SUCCESS', delayMs: 1000 },
};

describe('computeFingerprint', () => {
  it('produces a 64-character hex string', () => {
    const fp = computeFingerprint(base);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic — same input always produces same fingerprint', () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint(base));
  });

  it('is order-independent — object key order does not matter', () => {
    // Simulate out-of-order keys arriving in HTTP body
    const reordered: FingerprintPayload = {
      customerId: base.customerId,
      currency: base.currency,
      amount: base.amount,
      simulation: { delayMs: base.simulation.delayMs, outcome: base.simulation.outcome },
    };
    expect(computeFingerprint(base)).toBe(computeFingerprint(reordered));
  });

  it('produces DIFFERENT fingerprint when amount changes', () => {
    const modified = { ...base, amount: 5000 };
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(modified));
  });

  it('produces DIFFERENT fingerprint when currency changes', () => {
    const modified = { ...base, currency: 'USD' };
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(modified));
  });

  it('produces DIFFERENT fingerprint when customerId changes', () => {
    const modified = { ...base, customerId: 'customer_002' };
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(modified));
  });

  it('produces DIFFERENT fingerprint when simulation outcome changes', () => {
    const modified = {
      ...base,
      simulation: { ...base.simulation, outcome: 'FAILURE' as const },
    };
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(modified));
  });

  it('NOTE: delayMs IS part of the fingerprint', () => {
    // delayMs changes the simulation profile → considered a different operation
    const modified = {
      ...base,
      simulation: { ...base.simulation, delayMs: 5000 },
    };
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(modified));
  });
});
