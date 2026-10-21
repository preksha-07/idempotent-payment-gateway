/**
 * payment.schema.ts
 *
 * Zod schemas for request validation.
 *
 * Zod gives us:
 *   - Runtime validation with clear error messages
 *   - TypeScript types inferred from the schema (no duplication)
 *   - Coercion where needed (e.g. string numbers from query params)
 */
import { z } from 'zod';
import { env } from '../../config/env';

// Valid currencies for this demo
const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

export const createPaymentSchema = z.object({
  amount: z
    .number({ required_error: 'amount is required' })
    .int('amount must be an integer (minor units, e.g. 50000 for ₹500.00)')
    .positive('amount must be greater than 0'),

  currency: z.enum(SUPPORTED_CURRENCIES, {
    errorMap: () => ({
      message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
    }),
  }),

  customerId: z
    .string({ required_error: 'customerId is required' })
    .min(1, 'customerId cannot be empty')
    .max(100, 'customerId too long'),

  simulation: z.object({
    outcome: z.enum(['SUCCESS', 'FAILURE'], {
      errorMap: () => ({ message: 'simulation.outcome must be SUCCESS or FAILURE' }),
    }),

    delayMs: z
      .number()
      .int()
      .min(0, 'simulation.delayMs cannot be negative')
      .max(10_000, 'simulation.delayMs cannot exceed 10 seconds')
      .default(1000),

    dropResponse: z
      .boolean()
      .default(false),
  }),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// Idempotency key header validation
export function validateIdempotencyKey(key: string | undefined): string {
  if (!key || key.trim() === '') {
    throw new Error('MISSING');
  }
  const trimmed = key.trim();
  if (trimmed.length > env.IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new Error('TOO_LONG');
  }
  // Allow alphanumeric, hyphens, underscores (UUID format and common patterns)
  if (!/^[\w\-]+$/.test(trimmed)) {
    throw new Error('INVALID_CHARS');
  }
  return trimmed;
}
