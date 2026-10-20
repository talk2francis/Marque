import { safeFetch } from './safe-fetch.js'

/** Bounded ERC-8004 JSON metadata reader; no runtime or payment request. */
export async function readRegistrationMetadata(uri: string): Promise<Record<string, unknown> | null> {
  try {
    let text: string
    if (uri.startsWith('data:')) {
      if (uri.length > 768 * 1024) return null
      const comma = uri.indexOf(',')
      if (comma < 0) return null
      const head = uri.slice(0, comma)
      if (!/^data:application\/json(?:;charset=utf-8)?(?:;base64)?$/i.test(head)) return null
      const body = uri.slice(comma + 1)
      text = head.includes(';base64') ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body)
    } else if (/^https:\/\//i.test(uri)) {
      const r = await safeFetch(uri, { timeoutMs: 6_000, maxBytes: 256 * 1024 })
      if (!r.ok || r.status >= 400) return null
      text = r.body
    } else return null
    if (Buffer.byteLength(text, 'utf8') > 256 * 1024) return null
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const meta = parsed as Record<string, unknown>
    for (const key of ['services', 'endpoints']) {
      const value = meta[key]
      if (value != null && (!Array.isArray(value) || value.length > 64)) return null
    }
    return meta
  } catch { return null }
}
