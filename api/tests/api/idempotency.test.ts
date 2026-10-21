/**
 * idempotency.test.ts — API tests
 *
 * Tests for idempotency behavior via the full HTTP stack.
 * Uses Supertest against the real Express app + real PostgreSQL (test DB).
 *
 * WHY TEST THROUGH HTTP AND NOT JUST SERVICE FUNCTIONS?
 * Testing through HTTP proves the complete stack works:
 *   HTTP → Express → controller → service → repository → PostgreSQL
 * Testing only service functions would miss middleware bugs, header parsing
 * issues, and connection pool behavior.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { runMigrations, cleanDatabase, closePool } from '../test-helpers';

// Set NODE_ENV=test so the pool uses the test database
process.env.NODE_ENV = 'test';

const VALID_PAYLOAD = {
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

describe('POST /api/payments — idempotency cases', () => {
  // ── Case A: Same key + same payload → replay ────────────────────────────
  it('Case A: same key + same payload returns the same payment (201 then 200)', async () => {
    const key = 'test-key-case-a-' + Date.now();

    // First request — creates payment
    const res1 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(VALID_PAYLOAD);

    expect(res1.status).toBe(201);
    expect(res1.body.success).toBe(true);
    const paymentId = res1.body.data.paymentId;
    expect(paymentId).toBeTruthy();

    // Second request — same key, same payload → replay
    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(VALID_PAYLOAD);

    // Status 200 (replay) and SAME payment ID
    expect(res2.status).toBe(200);
    expect(res2.body.data.paymentId).toBe(paymentId);
    expect(res2.headers['x-idempotency-replay']).toBe('true');
  });

  // ── Case B: Same key + different payload → 409 ──────────────────────────
  it('Case B: same key + different amount returns 409 CONFLICT', async () => {
    const key = 'test-key-case-b-' + Date.now();

    await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(VALID_PAYLOAD);

    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send({ ...VALID_PAYLOAD, amount: 999999 }); // different amount!

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  // ── Case C: Different keys → two independent payments ───────────────────
  it('Case C: different keys create independent payments', async () => {
    const res1 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'test-key-c1-' + Date.now())
      .send(VALID_PAYLOAD);

    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'test-key-c2-' + Date.now())
      .send(VALID_PAYLOAD);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.paymentId).not.toBe(res2.body.data.paymentId);
  });

  // ── Case E: Retry after SUCCESS → same payment ──────────────────────────
  it('Case E: retry after SUCCESS returns original successful payment', async () => {
    const key = 'test-key-case-e-' + Date.now();

    const res1 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(VALID_PAYLOAD);

    expect(res1.status).toBe(201);
    expect(res1.body.data.status).toBe('SUCCESS');

    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(VALID_PAYLOAD);

    expect(res2.body.data.status).toBe('SUCCESS');
    expect(res2.body.data.paymentId).toBe(res1.body.data.paymentId);
  });

  // ── Case F: Retry after FAILURE → same failed result ────────────────────
  it('Case F: retry after FAILURE returns the same failed payment (no new attempt)', async () => {
    const key = 'test-key-case-f-' + Date.now();
    const failPayload = {
      ...VALID_PAYLOAD,
      simulation: { outcome: 'FAILURE', delayMs: 0, dropResponse: false },
    };

    const res1 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(failPayload);

    expect(res1.body.data.status).toBe('FAILED');
    const paymentId = res1.body.data.paymentId;

    // Retry — should return same failed payment, NOT create a new one
    const res2 = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(failPayload);

    expect(res2.body.data.paymentId).toBe(paymentId);
    expect(res2.body.data.status).toBe('FAILED');
  });

  // ── Missing idempotency key → 400 ────────────────────────────────────────
  it('returns 400 when Idempotency-Key header is missing', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  // ── Unknown customer → 404 ────────────────────────────────────────────────
  it('returns 404 for unknown customer', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'test-key-bad-customer-' + Date.now())
      .send({ ...VALID_PAYLOAD, customerId: 'nobody_exists' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  // ── Payment retrieval ──────────────────────────────────────────────────────
  it('GET /api/payments/:id returns the payment', async () => {
    const key = 'test-key-get-' + Date.now();
    const createRes = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', key)
      .send(VALID_PAYLOAD);

    const paymentId = createRes.body.data.paymentId;

    const getRes = await request(app).get(`/api/payments/${paymentId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.paymentId).toBe(paymentId);
  });

  it('GET /api/payments/:id returns 404 for unknown ID', async () => {
    const res = await request(app).get('/api/payments/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
