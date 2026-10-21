/**
 * rate-limit.ts
 *
 * Basic rate limiting to prevent abuse.
 * Uses express-rate-limit with in-memory storage (sufficient for V1 single server).
 *
 * For a multi-server deployment this would need a shared store (Redis),
 * but that complexity is out of scope for this portfolio project.
 */
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,   // Return rate limit info in the RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
    },
    requestId: 'rate-limited',
  },
});
