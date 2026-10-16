import { NextResponse } from 'next/server'
import { cachedProjection } from '@marque/db'
import { campaignChainId, isSupportedChain, type ChainId } from '@marque/commerce'

/** Shared plumbing for the public Set and Earn API (SPEC-TRACKING 6): 15 s cache, open CORS. */
export const HEADERS = { 'Cache-Control': 'public, max-age=15', 'Access-Control-Allow-Origin': '*' }

export async function served<T>(key: string, name: string, build: () => Promise<T>): Promise<NextResponse> {
  try {
    const p = await cachedProjection(key, build, { freshMs: 15_000, timeoutMs: 10_000 })
    return NextResponse.json(p.value, { headers: {
      ...HEADERS,
      'Cache-Control': p.stale ? 'no-store' : `public, max-age=${Math.max(0, 15 - Math.ceil(p.ageMs / 1000))}`,
      'X-Marque-Projection-Computed-At': p.computedAt,
      'X-Marque-Projection-Age-Ms': String(p.ageMs),
      'X-Marque-Projection-Stale': String(p.stale),
      'Access-Control-Expose-Headers': 'X-Marque-Projection-Computed-At, X-Marque-Projection-Age-Ms, X-Marque-Projection-Stale',
    } })
  } catch (err) {
    console.error(`[api/v1/phase2/${name}]`, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: `${name}_unavailable`, detail: 'This could not be computed just now. Try again in a minute.' }, { status: 503, headers: { ...HEADERS, 'Cache-Control': 'no-store' } })
  }
}

export function bad(detail: string): NextResponse {
  return NextResponse.json({ error: 'bad_request', detail }, { status: 400, headers: HEADERS })
}

export const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** ?chainId=56|97, defaulting to the campaign network. */
export function chainParam(url: string): ChainId | null {
  const raw = new URL(url).searchParams.get('chainId')
  if (raw === null) return campaignChainId()
  const n = Number(raw)
  return isSupportedChain(n) ? n : null
}
