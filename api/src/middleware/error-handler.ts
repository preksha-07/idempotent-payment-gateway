/**
 * error-handler.ts
 *
 * Centralised Express error handler.
 *
 * All errors flow here via next(err). This ensures:
 * 1. Consistent JSON error format for every error type
 * 2. No SQL errors, stack traces, or internal details leaked to the client
 * 3. Proper HTTP status codes based on error type
 *
 * IMPORTANT: must be registered AFTER all routes in app.ts.
 * Express recognises error handlers by their 4-parameter signature.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { ApiResponse } from '../modules/payments/payment.types';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const requestId = (res.locals.requestId as string) ?? 'unknown';

  // ── Known application error ──────────────────────────────────────────────
  if (err instanceof AppError) {
    logger.warn(
      { requestId, code: err.code, statusCode: err.statusCode, message: err.message },
      'Application error'
    );

    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: err.code, message: err.message },
      requestId,
    };
    return res.status(err.statusCode).json(body);
  }

  // ── Zod validation error (shouldn't reach here — controllers use safeParse) ──
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    logger.warn({ requestId, message }, 'Validation error');

    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message },
      requestId,
    };
    return res.status(400).json(body);
  }

  // ── Unknown / unexpected error ────────────────────────────────────────────
  // Log the full error (including stack) but return a generic message to the client
  logger.error({ requestId, err }, 'Unexpected server error');

  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    },
    requestId,
  };
  return res.status(500).json(body);
}
