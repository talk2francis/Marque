import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { notifySeller } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { hireError, limited } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Body = z.object({
  chainId: z.union([z.literal(56), z.literal(97)]),
  jobId: z.string().regex(/^\d{1,20}$/),
  params: z.record(z.union([z.string().max(200), z.number()])).optional(),
})

/**
 * POST /api/v1/hire/notify: tell the agent its job is paid. Idempotent. The agent checks
 * the escrow on chain before starting, and the worker retries if this call is lost.
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('notify', clientKey(req.headers), 30, 60_000, 'Too many requests.')
  if (!v.ok) return limited(v.detail, v.retryAfterSeconds)
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send the network and job number.' }, { status: 400 })
  try {
    return NextResponse.json(await notifySeller(parsed.data.chainId, parsed.data.jobId, { params: parsed.data.params }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'notify')
  }
}
