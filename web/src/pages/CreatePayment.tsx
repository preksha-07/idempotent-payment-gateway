import { useState, useEffect } from 'react';
import { api, type Customer, type Payment, type ApiResponse, generateIdempotencyKey } from '../api/client';
import { StatusBadge, StateMachineViz, JsonViewerColorized, Spinner } from '../components/PaymentComponents';

interface PaymentResult {
  status: number;
  response: ApiResponse<Payment>;
  isReplay: boolean;
}

export function CreatePayment() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [key, setKey] = useState(generateIdempotencyKey());
  const [amount, setAmount] = useState('50000');
  const [currency, setCurrency] = useState('INR');
  const [customerId, setCustomerId] = useState('customer_001');
  const [outcome, setOutcome] = useState<'SUCCESS' | 'FAILURE'>('SUCCESS');
  const [delayMs, setDelayMs] = useState('1000');
  const [dropResponse, setDropResponse] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);

  useEffect(() => {
    api.getCustomers().then((r) => {
      if (r.success && r.data) setCustomers(r.data);
    });
  }, []);

  const submit = async () => {
    setLoading(true);
    setResult(null);
    const res = await api.createPayment(key, {
      amount: parseInt(amount, 10),
      currency,
      customerId,
      simulation: {
        outcome,
        delayMs: parseInt(delayMs, 10),
        dropResponse,
      },
    });
    setResult(res);
    setLoading(false);
  };

  const payment: Payment | null = result?.response?.data ?? null;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Create Payment</h1>
        <p className="page-description">
          Send a payment request with a specific idempotency key. Try sending twice with the same
          key to see idempotency in action.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Form */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Payment Request</div>
          </div>

          <div className="form-group">
            <label className="form-label">Idempotency Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input mono"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setKey(generateIdempotencyKey())}
              >
                New
              </button>
            </div>
            <div className="form-hint">
              Reuse this key to simulate a retry. Change only the amount to trigger a 409 conflict.
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (minor units)</label>
              <input
                className="form-input"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="form-hint">
                {parseInt(amount) / 100} {currency} (50000 = ₹500.00)
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select
                className="form-select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option>INR</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Customer</label>
            <select
              className="form-select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c.external_id} value={c.external_id}>
                  {c.name} ({c.external_id})
                </option>
              ))}
              {customers.length === 0 && (
                <option value="customer_001">customer_001</option>
              )}
            </select>
          </div>

          <div className="divider" />

          <div className="card-title" style={{ marginBottom: 16, fontSize: '0.8125rem' }}>
            Simulation Controls
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Outcome</label>
              <select
                className="form-select"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as 'SUCCESS' | 'FAILURE')}
              >
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILURE">FAILURE</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Delay (ms)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                max="10000"
                step="500"
                value={delayMs}
                onChange={(e) => setDelayMs(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={dropResponse}
                onChange={(e) => setDropResponse(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              <span className="form-label" style={{ margin: 0 }}>
                Drop response (simulate network failure)
              </span>
            </label>
            <div className="form-hint" style={{ marginTop: 6 }}>
              The payment will complete, but the HTTP response is intentionally not sent.
              Retry with the same key to recover the result.
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? (
              <>
                <Spinner /> Processing…
              </>
            ) : (
              'Send Payment Request'
            )}
          </button>
        </div>

        {/* Result */}
        <div>
          {!result && !loading && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-title">No request yet</div>
                <p>Fill out the form and click Send to see the response.</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={{ textAlign: 'center' }}>
                <Spinner />
                <div className="text-muted" style={{ marginTop: 12, fontSize: '0.8125rem' }}>
                  Processing payment…
                </div>
              </div>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Status row */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Response</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: result.status === 201 ? 'var(--success-bg)' :
                                     result.status === 200 ? 'var(--processing-bg)' :
                                     result.status === 409 ? 'var(--conflict-bg)' :
                                     result.status === 0   ? 'var(--warning-bg)'  :
                                     'var(--error-bg)',
                        color: result.status === 201 ? 'var(--success)' :
                               result.status === 200 ? 'var(--processing)' :
                               result.status === 409 ? 'var(--conflict)' :
                               result.status === 0   ? 'var(--warning)'  :
                               'var(--error)',
                        border: '1px solid',
                      }}
                    >
                      {result.status === 0 ? 'DROPPED' : `HTTP ${result.status}`}
                    </span>
                    {result.isReplay && (
                      <span className="badge badge-replay">↺ REPLAY</span>
                    )}
                  </div>
                </div>

                {result.response.error?.code === 'RESPONSE_DROPPED' ? (
                  <div className="alert alert-warning" style={{ marginBottom: 0 }}>
                    <span>⚠</span>
                    <div>
                      <strong>Response intentionally dropped.</strong><br />
                      The payment was processed successfully — the server destroyed the connection
                      before sending a response. Retry with the same idempotency key to recover
                      the result.
                    </div>
                  </div>
                ) : result.response.error ? (
                  <div className="alert alert-error" style={{ marginBottom: 0 }}>
                    <span>⚠</span>
                    <div>
                      <strong>{result.response.error.code}</strong><br />
                      {result.response.error.message}
                    </div>
                  </div>
                ) : payment ? (
                  <div>
                    <StateMachineViz status={payment.status} />
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>Payment ID</span>
                        <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                          {payment.paymentId}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>Status</span>
                        <StatusBadge status={payment.status} />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Raw response */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Raw Response</div>
                <JsonViewerColorized data={result.response} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
