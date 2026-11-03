/**
 * Runs once when a server process starts. It asks this process for the marketplace once, in the background, so the
 * catalog is read from Postgres into memory before visitors arrive: a cold read on a busy host is slower than a
 * request's deadline. Through the real route, so nothing here imports server code.
 */
export async function register() {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return
  const port = process.env['PORT']
  if (!port) return
  setTimeout(() => {
    for (const lane of ['mainnet', 'practice']) {
      void fetch(`http://127.0.0.1:${port}/api/v1/marketplace?lane=${lane}&limit=1`, { signal: AbortSignal.timeout(90_000) }).catch(() => undefined)
    }
    // The evidence ladders the Marketplace shows (its hero reads mainnet and testnet), so no visitor counts them cold.
    // The hire form's live examples (Venus loans and V3 positions, about 20 s of chain reads).
    void fetch(`http://127.0.0.1:${port}/api/v1/hire/examples`, { signal: AbortSignal.timeout(90_000) }).catch(() => undefined)
    for (const lane of ['all', 'mainnet', 'practice']) {
      void fetch(`http://127.0.0.1:${port}/api/v1/marketplace/ladder?lane=${lane}`, { signal: AbortSignal.timeout(90_000) }).catch(() => undefined)
    }
  }, 1500)
}
