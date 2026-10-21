/**
 * logger.ts
 *
 * Structured logger using Pino.
 * In development, pino-pretty formats logs for human readability.
 * In production/test, outputs plain JSON for log aggregators.
 *
 * Use the logger everywhere instead of console.log so we always have
 * consistent structured fields (requestId, paymentId, event, etc.).
 */
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export type Logger = typeof logger;
