import { useState } from 'react';
import { api, generateIdempotencyKey } from '../api/client';
import { Spinner } from '../components/PaymentComponents';

interface RequestResult {
  index: number;
  key: string;
  status: number;
  paymentId: string | null;
  isReplay: boolean;
  error: string | null;
  durationMs: number;
}

interface TestSummary {
  total: number;
  created: number;
  replayed: number;
  conflicts: number;
  errors: number;
  uniquePayments: number;
  passed: boolean;
  durationMs: number;
}

export function ConcurrencyLab() {
  const [concurrentCount, setConcurrentCount] = useState(20);
  const [amount, setAmount] = useState('50000');
  const [sharedKey, setSharedKey] = useState(generateIdempotencyKey());
  const [results, setResults] = useState<RequestResult[]>([]);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const run = async (sameKey: boolean) => {
    setRunning(true);
    setResults([]);
    setSummary(null);
    setProgress(0);

    const key = sameKey ? sharedKey : null;
    const start = Date.now();
    let completed = 0;

    // Fire all requests simultaneously
    const promises = Array.from({ length: concurrentCount }, (_, i) => {
      const requestKey = key ?? generateIdempotencyKey();
      const reqStart = Date.now();

      return api
        .createPayment(requestKey, {
          amount: parseInt(amount, 10),
          currency: 'INR',
          customerId: 'customer_001',
          simulation: { outcome: 'SUCCESS', delayMs: 0, dropResponse: false },
        })
        .then((res) => {
          completed++;
          setProgress(Math.round((completed / concurrentCount) * 100));
          return {
            index: i + 1,
            key: requestKey,
            status: res.status,
            paymentId: res.response.data?.paymentId ?? null,
            isReplay: res.isReplay,
            error: res.response.error?.code ?? null,
            durationMs: Date.now() - reqStart,
          } as RequestResult;
        })
        .catch((err) => ({
          index: i + 1,
          key: requestKey,
          status: 0,
          paymentId: null,
          isReplay: false,
          error: err.message,
          durationMs: Date.now() - reqStart,
        } as RequestResult));
    });

    const allResults = await Promise.all(promises);
    const elapsed = Date.now() - start;

    setResults(allResults.sort((a, b) => a.index - b.index));

    const uniquePayments = new Set(allResults.map((r) => r.paymentId).filter(Boolean)).size;
    const created = allResults.filter((r) => r.status === 201).length;
    const replayed = allResults.filter((r) => r.status === 200 && !r.error).length;
    const conflicts = allResults.filter((r) => r.status === 409).length;
    const errors = allResults.filter((r) => r.error && r.status !== 409).length;

    const passed = sameKey ? uniquePayments === 1 : uniquePayments === concurrentCount;

    setSummary({
      total: concurrentCount,
      created,
      replayed,
      conflicts,
      errors,
      uniquePayments,
      passed,
      durationMs: elapsed,
    });

    setRunning(false);
    setProgress(100);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Concurrency Lab</h1>
        <p className="page-description">
          Fire multiple requests simultaneously to prove the database-level guarantee: the
          PostgreSQL UNIQUE constraint on <code className="mono" style={{ fontSize: '0.8rem' }}>idempotency_keys.key</code> ensures
          exactly one payment is created regardless of how many concurrent requests arrive with the same key.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* Controls */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Test Configuration</div>
            </div>

            <div className="form-group">
              <label className="form-label">Concurrent Requests</label>
              <input
                className="form-input"
                type="number"
                min="2"
                max="50"
                value={concurrentCount}
                onChange={(e) => setConcurrentCount(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Amount (minor units)</label>
              <input
                className="form-input"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="form-hint">{parseInt(amount) / 100} INR</div>
            </div>

            <div className="form-group">
              <label className="form-label">Shared Idempotency Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input mono"
                  value={sharedKey.slice(0, 16) + '…'}
                  readOnly
                  style={{ flex: 1, fontSize: '0.7rem' }}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSharedKey(generateIdempotencyKey())}
                >
                  New
                </button>
              </div>
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => run(true)}
                disabled={running}
              >
                {running ? (
                  <>
                    <Spinner />
                    {progress}% complete…
                  </>
                ) : (
                  `▶  ${concurrentCount} Requests — Same Key`
                )}
              </button>
              <div className="form-hint" style={{ textAlign: 'center' }}>
                Expect: 1 payment created, {concurrentCount - 1} replayed
              </div>

              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => run(false)}
                disabled={running}
              >
                {running ? (
                  <>
                    <Spinner />
                    {progress}% complete…
                  </>
                ) : (
                  `▶  ${concurrentCount} Requests — Unique Keys`
                )}
              </button>
              <div className="form-hint" style={{ textAlign: 'center' }}>
                Expect: {concurrentCount} independent payments
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>How It Works</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p>
                All {concurrentCount} requests are fired with{' '}
                <code className="mono">Promise.all()</code> — they hit the server
                concurrently.
              </p>
              <br />
              <p>
                Each request runs:
              </p>
              <div
                className="code-block"
                style={{ marginTop: 8, fontSize: '0.7rem' }}
              >
                {`INSERT INTO idempotency_keys
  (key, ...)
VALUES (...)
ON CONFLICT (key)
DO NOTHING`}
              </div>
              <br />
              <p>
                PostgreSQL's UNIQUE constraint guarantees exactly ONE insert succeeds.
                All others see 0 rows affected and replay the result.
              </p>
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {/* Progress */}
          {running && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  fontSize: '0.8125rem',
                }}
              >
                <span>Running {concurrentCount} concurrent requests…</span>
                <span className="mono">{progress}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill processing"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div
              className="card"
              style={{
                marginBottom: 16,
                borderColor: summary.passed ? 'var(--success-border)' : 'var(--error-border)',
              }}
            >
              <div className="card-header">
                <div>
                  <div className="card-title">
                    {summary.passed ? '✓ Test Passed' : '✗ Test Failed'}
                  </div>
                  <div className="card-subtitle">
                    Completed in {summary.durationMs}ms
                  </div>
                </div>
                <span
                  className={`badge ${summary.passed ? 'badge-success' : 'badge-failed'}`}
                >
                  {summary.passed ? 'IDEMPOTENCY VERIFIED' : 'UNEXPECTED RESULT'}
                </span>
              </div>

              <div className="concurrency-results">
                <div className="result-metric">
                  <div className="result-metric-label">Requests Sent</div>
                  <div className="result-metric-value">{summary.total}</div>
                </div>
                <div className="result-metric">
                  <div className="result-metric-label">Unique Payments</div>
                  <div
                    className={`result-metric-value ${
                      summary.uniquePayments === 1 || summary.uniquePayments === summary.total
                        ? 'ok'
                        : 'warn'
                    }`}
                  >
                    {summary.uniquePayments}
                  </div>
                </div>
                <div className="result-metric">
                  <div className="result-metric-label">Created (201)</div>
                  <div className="result-metric-value ok">{summary.created}</div>
                </div>
                <div className="result-metric">
                  <div className="result-metric-label">Replayed (200)</div>
                  <div className="result-metric-value replay">{summary.replayed}</div>
                </div>
                {summary.conflicts > 0 && (
                  <div className="result-metric">
                    <div className="result-metric-label">Conflicts (409)</div>
                    <div className="result-metric-value warn">{summary.conflicts}</div>
                  </div>
                )}
                {summary.errors > 0 && (
                  <div className="result-metric">
                    <div className="result-metric-label">Errors</div>
                    <div className="result-metric-value" style={{ color: 'var(--error)' }}>
                      {summary.errors}
                    </div>
                  </div>
                )}
              </div>

              {/* Progress bars */}
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                  }}
                >
                  <span>Created</span>
                  <span className="mono">{summary.created}/{summary.total}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill success"
                    style={{ width: `${(summary.created / summary.total) * 100}%` }}
                  />
                </div>

                {summary.replayed > 0 && (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        marginBottom: 4,
                        marginTop: 8,
                      }}
                    >
                      <span>Replayed</span>
                      <span className="mono">{summary.replayed}/{summary.total}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill processing"
                        style={{ width: `${(summary.replayed / summary.total) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Per-request results */}
          {results.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Per-Request Results</div>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {results.length} responses
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="payment-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>HTTP</th>
                      <th>Payment ID</th>
                      <th>Replay</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.index}>
                        <td className="mono" style={{ fontSize: '0.75rem' }}>
                          {r.index}
                        </td>
                        <td>
                          <span
                            className="mono"
                            style={{
                              fontSize: '0.75rem',
                              color:
                                r.status === 201
                                  ? 'var(--success)'
                                  : r.status === 200
                                  ? 'var(--processing)'
                                  : r.status === 409
                                  ? 'var(--conflict)'
                                  : 'var(--error)',
                            }}
                          >
                            {r.status || 'ERR'}
                          </span>
                        </td>
                        <td>
                          <span
                            className="mono text-muted"
                            style={{ fontSize: '0.7rem' }}
                            title={r.paymentId ?? ''}
                          >
                            {r.paymentId ? r.paymentId.slice(0, 12) + '…' : r.error ?? '—'}
                          </span>
                        </td>
                        <td>
                          {r.isReplay ? (
                            <span className="badge badge-replay" style={{ fontSize: '0.6rem' }}>
                              ↺ replay
                            </span>
                          ) : r.status === 201 ? (
                            <span className="badge badge-success" style={{ fontSize: '0.6rem' }}>
                              created
                            </span>
                          ) : null}
                        </td>
                        <td className="mono text-muted" style={{ fontSize: '0.7rem' }}>
                          {r.durationMs}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!running && results.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-title">No test run yet</div>
                <p>
                  Click one of the test buttons to fire concurrent requests and see the
                  idempotency guarantee in action.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
