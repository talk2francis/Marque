import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // `server-only` throws unless it is resolved through a React Server
    // Components bundler. Under vitest it is a no-op guard.
    alias: { 'server-only': new URL('./test/server-only-stub.ts', import.meta.url).pathname },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    // Network-dependent tests (the RPC pool) need room; unit tests finish fast.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    pool: 'forks',
    reporters: 'default',
  },
})
