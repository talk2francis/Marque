import { NextResponse } from 'next/server'
import { z } from 'zod'
import { benchmarkById, runAgentArm, reproductionBatch } from '@marque/ledger'
import { checkBurst, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/**
 * Reproduce: re-run the agent arm, live, right now.
 *
 * This is the button that makes the Ledger checkable rather than merely
 * published. A reader who does not believe the recorded run can produce a new
 * one against current chain state and compare — and because the new run is
 * recorded as its own repetition with its own manifest, it becomes part of the
 * record rather than a private demo.
 *
 * It never overwrites an earlier repetition. A reproduction that disagrees with
 * the original is the most interesting thing that can happen here, and hiding
 * it by overwriting would defeat the point.
 */
const body = z.object({ benchmarkId: z.string().min(1).max(40) })

export async function POST(request: Request) {
  const burst = checkBurst(`reproduce:${clientKey(request.headers)}`)
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'the request body could not be read' }, { status: 400 })
  }

  const spec = benchmarkById(input.benchmarkId)
  if (!spec) return NextResponse.json({ error: `no benchmark ${input.benchmarkId}` }, { status: 404 })

  // A reproduction is its own single-repetition sitting at today's block. It
  // is recorded and shown, but it never becomes the published result — the
  // registered comparison was run at a pinned block and a visitor clicking a
  // button must not be able to replace it.
  const batch = await reproductionBatch()
  const base = process.env['MARQUE_PUBLIC_URL'] ?? 'https://marque.trade'
  const result = await runAgentArm(spec, 1, { baseUrl: base, batch })
  return NextResponse.json({ ...result, benchmarkId: spec.id }, { status: result.ok ? 200 : 502 })
}
