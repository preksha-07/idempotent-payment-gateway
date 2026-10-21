import { useState } from 'react';
import {
  api,
  type Payment,
  generateIdempotencyKey,
  formatAmount,
} from '../api/client';
import { StatusBadge, StateMachineViz, Spinner } from '../components/PaymentComponents';

// ─── Types ──────────────────────────────────────────────────────────────────

type EventKind = 'send' | 'success' | 'failed' | 'lost' | 'replay' | 'conflict';

interface TimelineEvent {
  kind: EventKind;
  title: string;
  detail: string;
  tag?: React.ReactNode;
  timestamp: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMOJI: Record<EventKind, string> = {
  send: '↑',
  success: '✓',
  failed: '✗',
  lost: '⚡',
  replay: '↺',
  conflict: '⚠',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function IdempotencyLab() {
  const [key, setKey] = useState(generateIdempotencyKey());
  const [amount, setAmount] = useState('50000');
  const [currency] = useState('INR');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'idle' | 'sent' | 'dropped' | 'done'>('idle');
  const [lastRequestNum, setLastRequestNum] = useState(0);

  const addEvent = (ev: Omit<TimelineEvent, 'timestamp'>) =>
    setEvents((prev) => [...prev, { ...ev, timestamp: new Date() }]);

  // ── Step 1: Send initial payment ──────────────────────────────────────────
  const sendPayment = async (drop: boolean) => {
    setLoading(true);
    const reqNum = lastRequestNum + 1;
    setLastRequestNum(reqNum);

    addEvent({
      kind: 'send',
      title: `Request #${reqNum} sent`,
      detail: `Idempotency-Key: ${key.slice(0, 16)}… | Amount: ${formatAmount(parseInt(amount), currency)} | Drop: ${drop}`,
    });

    const result = await api.createPayment(key, {
      amount: parseInt(amount, 10),
      currency,
      customerId: 'customer_001',
      simulation: { outcome: 'SUCCESS', delayMs: 800, dropResponse: drop },
    });

    if (result.response.error?.code === 'RESPONSE_DROPPED') {
      addEvent({
        kind: 'lost',
        title: 'Response intentionally dropped',
        detail: 'The payment completed on the server — but the TCP connection was destroyed before a response was sent. The client has no idea if the payment succeeded.',
        tag: <span className="badge badge-replay">simulated network loss</span>,
      });
      setStep('dropped');
    } else if (result.response.success && result.response.data) {
      const p = result.response.data;
      setPayment(p);

      if (result.isReplay) {
        addEvent({
          kind: 'replay',
          title: 'Existing payment replayed',
          detail: `Payment ID: ${p.paymentId} — Status: ${p.status} (same as original)`,
          tag: <span className="badge badge-replay">↺ IDEMPOTENCY REPLAY</span>,
        });
        setStep('done');
      } else {
        addEvent({
          kind: p.status === 'SUCCESS' ? 'success' : 'failed',
          title: `Payment ${p.status === 'SUCCESS' ? 'succeeded' : 'failed'}`,
          detail: `Payment ID: ${p.paymentId}`,
          tag: <StatusBadge status={p.status} />,
        });
        setStep('sent');
      }
    } else if (result.response.error) {
      addEvent({
        kind: 'conflict',
        title: result.response.error.code,
        detail: result.response.error.message,
        tag: <span className="badge badge-conflict">⚠ {result.response.error.code}</span>,
      });
    }

    setLoading(false);
  };

  const reset = () => {
    setKey(generateIdempotencyKey());
    setEvents([]);
    setPayment(null);
    setStep('idle');
    setLastRequestNum(0);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Idempotency Lab</h1>
        <p className="page-description">
          Walk through the idempotency retry scenario step by step. Send a payment, simulate a
          lost response, then retry with the same key and watch the system replay the original
          result — without creating a duplicate.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* Controls */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Experiment Controls</div>
            </div>

            <div className="form-group">
              <label className="form-label">Idempotency Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input mono"
                  value={key.slice(0, 20) + '…'}
                  readOnly
                  style={{ flex: 1, fontSize: '0.7rem' }}
                />
                <button className="btn btn-secondary btn-sm" onClick={reset}>
                  Reset
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Amount (minor units)</label>
              <input
                className="form-input"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="form-hint">
                {parseInt(amount, 10) / 100} {currency}
              </div>
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Step 1 */}
              <div>
                <div
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Step 1 — Send Payment
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => sendPayment(false)}
                  disabled={loading || step === 'done'}
                >
                  {loading && step === 'idle' ? <><Spinner /> Sending…</> : '▶  Send Payment (normal)'}
                </button>
              </div>

              {/* Step 2 */}
              <div>
                <div
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Step 2 — Simulate Lost Response
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', borderColor: 'var(--warning-border)', color: 'var(--warning)' }}
                  onClick={() => sendPayment(true)}
                  disabled={loading || step === 'idle' || step === 'dropped' || step === 'done'}
                >
                  {loading && step === 'sent' ? <><Spinner /> Sending…</> : '⚡  Drop the Response'}
                </button>
                <div className="form-hint">
                  Send using same key, payment completes but response is killed.
                </div>
              </div>

              {/* Step 3 */}
              <div>
                <div
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Step 3 — Retry (same key)
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', borderColor: 'var(--processing-border)', color: 'var(--processing)' }}
                  onClick={() => sendPayment(false)}
                  disabled={loading || step !== 'dropped'}
                >
                  {loading && step === 'dropped' ? <><Spinner /> Retrying…</> : '↺  Retry with Same Key'}
                </button>
                <div className="form-hint">
                  Same key, same payload. The original result will be returned.
                </div>
              </div>
            </div>
          </div>

          {/* State summary */}
          {payment && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Payment State</div>
              <StateMachineViz status={payment.status} />
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>ID</span>
                  <span
                    className="mono"
                    style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}
                  >
                    {payment.paymentId.slice(0, 18)}…
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>Amount</span>
                  <span
                    className="amount-cell"
                    style={{ fontSize: '0.875rem' }}
                  >
                    {formatAmount(payment.amount, payment.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Request Timeline</div>
            {step === 'done' && (
              <span className="badge badge-success">✓ Idempotency Verified</span>
            )}
          </div>

          {events.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No events yet</div>
              <p>Follow the steps on the left to walk through the scenario.</p>
              <div style={{ marginTop: 24, textAlign: 'left' }}>
                <div className="alert alert-info" style={{ marginBottom: 0 }}>
                  <span>ℹ</span>
                  <div style={{ fontSize: '0.75rem' }}>
                    <strong>The scenario:</strong><br />
                    1. Client sends payment → server creates P001 → response is received ✓<br />
                    2. Client sends same key → response dropped (simulated network failure)<br />
                    3. Client doesn't know if payment succeeded → retries with same key<br />
                    4. Server recognises the key → returns P001 → <strong>no duplicate created</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div className="timeline-line" />
              <div className="timeline">
                {events.map((ev, i) => (
                  <div key={i} className="timeline-item">
                    <div className={`timeline-dot ${ev.kind}`}>
                      {EMOJI[ev.kind]}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-title">{ev.title}</div>
                      <div className="timeline-detail">{ev.detail}</div>
                      {ev.tag && <div className="timeline-tag">{ev.tag}</div>}
                      <div
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-muted)',
                          marginTop: 4,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {ev.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {step === 'done' && (
                <div
                  className="alert alert-success"
                  style={{ marginTop: 24, marginBottom: 0 }}
                >
                  <span>✓</span>
                  <div>
                    <strong>Idempotency confirmed.</strong> The retry returned the original payment
                    ID. No duplicate was created. The PostgreSQL UNIQUE constraint on{' '}
                    <code className="mono" style={{ fontSize: '0.75rem' }}>
                      idempotency_keys.key
                    </code>{' '}
                    guaranteed exactly one payment existed.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
