/**
 * fingerprint.ts
 *
 * Request fingerprinting for idempotency conflict detection.
 *
 * PURPOSE:
 * When the same idempotency key arrives twice, we need to determine whether
 * the second request represents the *same* logical operation or a *different* one.
 *
 * MECHANISM:
 * We compute a SHA-256 hash of a *canonical* JSON representation of the
 * business payload (amount, currency, customerId, simulation parameters).
 * Two requests are "the same operation" if and only if their fingerprints match.
 *
 * WHAT IS INCLUDED IN THE FINGERPRINT:
 *   - amount       (the monetary value — a different amount is a different operation)
 *   - currency     (INR vs USD are different operations)
 *   - customerId   (charging a different customer is a different operation)
 *   - simulation   (outcome, delayMs) — included because changing outcome for the
 *                  same key would be semantically ambiguous (see ARCHITECTURE.md)
 *
 * WHAT IS EXCLUDED FROM THE FINGERPRINT:
 *   - idempotency key itself  (it's the lookup key, not part of the content)
 *   - requestId               (a new requestId per retry is fine)
 *   - timestamp               (timestamps differ on every request by definition)
 *   - User-Agent / IP         (HTTP metadata, not business semantics)
 *   - dropResponse            (this is a *simulation control*, not part of the
 *                              logical payment operation itself — the same payment
 *                              can be retried even if the first response was dropped)
 *
 * CANONICALIZATION:
 * We sort object keys before JSON.stringify so that:
 *   { "a": 1, "b": 2 }  and  { "b": 2, "a": 1 }
 * produce the same fingerprint.
 */
import { createHash } from 'crypto';

export interface FingerprintPayload {
  amount: number;
  currency: string;
  customerId: string;
  simulation: {
    outcome: string;
    delayMs: number;
  };
}

/**
 * Recursively sorts object keys so JSON serialization is deterministic
 * regardless of the order properties arrive in the request body.
 */
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(sortedJson).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const sorted = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + sortedJson((value as Record<string, unknown>)[k]));
    return '{' + sorted.join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Compute the SHA-256 fingerprint for a payment request.
 * Returns a 64-character hex string.
 */
export function computeFingerprint(payload: FingerprintPayload): string {
  const canonical = sortedJson(payload);
  return createHash('sha256').update(canonical).digest('hex');
}
