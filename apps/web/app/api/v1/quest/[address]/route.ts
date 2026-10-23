import { NextResponse } from 'next/server'
import { clientKey, checkWindow } from '../../../../../lib/limits'
import { questProjection, questChains, QUEST_ADDRESS } from '../../../../../lib/quest-api'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-Marque-Projection-Computed-At, X-Marque-Projection-Age-Ms, X-Marque-Projection-Stale, Retry-After',
}

const fail = (status: number, error: string, detail: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ error, detail }, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...extra } })

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } })
}

/**
 * GET /api/v1/quest/{address}?chains=56,97 (SPEC-ADOPTION 2.5). Set and Earn progress for any
 * address, across every shortlisted marketplace, from chain data. Open to everyone (CORS *),
 * cached 60 s per address, 60 requests a minute per client.
 */
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!QUEST_ADDRESS.test(address)) return fail(400, 'bad_request', 'Send a 0x address of 40 hex characters.')
  const chains = questChains(new URL(req.url).searchParams.get('chains'))
  if (!chains) return fail(400, 'bad_request', 'chains must be 56, 97 or 56,97.')
  const limit = checkWindow('quest', clientKey(req.headers), 60, 60_000, 'The quest API allows 60 requests a minute per client.')
  if (!limit.ok) return fail(429, 'rate_limited', limit.detail ?? 'Too many requests.', { 'Retry-After': String(limit.retryAfterSeconds ?? 60) })
  try {
    const p = await questProjection(address, chains)
    return NextResponse.json(p.value, { headers: {
      ...CORS,
      'Cache-Control': p.stale ? 'no-store' : `public, max-age=${Math.max(0, 60 - Math.ceil(p.ageMs / 1000))}`,
      'X-Marque-Projection-Computed-At': p.computedAt,
      'X-Marque-Projection-Age-Ms': String(p.ageMs),
      'X-Marque-Projection-Stale': String(p.stale),
    } })
  } catch (err) {
    console.error('[api/v1/quest]', err instanceof Error ? err.message.slice(0, 200) : String(err))
    return fail(503, 'quest_unavailable', 'Progress could not be read from chain just now. Try again in a minute.')
  }
}
