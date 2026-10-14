import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Arranca un MongoDB efímero (mongodb-memory-server) o usa MONGODB_URI_TEST.
    globalSetup: ['./test/support/globalSetup.ts'],
    hookTimeout: 180_000,
    testTimeout: 20_000,
  },
});
