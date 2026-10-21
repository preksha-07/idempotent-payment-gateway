/**
 * payments.controller.ts
 *
 * Translates HTTP requests → service calls → HTTP responses.
 * No business logic, no SQL. Just HTTP plumbing.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { paymentsService } from './payments.service';
import { createPaymentSchema, validateIdempotencyKey } from './payment.schema';
import {
  MissingIdempotencyKeyError,
  InvalidIdempotencyKeyError,
  ValidationError,
} from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { ApiResponse, PaymentResponse } from './payment.types';

function success<T>(res: Response, data: T, status: number, requestId: string) {
  const body: ApiResponse<T> = { success: true, data, error: null, requestId };
  res.status(status).json(body);
}

export const paymentsController = {
  async createPayment(req: Request, res: Response, next: NextFunction) {
    const requestId = res.locals.requestId as string;

    // ── Validate idempotency key header ─────────────────────────────────────
    let idempotencyKey: string;
    try {
      idempotencyKey = validateIdempotencyKey(req.headers['idempotency-key'] as string);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'MISSING') return next(new MissingIdempotencyKeyError());
      if (msg === 'TOO_LONG') return next(new InvalidIdempotencyKeyError('Idempotency-Key is too long (max 255 chars)'));
      return next(new InvalidIdempotencyKeyError('Idempotency-Key contains invalid characters'));
    }

    // ── Validate request body ────────────────────────────────────────────────
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      return next(new ValidationError(message));
    }

    try {
      const result = await paymentsService.createPayment(idempotencyKey, parsed.data, requestId);

      // dropResponse simulates the network dropping the response.
      // The payment has been processed — we just don't send the response.
      // The next retry will get it from the idempotency replay.
      if (result.dropResponse) {
        logger.info(
          { requestId, paymentId: result.payment.paymentId, event: 'response_dropped' },
          'Simulated response drop — connection closed without sending response'
        );
        // Destroy the socket to truly simulate a connection drop
        req.socket.destroy();
        return;
      }

      // Add replay header so the client knows this is a cached result
      if (result.isReplay) {
        res.setHeader('X-Idempotency-Replay', 'true');
      }

      success(res, result.payment, result.httpStatus, requestId);
    } catch (err) {
      next(err);
    }
  },

  async getPayment(req: Request, res: Response, next: NextFunction) {
    const requestId = res.locals.requestId as string;
    try {
      const payment = await paymentsService.getPayment(req.params.id);
      success(res, payment, 200, requestId);
    } catch (err) {
      next(err);
    }
  },

  async listPayments(req: Request, res: Response, next: NextFunction) {
    const requestId = res.locals.requestId as string;
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const payments = await paymentsService.listPayments(limit, offset);
      success(res, payments, 200, requestId);
    } catch (err) {
      next(err);
    }
  },

  async getStats(req: Request, res: Response, next: NextFunction) {
    const requestId = res.locals.requestId as string;
    try {
      const stats = await paymentsService.getStats();
      success(res, stats, 200, requestId);
    } catch (err) {
      next(err);
    }
  },

  async getCustomers(req: Request, res: Response, next: NextFunction) {
    const requestId = res.locals.requestId as string;
    try {
      const customers = await paymentsService.getCustomers();
      success(res, customers, 200, requestId);
    } catch (err) {
      next(err);
    }
  },

  async triggerRecovery(req: Request, res: Response, next: NextFunction) {
    const requestId = res.locals.requestId as string;
    try {
      const result = await paymentsService.recoverStalePayments(requestId);
      success(res, result, 200, requestId);
    } catch (err) {
      next(err);
    }
  },
};
