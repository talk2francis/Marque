import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { KIT_CATEGORIES, kitFiles, slugOf, type KitCategory } from '../../../../../lib/forge-kit'
import { zip } from '../../../../../lib/zip'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/builders/kit?category=&name=&description=&price= (SPEC-BUILDERS 6.1): a deterministic
 * starter zip. The same inputs give the same bytes (the ETag is their hash). No working strategy ships.
 */
export async function GET(req: Request) {
  const rate = checkWindow('forge-kit', clientKey(req.headers), 20, 60_000, 'Kits are limited to 20 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  const p = new URL(req.url).searchParams
  const category = p.get('category') as KitCategory | null
  const name = (p.get('name') ?? '').trim().slice(0, 60)
  const description = (p.get('description') ?? '').trim().slice(0, 280)
  const price = Number(p.get('price') ?? '0.1')
  if (!category || !KIT_CATEGORIES.includes(category)) return NextResponse.json({ error: 'bad_request', detail: `category must be one of ${KIT_CATEGORIES.join(', ')}.` }, { status: 400 })
  if (name.length < 2 || !/^[\p{L}\p{N} ._-]+$/u.test(name)) return NextResponse.json({ error: 'bad_request', detail: 'Give the agent a name of 2 to 60 letters, numbers, spaces, dots or dashes.' }, { status: 400 })
  if (description.length < 10) return NextResponse.json({ error: 'bad_request', detail: 'Describe the agent in at least 10 characters.' }, { status: 400 })
  if (!Number.isFinite(price) || price <= 0 || price > 1000) return NextResponse.json({ error: 'bad_request', detail: 'Price must be above 0 and at most 1000 U.' }, { status: 400 })
  const bytes = zip(kitFiles({ category, name, description, priceU: price }))
  const etag = `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  return new NextResponse(Buffer.from(bytes), { headers: {
    'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${slugOf(name)}-marque-starter.zip"`,
    'Cache-Control': 'public, max-age=3600', ETag: etag,
  } })
}
