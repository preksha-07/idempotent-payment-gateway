-- Migration 001: Core schema
-- Creates the three domain tables:
--   customers        — real entities being charged
--   payments         — business operations (one per logical payment)
--   idempotency_keys — API retry tracking
--
-- TABLE SEPARATION RATIONALE (important for interviews):
--
-- Why not combine payments and idempotency_keys?
--
-- `payments` represents a BUSINESS concept: money moving from a customer.
-- `idempotency_keys` represents an API PROTOCOL concept: "I already saw this request."
--
-- Keeping them separate means:
--   1. A payment can exist without an idempotency key (e.g. scheduled jobs)
--   2. The idempotency system can be understood and tested independently
--   3. Future versions could add more payment types without touching the
--      idempotency machinery
--   4. The schema is self-documenting — the tables explain their own purpose

-- ─────────────────────────────────────────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          UUID         PRIMARY KEY,
  external_id TEXT         UNIQUE NOT NULL,
  name        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY amount_minor (BIGINT)?
--   Floating-point arithmetic is lossy. 0.1 + 0.2 ≠ 0.3 in IEEE 754.
--   Financial systems always store amounts as integers in the smallest unit:
--   ₹500.00 = 50000 paise. Arithmetic on BIGINT is exact.
--
-- WHY status as TEXT with CHECK constraint?
--   Postgres ENUMs are harder to evolve (adding a value requires ALTER TYPE).
--   TEXT + CHECK gives us the same protection with simpler migrations.

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID         PRIMARY KEY,
  amount_minor        BIGINT       NOT NULL CHECK (amount_minor > 0),
  currency            CHAR(3)      NOT NULL,
  customer_id         UUID         NOT NULL REFERENCES customers(id),
  status              TEXT         NOT NULL
                        CHECK (status IN ('CREATED', 'PROCESSING', 'SUCCESS', 'FAILED')),
  failure_reason      TEXT         NULL,
  processor_reference TEXT         NULL,
  simulation_mode     TEXT         NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status      ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at  ON payments(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- IDEMPOTENCY KEYS
-- ─────────────────────────────────────────────────────────────────────────────
-- THE CRITICAL CONSTRAINT:
--   UNIQUE on `key` is the concurrency boundary.
--
-- WHY THIS WORKS (important for interviews):
--   PostgreSQL's UNIQUE constraint is enforced at the database level,
--   not in application code. When two requests arrive simultaneously
--   and both try INSERT INTO idempotency_keys (key, ...) ON CONFLICT DO NOTHING,
--   PostgreSQL guarantees that exactly ONE of them succeeds. The other gets
--   back 0 rows affected and knows it lost the race.
--
--   This works even if the two requests run in different Node.js processes,
--   different servers, or different threads — because the constraint lives
--   in the database, not in application memory.
--
-- WHY NOT AN IN-MEMORY MAP?
--   A Map<string, Payment> in Node.js only works within a single process.
--   It would fail under multiple API server instances and would be lost on restart.
--
-- status values for idempotency_keys:
--   IN_PROGRESS — key reserved, payment being processed
--   COMPLETED   — processing finished (SUCCESS or FAILED), response cached
--   FAILED      — an unexpected error occurred during processing

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id                  UUID         PRIMARY KEY,
  key                 TEXT         UNIQUE NOT NULL,   -- ← THE CRITICAL CONSTRAINT
  request_fingerprint TEXT         NOT NULL,
  payment_id          UUID         NOT NULL REFERENCES payments(id) DEFERRABLE INITIALLY DEFERRED,
  status              TEXT         NOT NULL
                        CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  http_status         INTEGER      NULL,
  response_snapshot   JSONB        NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key        ON idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_payment_id ON idempotency_keys(payment_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at)
  WHERE expires_at IS NOT NULL;
