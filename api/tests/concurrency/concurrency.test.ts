/**
 * concurrency.test.ts — THE MOST IMPORTANT TEST IN THIS PROJECT
 *
 * Verifies that the PostgreSQL unique constraint + INSERT ON CONFLICT DO NOTHING
 * correctly prevents duplicate payments when multiple requests arrive simultaneously.
 *
 * WHY THIS TEST MATTERS:
 * Any solution based on application-level locking (JavaScript Map, mutex,
 * check-then-insert) would fail under true concurrency. This test proves
 * that our database-backed approach is correct.
 *
 * HOW WE ACHIEVE TRUE CONCURRENCY:
 * We use Promise.all() to fire all HTTP requests simultaneously.
 * Node.js processes them concurrently, and the pg pool handles multiple
 * connections to PostgreSQL simultaneously — this is a genuine race condition.
 *
 * See ARCHITECTURE.md §5 for the full race condition analysis.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { runMigrations, cleanDatabase, closePool } from '../test-helpers';

process.env.NODE_ENV = 'test';

const PAYLOAD = {
  amount: 50000,
  currency: 'INR',
  customerId: 'customer_001',
  simulation: { outcome: 'SUCCESS', delayMs: 0, dropResponse: false },
};

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await closePool();
});

describe('Concurrency Tests', () => {
  /**
   * TEST 1 — THE CORE GUARANTEE
   *
   * 20 concurrent requests with the SAME idempotency key must produce
   * exactly 1 payment. All responses must reference the same paymentId.
   *
   * Without the UNIQUE constraint + ON CONFLICT DO NOTHING, this would
   * create up to 20 payments.
   */
  it('Test 1: 20 concurrent requests, same key → exactly 1 payment created', async () => {
    const CONCURRENT = 20;
    const key = 'concurrent-same-key-' + Date.now();

    // Fire all requests simultaneously
    const requests = Array.from({ length: CONCURRENT }, () =>
      request(app)
        .post('/api/payments')
        .set('Idempotency-Key', key)
        .send(PAYLOAD)
        .catch((err) => ({ status: 0, body: {}, error: err.message }))
    );

    const responses = await Promise.all(requests);

    // Collect successful responses (200 or 201)
    const successful = responses.filter(
      (r) => 'status' in r && (r.status === 200 || r.status === 201)
    );

    // Extract unique payment IDs from all responses
    const paymentIds = new Set(
      successful
        .map((r) => ('body' in r ? r.body?.data?.paymentId : undefined))
        .filter(Boolean)
    );

    console.log(`
      ─────────────────────────────────────
      Concurrency Test 1 Results:
        Requests sent:    ${CONCURRENT}
        Responses 2xx:    ${successful.length}
        Unique paymentIds: ${paymentIds.size}
      ─────────────────────────────────────
    `);

    // THE CRITICAL ASSERTION: exactly 1 unique payment ID
    expect(paymentIds.size).toBe(1);

    // All successful responses must reference the same payment
    expect(successful.length).toBe(CONCURRENT);
  }, 30000);

  /**
   * TEST 2 — INDEPENDENCE
   *
   * 20 concurrent requests with 20 DIFFERENT idempotency keys must produce
   * exactly 20 payments — one per key.
   */
  it('Test 2: 20 concurrent requests, 20 different keys → 20 independent payments', async () => {
    const CONCURRENT = 20;
    const timestamp = Date.now();

    const requests = Array.from({ length: CONCURRENT }, (_, i) =>
      request(app)
        .post('/api/payments')
        .set('Idempotency-Key', `concurrent-unique-key-${timestamp}-${i}`)
        .send(PAYLOAD)
    );

    const responses = await Promise.all(requests);

    const paymentIds = new Set(responses.map((r) => r.body?.data?.paymentId).filter(Boolean));

    console.log(`
      ─────────────────────────────────────
      Concurrency Test 2 Results:
        Requests sent:    ${CONCURRENT}
        Unique paymentIds: ${paymentIds.size}
      ─────────────────────────────────────
    `);

    expect(paymentIds.size).toBe(CONCURRENT);
    responses.forEach((r) => expect(r.status).toBe(201));
  }, 30000);

  /**
   * TEST 3 — CONFLICT DETECTION UNDER CONCURRENCY
   *
   * Request 1: key=K, amount=500
   * Request 2: key=K, amount=5000 (different payload, same key)
   *
   * One of these must win. The other must get 409 Conflict.
   * Neither can silently process both.
   */
  it('Test 3: same key + different payload → 409 conflict', async () => {
    const key = 'concurrent-conflict-key-' + Date.now();

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/payments')
        .set('Idempotency-Key', key)
        .send(PAYLOAD),
      request(app)
        .post('/api/payments')
        .set('Idempotency-Key', key)
        .send({ ...PAYLOAD, amount: 500000 }), // different amount
    ]);

    const statuses = [res1.status, res2.status].sort();
    console.log('Test 3 statuses:', statuses);

    // One request creates the payment, the other gets conflict or replay
    // The "winner" gets 201. The "loser" gets either:
    //   - 200 (replay, if fingerprints matched) → can't happen here since amounts differ
    //   - 409 (conflict, since fingerprints differ)
    const has201 = statuses.includes(201);
    const has409 = statuses.includes(409);

    expect(has201).toBe(true);
    expect(has409).toBe(true);

    // Only 1 payment created
    const paymentIds = new Set(
      [res1, res2]
        .filter((r) => r.body?.data?.paymentId)
        .map((r) => r.body.data.paymentId)
    );
    expect(paymentIds.size).toBe(1);
  }, 30000);

  /**
   * TEST 4 — RETRY AFTER SUCCESS
   *
   * Request 1 → creates payment → SUCCESS
   * Request 2 → same key + same payload → should get same paymentId
   */
  it('Test 4: retry after success returns same payment ID', async () => {
    const key = 'retry-after-success-' + Date.now();

    const res1 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(PAYLOAD);

    expect(res1.status).toBe(201);
    const originalId = res1.body.data.paymentId;

    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(PAYLOAD);

    expect(res2.body.data.paymentId).toBe(originalId);
    expect(res2.body.data.status).toBe('SUCCESS');
  });

  /**
   * TEST 5 — RETRY AFTER FAILURE
   *
   * A failed payment must NOT be retried automatically.
   * The same key returns the same failed result.
   */
  it('Test 5: retry after failure returns same failed payment, no new attempt', async () => {
    const key = 'retry-after-failure-' + Date.now();
    const failPayload = {
      ...PAYLOAD,
      simulation: { outcome: 'FAILURE', delayMs: 0, dropResponse: false },
    };

    const res1 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(failPayload);

    expect(res1.body.data.status).toBe('FAILED');
    const paymentId = res1.body.data.paymentId;

    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(failPayload);

    // Same payment ID, still FAILED, no new payment created
    expect(res2.body.data.paymentId).toBe(paymentId);
    expect(res2.body.data.status).toBe('FAILED');
  });
});
