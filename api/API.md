# API Reference

Base URL during local development:

```text
http://localhost:3001/api
```

Successful and error responses use the same envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "req_abc123"
}
```

For an error, `success` is `false`, `data` is `null`, and `error` contains a code and message.

---

## Health

### `GET /health`

Basic liveness check.

### `GET /ready`

Readiness check that also verifies database connectivity. Returns `503` when the database is unavailable.

---

## Payments

### `POST /payments`

Creates a payment or replays a previous request.

**Required header:**

```http
Idempotency-Key: <key>
```

The key must be present, no longer than 255 characters, and contain only letters, numbers, hyphens and underscores.

**Request:**

```json
{
  "amount": 50000,
  "currency": "INR",
  "customerId": "customer_001",
  "simulation": {
    "outcome": "SUCCESS",
    "delayMs": 1000,
    "dropResponse": false
  }
}
```

`amount` is stored in minor currency units. For INR, `50000` represents ₹500.00.

| Field | Required | Description |
|---|---|---|
| `amount` | yes | Positive integer in minor units |
| `currency` | yes | `INR`, `USD`, `EUR` or `GBP` |
| `customerId` | yes | Seeded external customer ID |
| `simulation.outcome` | yes | `SUCCESS` or `FAILURE` |
| `simulation.delayMs` | no | Processing delay, 0–10000 ms |
| `simulation.dropResponse` | no | Simulates a lost HTTP response |

### Responses

| Status | Meaning |
|---:|---|
| `201` | New payment completed successfully |
| `200` | Existing completed result replayed, or simulated failure result returned |
| `202` | Existing payment is still processing |
| `400` | Invalid request or idempotency key |
| `404` | Customer or payment not found |
| `409` | Same key was reused with a different request fingerprint |
| `500` | Unexpected server error |

A replayed response includes:

```http
X-Idempotency-Replay: true
```

### Example — first request

```http
POST /api/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

```json
{
  "amount": 50000,
  "currency": "INR",
  "customerId": "customer_001",
  "simulation": {
    "outcome": "SUCCESS",
    "delayMs": 0,
    "dropResponse": false
  }
}
```

The response contains a generated `paymentId` and `status: "SUCCESS"`.

### Example — replay

Send the same key and the same business payload again:

```http
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

The API returns the original payment ID and sets `X-Idempotency-Replay: true`.

### Example — conflict

If the same key is reused with a changed amount, currency, customer or other fingerprinted field, the request is rejected:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "IDEMPOTENCY_KEY_CONFLICT",
    "message": "The idempotency key was already used with a different request payload."
  },
  "requestId": "req_ghi789"
}
```

---

## Other payment endpoints

### `GET /payments`

Returns recent payments, newest first.

Optional query parameters:

```text
?limit=50&offset=0
```

### `GET /payments/:id`

Returns a single payment by UUID.

### `GET /payments/stats`

Returns aggregate counts for total, successful, failed, processing and created payments, plus the number of seeded customers.

### `GET /customers`

Returns the seeded customers used by the frontend.

### `POST /payments/admin/recover`

Finds payments that have remained in `PROCESSING` longer than the configured timeout and marks them as failed. In a real payment integration, this step would normally be paired with provider reconciliation rather than assuming that a timeout means the external payment failed.

---

## Error codes

| Code | HTTP | Meaning |
|---|---:|---|
| `MISSING_IDEMPOTENCY_KEY` | 400 | Header not supplied |
| `INVALID_IDEMPOTENCY_KEY` | 400 | Key is too long or contains invalid characters |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `CUSTOMER_NOT_FOUND` | 404 | Customer ID is unknown |
| `PAYMENT_NOT_FOUND` | 404 | Payment ID is unknown |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Key reused with a different fingerprint |
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Idempotency behaviour

| Situation | Result |
|---|---|
| New key + payload | New logical payment |
| Same key + same payload, completed | Original result is replayed |
| Same key + same payload, still processing | `202` with the existing payment |
| Same key + different payload | `409 Conflict` |
| Different key + same payload | New logical payment |
| Same key after a completed failure | The stored failure result is replayed |

A new payment attempt after a failed logical operation should use a new idempotency key.
