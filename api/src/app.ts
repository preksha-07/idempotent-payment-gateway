/**
 * app.ts
 *
 * Express application setup.
 * Exported separately from server.ts so tests can import the app
 * without starting an HTTP server (Supertest spins its own).
 */
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requestIdMiddleware } from './middleware/request-id';
import { rateLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { paymentsRouter } from './modules/payments/payments.routes';
import { customersRepository } from './modules/payments/payments.repository';
import { logger } from './utils/logger';

const app = express();

// ── Security / parsing ───────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));   // Reject abnormally large bodies
app.use(
  cors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Idempotency-Replay'],
  })
);

// ── Infrastructure middleware ────────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(rateLimiter);

// ── Health endpoints ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ready', async (req, res) => {
  try {
    // Simple DB connectivity check
    await customersRepository.findAll();
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not_ready', timestamp: new Date().toISOString() });
  }
});

// ── Domain routes ────────────────────────────────────────────────────────────
app.use('/api/payments', paymentsRouter);
app.use('/api/customers', async (req, res) => {
  const customers = await customersRepository.findAll();
  res.json({ success: true, data: customers, error: null, requestId: res.locals.requestId });
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    requestId: res.locals.requestId,
  });
});

// ── Error handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

export { app };
