import 'server-only'
import { cachedProjection } from '@marque/db'
import { summarizeOutside } from './uptime-log'

export const OUTSIDE_RAW = 'https://github.com/talk2francis/Marque/tree/status-log/status-log'

async function readLog(month: string, signal: AbortSignal): Promise<string> {
  const r = await fetch(`https://raw.githubusercontent.com/talk2francis/Marque/refs/heads/status-log/status-log/${month}.jsonl`, { cache: 'no-store', redirect: 'error', signal })
  if (r.status === 404) return ''
  if (!r.ok || !r.body) throw new Error('log_unavailable')
  const reader = r.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 2 * 1024 * 1024) throw new Error('log_limit')
      text += decoder.decode(part.value, { stream: true })
    }
    return text + decoder.decode()
  } finally { await reader.cancel().catch(() => {}) }
}

export function outsideChecks() {
  return cachedProjection('outside-checks:v1', async () => {
    const at = new Date().toISOString(), now = Date.parse(at)
    const months = [...new Set([at.slice(0, 7), new Date(now - 7 * 86_400_000).toISOString().slice(0, 7)])]
    try {
      const texts = await Promise.all(months.map(m => readLog(m, AbortSignal.timeout(2000))))
      return { at, summary: summarizeOutside(texts, now), error: null }
    } catch { return { at, summary: null, error: 'The outside log could not be read or validated.' } }
  }, { freshMs: 60_000, timeoutMs: 2300, staleWhileRevalidate: true }).then(p => p.value)
    .catch(() => ({ at: new Date().toISOString(), summary: null, error: 'The outside log could not be read in time.' }))
}
