import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { FreeTryError, freeTarget, tryFree } from '@marque/commerce'
import { engineFor } from '@marque/agent-engines'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { hireError, limited } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const Body = z.object({
  agentId: z.string().min(3).max(200),
  task: z.string().trim().min(3).max(1200),
})

/**
 * POST /api/v1/hire/try: run the buyer's task on this exact agent's free face, before any
 * money moves. No wallet, no quote, nothing stored, nothing on chain. Marque's own agents
 * first say whether the task names what they need, exactly as the quote route does.
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('try', clientKey(req.headers), 6, 60_000, 'Free tries are limited to 6 a minute.')
  if (!v.ok) return limited(v.detail, v.retryAfterSeconds)
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send the agent and a short task description.' }, { status: 400 })
  try {
    const { agentId, task } = parsed.data
    const seller = await freeTarget(agentId)
    const engine = seller.firstPartySlug ? engineFor(seller.firstPartySlug) : null
    const check = engine?.inspect(task) ?? { missing: [], assumptions: [] }
    if (check.missing.length) {
      return NextResponse.json(
        { error: 'task_incomplete', detail: `${seller.name} needs ${check.missing.join(' and ')} in the task before it can answer.`, missing: check.missing },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const answer = await tryFree(agentId, task)
    return NextResponse.json({ ...answer, assumptions: check.assumptions }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof FreeTryError) return NextResponse.json({ error: err.code, detail: err.message }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
    return hireError(err, 'try')
  }
}
