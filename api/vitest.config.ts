import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Run test files sequentially to avoid port conflicts between API test suites
    // Concurrency tests use Promise.all internally — that is the right level of parallelism
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['verbose'],
  },
});
