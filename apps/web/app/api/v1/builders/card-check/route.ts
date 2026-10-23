import { NextResponse } from 'next/server'
import { FORGE_CATEGORIES, type ForgeCategory } from '@marque/commerce'
import { checkCard } from '../../../../../lib/card-check'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const H = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

/**
 * GET /api/v1/builders/card-check?url=&category= (SPEC-BUILDERS 5). Five checks on an A2A agent card,
 * each with what failed, what Marque got (secrets redacted) and the fix. Calls go through safeFetch.
 */
export async function GET(req: Request) {
  const rate = checkWindow('card-check', clientKey(req.headers), 12, 60_000, 'Card checks are limited to 12 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { ...H, 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  const p = new URL(req.url).searchParams
  const url = (p.get('url') ?? '').trim()
  if (!url || url.length > 500) return NextResponse.json({ error: 'bad_request', detail: 'Send ?url= with the agent card URL.' }, { status: 400, headers: H })
  const c = p.get('category')
  const want = c && (FORGE_CATEGORIES as readonly string[]).includes(c) ? (c as ForgeCategory) : null
  try {
    return NextResponse.json(await checkCard(url, want), { headers: H })
  } catch (e) {
    console.error('[api/v1/builders/card-check]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'unavailable', detail: 'The check could not run just now.' }, { status: 503, headers: H })
  }
}
