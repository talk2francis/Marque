import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { quoteForBuyer } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { hireError, limited } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const Body = z.object({
  agentId: z.string().min(3).max(200),
  serviceId: z.number().int().positive().nullable().optional(),
  task: z.string().trim().min(3).max(1200),
})

/**
 * POST /api/v1/hire/quote: ask this exact agent for a signed price on the buyer's task.
 * Verified server side (signer or provider = the agent's registered wallet, chain,
 * escrow contract, token). Free: a quote binds nobody until the buyer's wallet opens a job.
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('quote', clientKey(req.headers), 20, 60_000, 'Quotes are limited to 20 a minute.')
  if (!v.ok) return limited(v.detail, v.retryAfterSeconds)
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send the agent and a short task description.' }, { status: 400 })
  try {
    const { agentId, serviceId, task } = parsed.data
    const q = await quoteForBuyer(agentId, serviceId ?? null, {
      task_description: task,
      terms: { deliverables: 'Complete the task as described, with the result delivered on chain.', quality_standards: 'Figures read from BNB Chain at delivery time, with sources.' },
    })
    return NextResponse.json(q, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'quote')
  }
}
