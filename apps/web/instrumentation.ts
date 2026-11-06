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
    // Sequential warm reads avoid a burst of duplicate cold catalog work across
    // cluster workers. Deployment separately verifies every worker's readiness.
    void (async () => {
      const paths = ['/api/ready',
        '/api/v1/marketplace?lane=mainnet&limit=1', '/api/v1/marketplace?lane=practice&limit=1',
        '/api/v1/marketplace?tab=ready&lane=all&failed=group&limit=15&offset=0',
        ...['all', 'mainnet', 'practice'].map(lane => `/api/v1/marketplace/ladder?lane=${lane}`),
        '/api/v1/hire/examples']
      for (const path of paths) {
        try { const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(90_000) }); await r.arrayBuffer() } catch { /* deploy readiness remains fail-closed */ }
      }
    })()
  }, 1500)
}
