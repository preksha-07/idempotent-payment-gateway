import type { Payment } from '../api/client';
import { formatAmount, shortId, timeAgo } from '../api/client';

export function StatusBadge({ status }: { status: Payment['status'] }) {
  const dots: Record<string, string> = {
    SUCCESS: '●',
    FAILED: '●',
    PROCESSING: '◌',
    CREATED: '○',
  };
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {dots[status]} {status}
    </span>
  );
}

export function StateMachineViz({ status }: { status: Payment['status'] }) {
  const states: Payment['status'][] = ['CREATED', 'PROCESSING', 'SUCCESS'];

  return (
    <div className="state-machine">
      {states.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          <div className="state-node">
            <div className={`state-bubble ${s} ${status === s || (s === 'SUCCESS' && status === 'FAILED') ? 'active' : ''}`}>
              {s === 'SUCCESS' && status === 'FAILED' ? 'FAILED' : s}
            </div>
          </div>
          {i < states.length - 1 && (
            <span className="state-arrow">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function PaymentRow({
  payment,
  onClick,
}: {
  payment: Payment;
  onClick?: () => void;
}) {
  return (
    <tr onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <td>
        <span className="payment-id mono">{shortId(payment.paymentId)}</span>
      </td>
      <td>
        <StatusBadge status={payment.status} />
      </td>
      <td>
        <span className="amount-cell">{formatAmount(payment.amount, payment.currency)}</span>
      </td>
      <td className="text-muted mono" style={{ fontSize: '0.75rem' }}>
        {payment.customerId}
      </td>
      <td className="text-muted" style={{ fontSize: '0.75rem' }}>
        {timeAgo(payment.createdAt)}
      </td>
    </tr>
  );
}

export function JsonViewer({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="code-block">
      {json.split('\n').map((line, i) => (
        <div key={i}>{colorize(line)}</div>
      ))}
    </div>
  );
}

function colorize(line: string) {
  // Simple syntax highlighting for JSON
  return line
    .replace(/"([^"]+)":/g, '<span class="code-key">"$1":</span>')
    .replace(/: "([^"]*)"/g, ': <span class="code-str">"$1"</span>')
    .replace(/: (true|false)/g, ': <span class="code-bool">$1</span>')
    .replace(/: null/g, ': <span class="code-null">null</span>')
    .replace(/: (\d+)/g, ': <span class="code-num">$1</span>');
}

// We need dangerouslySetInnerHTML for the colorized output
export function JsonViewerColorized({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  const html = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="code-key">"$1":</span>')
    .replace(/: "([^"]*)"/g, ': <span class="code-str">"$1"</span>')
    .replace(/: (true|false)/g, ': <span class="code-bool">$1</span>')
    .replace(/: null/g, ': <span class="code-null">null</span>')
    .replace(/: (-?\d+)/g, ': <span class="code-num">$1</span>');

  return (
    <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function Spinner() {
  return <div className="spinner" />;
}
