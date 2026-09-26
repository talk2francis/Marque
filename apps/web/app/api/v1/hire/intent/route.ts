import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createIntent } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { hireError, limited } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const Body = z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/), quoteId: z.number().int().positive() })

/**
 * POST /api/v1/hire/intent: record that this wallet intends to hire at this quote, and
 * return the exact createJob call to sign. No signature is asked for: the intent binds
 * only if this same wallet sends a createJob whose terms match (SPEC-TRACKING 5).
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send your wallet address and the quote.' }, { status: 400 })
  const ip = clientKey(req.headers)
  const v1 = checkWindow('intent-wallet', parsed.data.wallet, 10, 60_000, 'Hires are limited to 10 a minute per wallet.')
  const v2 = checkWindow('intent-ip', ip, 30, 60_000, 'Too many hires from this connection.')
  if (!v1.ok) return limited(v1.detail, v1.retryAfterSeconds)
  if (!v2.ok) return limited(v2.detail, v2.retryAfterSeconds)
  try {
    return NextResponse.json(await createIntent({ ...parsed.data, clientIp: ip }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'intent')
  }
}
