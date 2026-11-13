/**
 * Runs once when a server process starts. It asks this process for the marketplace once, in the background, so the
 * catalog is read from Postgres into memory before visitors arrive: a cold read on a busy host is slower than a
 * request's deadline. Through the real route, so nothing here imports server code.
 */
export async function register() {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return
  const port = process.env['PORT']
  if (!port) return
  const { maintainReadModels, initialReadModelPaths } = await import('./lib/read-model-refresh')
  setTimeout(() => {
    if (process.env['MARQUE_REFRESH_READ_MODELS'] === '1') {
      const controller = new AbortController()
      process.once('SIGTERM', () => controller.abort())
      process.once('SIGINT', () => controller.abort())
      console.info('[read-model-refresh] enabled')
      // Only the keyless reader owns the continuing refresh. Web workers retain
      // their ordinary fallback reads, with the same observation dates and TTLs.
      void (async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/ready`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
            cache: 'no-store',
          })
          await response.arrayBuffer()
        } catch { /* Normal deployment readiness still decides whether this release may serve. */ }
        await maintainReadModels(`http://127.0.0.1:${port}`, {
          signal: controller.signal,
          failed: path => console.warn('[read-model-refresh] read unavailable:', path),
        })
      })().catch(() => console.warn('[read-model-refresh] stopped unexpectedly'))
      return
    }
    // Sequential warm reads avoid a burst of duplicate cold catalog work across
    // cluster workers. Deployment separately verifies every worker's readiness.
    void (async () => {
      const paths = ['/api/ready', ...initialReadModelPaths]
      for (const path of paths) {
        try { const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(90_000) }); await r.arrayBuffer() } catch { /* deploy readiness remains fail-closed */ }
      }
    })()
  }, 1500)
}
