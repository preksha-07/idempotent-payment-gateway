/**
 * env.ts
 *
 * Single source of truth for all environment variables.
 * We validate and parse them here so the rest of the application
 * never has to deal with raw process.env strings or undefined checks.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database — development
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('pguser'),
  DB_PASSWORD: z.string().default('pgpassword'),
  DB_NAME: z.string().default('payment_gateway'),

  // Database — test (separate container so tests never touch dev data)
  DB_TEST_HOST: z.string().default('localhost'),
  DB_TEST_PORT: z.coerce.number().default(5433),
  DB_TEST_NAME: z.string().default('payment_gateway_test'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Idempotency
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().default(24),
  IDEMPOTENCY_KEY_MAX_LENGTH: z.coerce.number().default(255),

  // Payment processing
  PROCESSING_TIMEOUT_SECONDS: z.coerce.number().default(300),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

// Parse once at startup. If required variables are missing/invalid, crash immediately
// with a clear error rather than letting the app start in a broken state.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

// Expose database config as a helper that picks the right DB based on NODE_ENV
export function getDbConfig() {
  if (env.NODE_ENV === 'test') {
    return {
      host: env.DB_TEST_HOST,
      port: env.DB_TEST_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_TEST_NAME,
    };
  }
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  };
}
