import 'server-only'
import { NextResponse } from 'next/server'
import type { ZodTypeAny, output } from 'zod'
import { checkWindow, clientKey } from './limits'
import { chartersVisible, previewCookieFrom } from './charters-access'

/** Shared plumbing for /api/v1/guards: the launch gate, a per-client limit, Zod on the query, no caching of live reads. */
export const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })

export function gate(request: Request, bucket: string, perMinute: number): NextResponse | null {
  if (!chartersVisible(previewCookieFrom(request.headers))) return notFound()
  const limit = checkWindow(`guards:${bucket}`, clientKey(request.headers), perMinute, 60_000, 'Too many requests.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfterSeconds ?? 60) } })
  return null
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): { ok: true; value: output<S> } | { ok: false; response: NextResponse } {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const r = schema.safeParse(params)
  if (r.success) return { ok: true, value: r.data as output<S> }
  return { ok: false, response: NextResponse.json({ error: 'bad_request', detail: r.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; ') }, { status: 400, headers: NO_STORE }) }
}

/** Errors become an honest unavailable, never a stack or a raw RPC message (AGENTS.md invariant 31). */
export function unavailable(): NextResponse {
  return NextResponse.json({ error: 'unavailable', detail: 'The chain or the charter index could not be read just now. Nothing was changed.' }, { status: 503, headers: NO_STORE })
}
