import { useState, useEffect, useCallback } from 'react';
import { api, type Payment, formatAmount, timeAgo, shortId } from '../api/client';
import { StatusBadge, Spinner } from '../components/PaymentComponents';

export function PaymentHistory() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Payment | null>(null);

  const load = useCallback(async () => {
    const res = await api.listPayments();
    if (res.success && res.data) setPayments(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payment History</h1>
        <p className="page-description">
          All payments in the system. Click a row to inspect the full record.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 24 }}>
        {/* Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">All Payments</div>
              <div className="card-subtitle">{payments.length} records</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={load}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner />
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No payments yet</div>
              <p>Create a payment to see it here.</p>
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
                    <th>Simulation</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.paymentId}
                      onClick={() => setSelected(selected?.paymentId === p.paymentId ? null : p)}
                      style={{
                        cursor: 'pointer',
                        background: selected?.paymentId === p.paymentId ? 'var(--accent-subtle)' : undefined,
                      }}
                    >
                      <td>
                        <span className="payment-id mono" title={p.paymentId}>
                          {shortId(p.paymentId)}
                        </span>
                      </td>
                      <td><StatusBadge status={p.status} /></td>
                      <td><span className="amount-cell">{formatAmount(p.amount, p.currency)}</span></td>
                      <td className="text-muted" style={{ fontSize: '0.75rem' }}>{p.customerId}</td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontFamily: 'var(--font-mono)',
                            color: p.simulationMode === 'SUCCESS' ? 'var(--success)' : 'var(--error)',
                          }}
                        >
                          {p.simulationMode}
                        </span>
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {timeAgo(p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Payment Detail</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DetailRow label="Payment ID">
                <span className="mono" style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>
                  {selected.paymentId}
                </span>
              </DetailRow>
              <DetailRow label="Status"><StatusBadge status={selected.status} /></DetailRow>
              <DetailRow label="Amount">
                <span className="amount-cell">{formatAmount(selected.amount, selected.currency)}</span>
              </DetailRow>
              <DetailRow label="Currency">{selected.currency}</DetailRow>
              <DetailRow label="Customer">{selected.customerId}</DetailRow>
              <DetailRow label="Simulation">{selected.simulationMode}</DetailRow>

              {selected.processorReference && (
                <DetailRow label="Processor Ref">
                  <span className="mono" style={{ fontSize: '0.7rem' }}>
                    {selected.processorReference}
                  </span>
                </DetailRow>
              )}
              {selected.failureReason && (
                <DetailRow label="Failure Reason">
                  <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>
                    {selected.failureReason}
                  </span>
                </DetailRow>
              )}

              <div className="divider" />

              <DetailRow label="Created">{new Date(selected.createdAt).toLocaleString()}</DetailRow>
              <DetailRow label="Updated">{new Date(selected.updatedAt).toLocaleString()}</DetailRow>
              {selected.completedAt && (
                <DetailRow label="Completed">{new Date(selected.completedAt).toLocaleString()}</DetailRow>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', textAlign: 'right' }}>
        {children}
      </span>
    </div>
  );
}
