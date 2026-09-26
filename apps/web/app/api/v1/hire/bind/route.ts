import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { bindIntent } from '@marque/commerce'
import { hireError } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const Body = z.object({ intentId: z.string().uuid(), txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })

/** POST /api/v1/hire/bind: bind a confirmed createJob to its intent, only if the chain agrees. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send the hire and the transaction hash.' }, { status: 400 })
  try {
    return NextResponse.json(await bindIntent({ ...parsed.data, source: 'browser' }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'bind')
  }
}
