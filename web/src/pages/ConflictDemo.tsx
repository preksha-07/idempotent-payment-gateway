import { useState } from 'react';
import { api, generateIdempotencyKey, formatAmount } from '../api/client';
import { Spinner } from '../components/PaymentComponents';

interface Step {
  label: string;
  amount: number;
  httpStatus: number | null;
  errorCode: string | null;
  paymentId: string | null;
  isReplay: boolean;
  note: string;
}

export function ConflictDemo() {
  const [key] = useState(generateIdempotencyKey());
  const [amount1] = useState(50000);   // ₹500
  const [amount2] = useState(500000);  // ₹5000
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const addStep = (s: Step) => setSteps((prev) => [...prev, s]);

  const run = async () => {
    setLoading(true);
    setSteps([]);
    setDone(false);

    const payload1 = {
      amount: amount1,
      currency: 'INR' as const,
      customerId: 'customer_001',
      simulation: { outcome: 'SUCCESS' as const, delayMs: 0, dropResponse: false },
    };

    const payload2 = { ...payload1, amount: amount2 };

    // ── Request 1 ─────────────────────────────────────────────────────────
    const res1 = await api.createPayment(key, payload1);
    addStep({
      label: 'Request 1',
      amount: amount1,
      httpStatus: res1.status,
      errorCode: res1.response.error?.code ?? null,
      paymentId: res1.response.data?.paymentId ?? null,
      isReplay: res1.isReplay,
      note: 'First request — creates payment P001 with amount ₹500',
    });

    await new Promise((r) => setTimeout(r, 600));

    // ── Request 2 (same key, different amount) ────────────────────────────
    const res2 = await api.createPayment(key, payload2);
    addStep({
      label: 'Request 2',
      amount: amount2,
      httpStatus: res2.status,
      errorCode: res2.response.error?.code ?? null,
      paymentId: res2.response.data?.paymentId ?? null,
      isReplay: res2.isReplay,
      note: 'Same key, different amount — fingerprint mismatch → 409 Conflict',
    });

    setDone(true);
    setLoading(false);
  };

  const reset = () => {
    setSteps([]);
    setDone(false);
    // reload to get a new key
    window.location.reload();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Conflict Demo</h1>
        <p className="page-description">
          Demonstrates what happens when the same idempotency key is reused with a{' '}
          <strong>different</strong> request payload — a 409 Conflict is returned to prevent
          ambiguity. The original payment is never mutated.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Explanation */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">The Scenario</div>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p>
                A client sends a payment for{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {formatAmount(amount1, 'INR')}
                </strong>{' '}
                with key <code className="mono" style={{ fontSize: '0.75rem' }}>{key.slice(0, 16)}…</code>
              </p>
              <br />
              <p>
                Then the same client (or a bug) sends another request with the{' '}
                <strong style={{ color: 'var(--text-primary)' }}>same key</strong> but a different
                amount:{' '}
                <strong style={{ color: 'var(--error)' }}>
                  {formatAmount(amount2, 'INR')}
                </strong>
              </p>
              <br />
              <p>
                The server computes a <strong>SHA-256 fingerprint</strong> of the business payload
                for each request. The fingerprints differ (because the amounts differ), so the
                server knows this is a conflicting use of the key.
              </p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Fingerprint Concept</div>
            <div className="code-block" style={{ fontSize: '0.7rem' }}>
              {`// Request 1 fingerprint input:
{
  "amount": ${amount1},
  "currency": "INR",
  "customerId": "customer_001",
  "simulation": { "outcome": "SUCCESS", "delayMs": 0 }
}
→ SHA-256: abc123...

// Request 2 fingerprint input:
{
  "amount": ${amount2},   // ← DIFFERENT
  "currency": "INR",
  "customerId": "customer_001",
  "simulation": { "outcome": "SUCCESS", "delayMs": 0 }
}
→ SHA-256: xyz789...   // ← DIFFERENT HASH

// abc123... ≠ xyz789...
// → 409 IDEMPOTENCY_KEY_CONFLICT`}
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Why 409?</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p>
                We return <code className="mono">409 Conflict</code> instead of silently processing
                either request, because:
              </p>
              <br />
              <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li>
                  The original payment already happened — we cannot retroactively change it
                </li>
                <li>
                  Processing the second amount would create a{' '}
                  <strong style={{ color: 'var(--error)' }}>duplicate charge</strong>
                </li>
                <li>
                  The client likely has a bug — reusing a key for a different operation
                </li>
                <li>
                  A 409 forces the client to generate a{' '}
                  <strong>new idempotency key</strong> for the second operation
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Demo */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Live Demo</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    padding: 12,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 8,
                    }}
                  >
                    Request 1
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>
                    {formatAmount(amount1, 'INR')}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginTop: 4,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Key: {key.slice(0, 12)}…
                  </div>
                </div>
                <div
                  style={{
                    padding: 12,
                    background: 'var(--error-bg)',
                    borderRadius: 8,
                    border: '1px solid var(--error-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--error)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 8,
                    }}
                  >
                    Request 2 (conflict)
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--error)' }}>
                    {formatAmount(amount2, 'INR')}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--error)',
                      marginTop: 4,
                      fontFamily: 'var(--font-mono)',
                      opacity: 0.7,
                    }}
                  >
                    Same key ← CONFLICT
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={run}
                disabled={loading || done}
              >
                {loading ? (
                  <>
                    <Spinner /> Running demo…
                  </>
                ) : done ? (
                  'Demo complete — Reset to run again'
                ) : (
                  '▶  Run Conflict Demo'
                )}
              </button>

              {done && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={reset}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Step results */}
            {steps.map((s, i) => (
              <div
                key={i}
                style={{
                  padding: 16,
                  background:
                    s.httpStatus === 409
                      ? 'var(--conflict-bg)'
                      : s.httpStatus === 201
                      ? 'var(--success-bg)'
                      : 'var(--bg-tertiary)',
                  border: `1px solid ${
                    s.httpStatus === 409
                      ? 'var(--conflict-border)'
                      : s.httpStatus === 201
                      ? 'var(--success-border)'
                      : 'var(--border)'
                  }`,
                  borderRadius: 8,
                  marginBottom: 12,
                  animation: 'slideIn 0.3s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}
                  >
                    {s.label}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: '0.75rem',
                      color:
                        s.httpStatus === 201
                          ? 'var(--success)'
                          : s.httpStatus === 409
                          ? 'var(--conflict)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    HTTP {s.httpStatus}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.note}</div>
                {s.paymentId && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Payment ID: {s.paymentId}
                  </div>
                )}
                {s.errorCode && (
                  <div style={{ marginTop: 8 }}>
                    <span className="badge badge-conflict">{s.errorCode}</span>
                  </div>
                )}
              </div>
            ))}

            {done && (
              <div className="alert alert-success" style={{ marginBottom: 0 }}>
                <span>✓</span>
                <div>
                  The conflicting request returned <strong>409</strong>. Only one payment was
                  created. The original{' '}
                  <strong>{formatAmount(amount1, 'INR')}</strong> charge is preserved.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
