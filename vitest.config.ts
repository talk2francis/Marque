import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    // Network-dependent tests (the RPC pool) need room; unit tests finish fast.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    pool: 'forks',
    reporters: 'default',
  },
})
