import { useState, useEffect } from 'react';
import { api } from '../api/client';

export function Sidebar({
  current,
  onNavigate,
}: {
  current: string;
  onNavigate: (page: string) => void;
}) {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => setHealthy(await api.getHealth());
    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, []);

  const nav = (page: string) => (
    <button
      className={`nav-item ${current === page ? 'active' : ''}`}
      onClick={() => onNavigate(page)}
    >
      <span className="nav-index">{navIndex(page)}</span>
      <span>{navLabel(page)}</span>
    </button>
  );

  return (
    <header className="sidebar">
      <div className="sidebar-header">
        <button className="brand" onClick={() => onNavigate('dashboard')} aria-label="Open dashboard">
          <span className="brand-mark" aria-hidden="true">✳</span>
          <span>
            <strong>Pay / Safe</strong>
            <small>Idempotency Lab</small>
          </span>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        <div className="nav-group">
          <span className="nav-section-label">Observe</span>
          {nav('dashboard')}
          {nav('payments')}
        </div>
        <div className="nav-group">
          <span className="nav-section-label">Test the boundary</span>
          {nav('create')}
          {nav('idempotency-lab')}
          {nav('concurrency-lab')}
          {nav('conflict-demo')}
        </div>
      </nav>

      <div className="sidebar-footer">
        <span className={`status-dot ${healthy === null ? 'loading' : healthy ? '' : 'error'}`} />
        <span>{healthy === null ? 'checking API' : healthy ? 'API online' : 'API unavailable'}</span>
      </div>
    </header>
  );
}

function navLabel(page: string): string {
  const labels: Record<string, string> = {
    dashboard: 'Overview',
    payments: 'Payment ledger',
    create: 'Send payment',
    'idempotency-lab': 'Retry lab',
    'concurrency-lab': 'Concurrency',
    'conflict-demo': 'Key conflict',
  };
  return labels[page] ?? page;
}

function navIndex(page: string): string {
  const indexes: Record<string, string> = {
    dashboard: '01',
    payments: '02',
    create: '03',
    'idempotency-lab': '04',
    'concurrency-lab': '05',
    'conflict-demo': '06',
  };
  return indexes[page] ?? '—';
}
