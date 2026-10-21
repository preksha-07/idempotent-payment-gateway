# API — Idempotent Payment Gateway

This folder contains the Express/TypeScript backend for the payment gateway simulator.

The API is deliberately small. The interesting part is not the number of endpoints; it is how the `POST /payments` path behaves when the same logical request is retried or arrives concurrently.

## Local setup

### Requirements

- Node.js 18+
- npm
- Docker Desktop with the PostgreSQL containers running

From the repository root:

```bash
docker-compose up -d postgres postgres_test
```

Then:

```bash
cd api
npm install
npm run migrate
npm run dev
```

The API listens on port `3001` by default.

## Request flow

A payment request goes through these stages:

1. Validate the `Idempotency-Key` header and request body.
2. Verify that the customer exists.
3. Build a SHA-256 fingerprint from the business fields of the request.
4. Start a short PostgreSQL transaction.
5. Try to reserve the idempotency key with `ON CONFLICT DO NOTHING`.
6. If the reservation succeeds, create the payment record and commit.
7. Run the simulated processor **after** the transaction has committed.
8. Store the final response snapshot for future replays.
9. If another request already owns the key, compare its fingerprint and either replay the result, report that processing is still in progress, or return a conflict.

The reservation and payment creation happen in the same transaction so that the database does not end up with a key pointing at a payment that was never committed.

## Why the key is important

A request such as:

```http
POST /api/payments
Idempotency-Key: 8e8c...
```

represents one logical operation. A retry should reuse the same key. A genuinely new payment should receive a new key.

The request fingerprint prevents a client from accidentally reusing an existing key for a different payment. In that case the API returns `409 Conflict` rather than silently changing the meaning of the original key.

## Database model

The database has three main tables:

- `customers` — seeded customers used by the simulator.
- `payments` — the business record for each logical payment.
- `idempotency_keys` — the API-level record that associates a key with a payment and stores the replay result.

The important constraint is:

```sql
key TEXT UNIQUE NOT NULL
```

combined with:

```sql
ON CONFLICT (key) DO NOTHING
```

This is the concurrency boundary. The application does not rely on a process-local `Map` or mutex.

## Running the tests

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:api
npm run test:concurrency
```

The concurrency tests are intended to answer a simple question: if many clients send the same logical payment at once, do we still end up with one payment record?

## Demo flow

For a short project demonstration:

1. Create a normal payment.
2. Open **Retry Lab** and send the same logical request.
3. Simulate a lost response.
4. Retry with the same idempotency key.
5. Show that the original payment ID is replayed.
6. Run the concurrency test.
7. Run the conflict demo with the same key and a changed amount.

## Production boundary

The project stops at the reliability concept it is intended to demonstrate. It does not process real cards or money and does not claim PCI compliance or exactly-once execution against an external provider.

A real gateway would also need authentication, authorization, fraud controls, provider reconciliation, webhook handling, durable background jobs, observability, key-retention policies and much more.
