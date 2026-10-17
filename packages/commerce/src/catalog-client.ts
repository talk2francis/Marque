import { catalogQuerySchema, machineCatalogSchema, type CatalogQuery, type MachineCatalog } from './catalog-contract.js'
export * from './catalog-contract.js'

export class CatalogReadError extends Error {
  constructor(readonly code: 'invalid_query' | 'unavailable' | 'rate_limited' | 'invalid_response' | 'timeout', readonly retryAfterSeconds: number | null = null) { super(code) }
}

/** GET only. This client has no task, wallet, signing, payment or execution method. */
export async function readMachineCatalog(base: string, filters: CatalogQuery = {}, options: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<MachineCatalog> {
  const parsed = catalogQuerySchema.safeParse(filters)
  if (!parsed.success) throw new CatalogReadError('invalid_query')
  let origin: URL
  try { origin = new URL(base) } catch { throw new CatalogReadError('invalid_query') }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash) throw new CatalogReadError('invalid_query')
  const url = new URL('/api/v1/marketplace', origin)
  url.searchParams.set('format', 'machine')
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) url.searchParams.set(k, String(v))
  const timeoutMs = options.timeoutMs ?? 15_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new CatalogReadError('invalid_query')
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await (options.fetch ?? fetch)(url, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit', signal: controller.signal, redirect: 'error' })
    if (response.status === 429) {
      const n = Number(response.headers.get('Retry-After'))
      throw new CatalogReadError('rate_limited', Number.isSafeInteger(n) && n > 0 && n <= 3600 ? n : null)
    }
    if (!response.ok || !response.body || !response.headers.get('Content-Type')?.includes('application/json')) throw new CatalogReadError('unavailable')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const p = await reader.read()
        if (p.done) break
        bytes += p.value.byteLength
        if (bytes > 2 * 1024 * 1024) { controller.abort(); await reader.cancel().catch(() => undefined); throw new CatalogReadError('invalid_response') }
        chunks.push(p.value)
      }
    } finally { reader.releaseLock() }
    const joined = new Uint8Array(bytes)
    let at = 0
    for (const chunk of chunks) { joined.set(chunk, at); at += chunk.byteLength }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined))
    const result = machineCatalogSchema.safeParse(body)
    if (!result.success) throw new CatalogReadError('invalid_response')
    return result.data
  } catch (e) {
    if (e instanceof CatalogReadError) throw e
    throw new CatalogReadError(controller.signal.aborted ? 'timeout' : 'invalid_response')
  } finally { clearTimeout(timer) }
}
