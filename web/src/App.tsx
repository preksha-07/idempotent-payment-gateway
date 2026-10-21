import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { CreatePayment } from './pages/CreatePayment';
import { PaymentHistory } from './pages/PaymentHistory';
import { IdempotencyLab } from './pages/IdempotencyLab';
import { ConcurrencyLab } from './pages/ConcurrencyLab';
import { ConflictDemo } from './pages/ConflictDemo';

type Page =
  | 'dashboard'
  | 'payments'
  | 'create'
  | 'idempotency-lab'
  | 'concurrency-lab'
  | 'conflict-demo';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  const renderPage = () => {
    switch (page) {
      case 'dashboard':       return <Dashboard />;
      case 'payments':        return <PaymentHistory />;
      case 'create':          return <CreatePayment />;
      case 'idempotency-lab': return <IdempotencyLab />;
      case 'concurrency-lab': return <ConcurrencyLab />;
      case 'conflict-demo':   return <ConflictDemo />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar current={page} onNavigate={(p) => setPage(p as Page)} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
