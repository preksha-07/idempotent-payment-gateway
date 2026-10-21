// API client — typed wrapper around fetch
// All requests go through /api (proxied to Express by Vite in dev)

const BASE = '/api';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
}

export interface Payment {
  paymentId: string;
  status: 'CREATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  amount: number;
  currency: string;
  customerId: string;
  processorReference: string | null;
  failureReason: string | null;
  simulationMode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Customer {
  id: string;
  external_id: string;
  name: string;
  created_at: string;
}

export interface Stats {
  total: number;
  success: number;
  failed: number;
  processing: number;
  created: number;
  customers: number;
}

export interface CreatePaymentRequest {
  amount: number;
  currency: string;
  customerId: string;
  simulation: {
    outcome: 'SUCCESS' | 'FAILURE';
    delayMs: number;
    dropResponse: boolean;
  };
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { idempotencyKey?: string }
): Promise<{ data: ApiResponse<T>; status: number; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  const data = await res.json();
  return { data, status: res.status, headers: res.headers };
}

export const api = {
  async createPayment(
    idempotencyKey: string,
    body: CreatePaymentRequest
  ): Promise<{ response: ApiResponse<Payment>; status: number; isReplay: boolean }> {
    try {
      const result = await apiFetch<Payment>('/payments', {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify(body),
      });
      const isReplay = result.headers.get('x-idempotency-replay') === 'true';
      return { response: result.data, status: result.status, isReplay };
    } catch {
      // dropResponse simulation causes a network error — the response was deliberately dropped
      return {
        response: {
          success: false,
          data: null,
          error: { code: 'RESPONSE_DROPPED', message: 'Response was intentionally dropped (network simulation)' },
          requestId: '',
        },
        status: 0,
        isReplay: false,
      };
    }
  },

  async getPayment(id: string): Promise<ApiResponse<Payment>> {
    const result = await apiFetch<Payment>(`/payments/${id}`);
    return result.data;
  },

  async listPayments(): Promise<ApiResponse<Payment[]>> {
    const result = await apiFetch<Payment[]>('/payments?limit=50');
    return result.data;
  },

  async getStats(): Promise<ApiResponse<Stats>> {
    const result = await apiFetch<Stats>('/payments/stats');
    return result.data;
  },

  async getCustomers(): Promise<ApiResponse<Customer[]>> {
    const result = await apiFetch<Customer[]>('/customers');
    return result.data;
  },

  async getHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },
};

export function formatAmount(minor: number, currency: string): string {
  const major = minor / 100;
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const sym = symbols[currency] ?? currency + ' ';
  return `${sym}${major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function shortId(id: string): string {
  return id.slice(0, 8) + '…';
}
