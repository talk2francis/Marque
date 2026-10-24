import { NextResponse } from 'next/server'
import { z } from 'zod'
import { makePlan } from '../../../../../lib/act'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const Body = z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string().regex(/^\d{1,12}$/), user: z.string().regex(/^0x[0-9a-fA-F]{40}$/), amount: z.number().positive().finite().nullable().optional() })

/** POST /api/v1/act/plan (SPEC-ACT 3): rebuild, simulate and predict an action from a delivered answer. */
export async function POST(req: Request) {
  const rate = checkWindow('act-plan', clientKey(req.headers), 20, 60_000, 'Limited to 20 plans a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429 })
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'bad_request', detail: 'Send { chainId, jobId, user, amount? }.' }, { status: 400 })
  try {
    const r = await makePlan(p.data.chainId, p.data.jobId, p.data.user, p.data.amount ?? null)
    return NextResponse.json(JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[api/v1/act/plan]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'unavailable', detail: 'The plan could not be built just now. Nothing was signed.' }, { status: 503 })
  }
}
