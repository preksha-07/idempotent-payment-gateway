/**
 * server.ts
 *
 * HTTP server startup.
 * Connects to the database, runs health checks, then starts listening.
 */
import { app } from './app';
import { env } from './config/env';
import { checkDatabaseConnection } from './db/pool';
import { logger } from './utils/logger';

async function start() {
  // Verify DB is reachable before accepting traffic
  await checkDatabaseConnection();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        event: 'server_started',
      },
      `🚀 API server listening on http://localhost:${env.PORT}`
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
