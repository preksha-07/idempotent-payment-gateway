# Architecture

The project is built around a single question:

> **How can a client safely retry a payment request when it cannot tell whether the first request was processed?**

The implementation keeps the answer deliberately small: reserve an idempotency key in PostgreSQL, create the payment in the same short transaction, then process the payment outside that transaction.

---

## 1. Request path

```text
React UI
   │
   │ POST /api/payments + Idempotency-Key
   ▼
Express controller
   │
   │ validation
   ▼
Payment service
   │
   ├── request fingerprint
   ├── short DB transaction
   │      ├── reserve idempotency key
   │      └── create payment
   │
   └── simulated processor
          │
          ├── CREATED → PROCESSING
          └── PROCESSING → SUCCESS / FAILED
```

The frontend also exposes small labs for the failure and concurrency cases so the design can be observed directly.

## 2. Why a payment needs an idempotency key

`POST /payments` normally creates a new resource, so repeating the request can create another payment.

The client therefore generates a key for one logical operation and reuses that key when retrying.

```text
first request:  key K + payload P → payment P001
retry:          key K + payload P → replay P001
new operation:  key K2 + payload P → payment P002
```

The key identifies the logical operation. It is not the payment ID.

## 3. Request fingerprinting

The service computes a SHA-256 fingerprint from the business fields that define the request.

If a client sends:

```text
key = K
payload = P1
```

and later sends:

```text
key = K
payload = P2
```

the fingerprints differ. The API returns `409 Conflict` rather than silently treating the second request as the original operation.

The simulation's delay and outcome are included in the fingerprint because they affect the behaviour of this demo.

## 4. The race condition

A tempting implementation is:

```typescript
const existing = await findByKey(key);
if (!existing) {
  await createPayment();
  await saveKey(key);
}
```

That has a race:

```text
Request A                    Request B
   │                            │
   ├─ SELECT → none            │
   │                            ├─ SELECT → none
   │                            │
   ├─ create payment            ├─ create payment
   │                            │
   └─ save key                  └─ save key → conflict
```

The application has made a decision based on a check that another request can invalidate immediately afterwards.

## 5. Database-level reservation

The project instead makes the key unique:

```sql
key TEXT UNIQUE NOT NULL
```

and reserves it with:

```sql
INSERT INTO idempotency_keys (...)
VALUES (...)
ON CONFLICT (key) DO NOTHING;
```

When concurrent requests use the same key, PostgreSQL decides which insert wins. One request gets the reservation; the others discover that the key already exists and read the existing record.

This is stronger than an in-memory lock because the rule lives in the database shared by the API instances.

## 6. Why the reservation is a short transaction

The key reservation and payment row are created together:

```text
BEGIN
  reserve key
  create payment
COMMIT
```

The simulated processor does **not** run inside this transaction.

Holding a database transaction open while waiting for a processor or network call would keep a database connection occupied unnecessarily. The project commits the durable reservation first and performs the slower work afterwards.

## 7. Payment state machine

A newly created payment starts at:

```text
CREATED
   │
   ▼
PROCESSING
   │
   ├───────────────┐
   ▼               ▼
SUCCESS           FAILED
```

`startProcessing()` uses a conditional update from `CREATED` to `PROCESSING`, so a payment cannot be started twice through that transition.

When processing finishes, the payment row is updated and the idempotency record stores a response snapshot. A later retry can therefore return the same logical result without running the processor again.

## 8. Lost-response scenario

The most useful demo is:

```text
Client → POST payment → server completes payment
                         │
                         └── response is deliberately dropped

Client → retry with same key
       → existing idempotency record found
       → stored result replayed
```

The project destroys the response socket for the simulation. The database work has already completed, so the retry demonstrates why idempotency is needed in the first place.

## 9. Concurrency

The concurrency lab sends many requests using the same key at approximately the same time.

The important result is not that every request receives `201`. The important result is that the system creates one logical payment for that key and the remaining requests observe or replay that same operation.

A second test uses different keys to show that independent payments are not accidentally serialized behind one global lock.

## 10. Response snapshots

After processing completes, the API stores the response fields associated with the idempotency key.

That lets a retry return the original logical result rather than rebuilding a potentially different response later.

## 11. Recovery

A payment that remains in `PROCESSING` longer than the configured timeout can be found by the recovery endpoint and marked `FAILED`.

This is intentionally conservative for a simulator. In a real gateway, a timeout is not proof that the external provider failed. The system would reconcile the payment with the provider before deciding its final state.

## 12. What this project does not claim

This project does **not** claim exactly-once execution against an external payment processor. It has no external processor.

The meaningful guarantee is:

> **For a given idempotency key, this database-backed system creates at most one logical payment record and safely replays the stored result for matching retries.**

A production payment integration would need provider-side idempotency, reconciliation, authentication, fraud controls, durable background processing, monitoring, key-retention policy and other infrastructure.
