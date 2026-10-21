import { useState, useEffect, useCallback } from 'react';
import { api, type Payment, type Stats, formatAmount, shortId, timeAgo } from '../api/client';
import { StatusBadge, Spinner } from '../components/PaymentComponents';

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [statsRes, paymentsRes] = await Promise.all([
      api.getStats(),
      api.listPayments(),
    ]);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (paymentsRes.success && paymentsRes.data) setPayments(paymentsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">
          Real-time overview of payment activity and system state.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-label">Total Payments</div>
              <div className="stat-value">{stats?.total ?? 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Success</div>
              <div className="stat-value success">{stats?.success ?? 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Failed</div>
              <div className="stat-value error">{stats?.failed ?? 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Processing</div>
              <div className="stat-value processing">{stats?.processing ?? 0}</div>
            </div>
          </div>

          {/* Architecture note */}
          <div className="alert alert-info" style={{ marginBottom: 24 }}>
            <span>ℹ</span>
            <div>
              <strong>What this system guarantees:</strong> For any given idempotency key,
              at most one logical payment record is created — enforced by a PostgreSQL UNIQUE
              constraint and <code style={{ fontFamily: 'var(--font-mono)' }}>INSERT ... ON CONFLICT DO NOTHING</code>.
            </div>
          </div>

          {/* Recent payments */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Recent Payments</div>
                <div className="card-subtitle">Last 50 payments, newest first</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={load}>
                Refresh
              </button>
            </div>

            {payments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No payments yet</div>
                <p>Use Create Payment or the Idempotency Lab to get started.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="payment-table">
                  <thead>
                    <tr>
                      <th>Payment ID</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Customer</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.paymentId}>
                        <td>
                          <span className="payment-id mono" title={p.paymentId}>
                            {shortId(p.paymentId)}
                          </span>
                        </td>
                        <td><StatusBadge status={p.status} /></td>
                        <td><span className="amount-cell">{formatAmount(p.amount, p.currency)}</span></td>
                        <td className="text-muted" style={{ fontSize: '0.75rem' }}>{p.customerId}</td>
                        <td className="text-muted" style={{ fontSize: '0.75rem' }}>{timeAgo(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
