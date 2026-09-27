import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { probeNow } from '../../../../../lib/builder'

export const dynamic = 'force-dynamic'

const Body = z.object({
  chainId: z.union([z.literal(56), z.literal(97)]),
  tokenId: z.string().regex(/^\d{1,12}$/),
  endpoint: z.string().url().max(500).refine((u) => u.startsWith('https://'), 'The endpoint must be https.'),
})

/**
 * POST /api/v1/builders/probe: "Probe now". One probe of the endpoint through safeFetch
 * (SSRF guard, timeout, size cap), recorded against the identity. Anyone may run it;
 * it is rate limited, and a probe proves only that the endpoint answers.
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('builder-probe', clientKey(req.headers), 6, 60_000, 'Probes are limited to 6 a minute.')
  if (!v.ok) return NextResponse.json({ error: 'rate_limited', detail: v.detail }, { status: 429, headers: { 'Retry-After': String(v.retryAfterSeconds ?? 60) } })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: parsed.error.issues[0]?.message ?? 'Send the network, the token id and an https endpoint.' }, { status: 400 })
  try {
    const out = await probeNow(parsed.data.chainId, parsed.data.tokenId, parsed.data.endpoint)
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[api/v1/builders/probe]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'probe_failed', detail: 'The probe could not run just now. Try again in a minute.' }, { status: 503 })
  }
}
