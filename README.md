# Idempotent Payment Gateway

A small payment-system simulator built to explore one reliability problem: **what should happen when a client retries a payment request?**

The project uses an idempotency key, request fingerprinting, PostgreSQL constraints and short transactions to make retries safe within the system. It also includes deliberately simulated failures so the behaviour can be inspected rather than treated as a black box.

> **Important:** this project does not move real money and does not connect to a payment provider.

## What the project demonstrates

- A new payment creates one payment record.
- Reusing the same `Idempotency-Key` with the same request replays the existing result.
- Reusing the key with a different request returns `409 Conflict`.
- Concurrent requests using the same key compete at the database constraint rather than relying on an in-memory lock.
- A deliberately dropped HTTP response can be followed by a safe retry.
- Payment state moves through `CREATED → PROCESSING → SUCCESS/FAILED`.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| API | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| Validation | Zod |
| Tests | Vitest + Supertest |
| Local database | Docker Compose |

## Repository layout

```text
Payment Gateway/
├── api/                 # Express API, business logic, SQL repositories and tests
├── web/                 # React interface and reliability labs
├── docker-compose.yml   # Local PostgreSQL setup
└── README.md
```

## Run it locally

### Requirements

- Node.js 18+
- npm
- Docker Desktop

### 1. Start PostgreSQL

```bash
docker-compose up -d postgres postgres_test
```

### 2. Start the API

```bash
cd api
npm install
npm run migrate
npm run dev
```

The API runs on `http://localhost:3001` by default.

### 3. Start the web app

In another terminal:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`.

## The main reliability scenario

The easiest way to understand the project is to follow one request:

```text
Client
  │
  │ POST /payments
  │ Idempotency-Key: K
  ▼
API
  │
  ├── fingerprint request
  ├── reserve K in PostgreSQL
  ├── create payment row
  └── commit short transaction
          │
          ▼
     simulated processor
          │
          ▼
     store final result
```

If the response disappears after processing, the client can send the same request again with `K`. The server finds the existing reservation and returns the stored result instead of creating another payment.

The important part is the database boundary:

```sql
INSERT INTO idempotency_keys (...)
VALUES (...)
ON CONFLICT (key) DO NOTHING;
```

The `key` column has a `UNIQUE` constraint. That is what makes the reservation safe when identical requests arrive at the same time.

## Useful demo pages

### Overview
Shows current payment counts and recent activity.

### Send payment
Create a normal payment and inspect the request/result.

### Retry lab
Walk through the lost-response scenario: process → lose response → retry → replay.

### Concurrency
Send many requests at once and inspect how many logical payments were created.

### Key conflict
Reuse a key with a changed payload and see why the API returns `409`.

### Payment ledger
Inspect stored payment records and their state.

## Tests

From `api/`:

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:api
npm run test:concurrency
```

The concurrency suite is particularly important because it exercises the race condition the project is designed to handle.

## Scope and limitations

This is a focused systems demonstration, not a production payment platform. It intentionally leaves out card handling, authentication, fraud detection, PCI compliance, real processor integration, webhooks and multi-region infrastructure.

The simulated processor runs outside the reservation transaction. If processing becomes stale, the project exposes a recovery endpoint that marks timed-out processing as failed. A production integration would normally reconcile the state with the external processor before deciding that a payment failed.

Idempotency records currently receive a configurable expiry timestamp, but there is no background cleanup job in this version.

Most importantly, the project guarantees **one logical payment record per idempotency key inside this system**. It does not claim exactly-once execution against an external payment provider.

## Further documentation

- [`api/ARCHITECTURE.md`](./api/ARCHITECTURE.md) — design decisions and concurrency model
- [`api/API.md`](./api/API.md) — endpoint reference and examples
- [`api/README.md`](./api/README.md) — API setup and demo walkthrough
