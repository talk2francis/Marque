// Outside read-only observations. Scheduling and persistence belong to uptime.yml, never the production server.
import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

export const UPTIME_PATHS = ['/', '/register', '/proof', '/quest', '/api/v1/phase2/coverage', '/api/v1/proof']

export async function observe(origin = 'https://marque.trade', fetcher = fetch, now = new Date()) {
  const checks = await Promise.all(UPTIME_PATHS.map(async path => {
    const start = performance.now()
    let ttfbMs = null
    try {
      const r = await fetcher(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Marque-outside-check/1' } })
      ttfbMs = performance.now() - start
      // Consume a bounded stream: total includes the response body, while TTFB ends at its headers.
      const reader = r.body?.getReader()
      let size = 0
      if (reader) try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4 * 1024 * 1024) throw new Error('body_limit') } } finally { await reader.cancel().catch(() => {}) }
      return { path, status: r.status, ttfbMs: Math.round(ttfbMs), totalMs: Math.round(performance.now() - start), error: null }
    } catch (e) {
      return { path, status: 0, ttfbMs: ttfbMs === null ? null : Math.round(ttfbMs), totalMs: Math.round(performance.now() - start), error: e instanceof Error && e.message === 'body_limit' ? 'body_limit' : 'request_failed' }
    }
  }))
  return { version: 1, at: now.toISOString(), checks }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const file = process.argv[2]
  if (!file) throw new Error('Provide the output JSON path')
  await writeFile(file, JSON.stringify(await observe()) + '\n', { flag: 'wx' })
}
