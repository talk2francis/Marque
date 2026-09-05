import { NextResponse } from 'next/server'
import { z } from 'zod'
import { startRun } from '../../../../lib/runs'
import { recentRuns } from '../../../../lib/runs'
import { checkBurst, clientKey } from '../../../../lib/limits'

export const dynamic = 'force-dynamic'

const body = z.object({
  agentId: z.string().min(1).max(200),
  subject: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  kind: z.enum(['rebalance', 'grid', 'yield', 'health_factor']),
  policy: z.record(z.unknown()),
  positionTokenId: z.string().regex(/^\d+$/).optional(),
  pair: z.string().min(3).max(40).optional(),
  maxSpendUsd: z.number().positive().max(50),
  charterId: z.string().max(200).nullish(),
})

export async function GET() {
  return NextResponse.json({ runs: await recentRuns() })
}

export async function POST(request: Request) {
  const burst = checkBurst(`run:${clientKey(request.headers)}`)
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch (err) {
    const detail = err instanceof z.ZodError
      ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'the request body could not be read'
    return NextResponse.json({ error: detail }, { status: 400 })
  }

  const result = await startRun(input)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ runId: result.runId, url: `/runs/${result.runId}` }, { status: 202 })
}
