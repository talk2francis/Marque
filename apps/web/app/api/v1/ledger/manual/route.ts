import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, benchmark as benchmarkTable, benchmarkRun } from '@marque/db'
import { eq } from 'drizzle-orm'
import { hashContent, manifestHash, totalCost, type BenchmarkManifest } from '@marque/ledger'
import { checkBurst, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/**
 * Manual-arm intake.
 *
 * A human runs the manual arm with a stopwatch and a screen recording, then
 * pastes the output here. This endpoint HASHES what they paste into the same
 * manifest shape the agent arm produces, so the two arms are comparable and
 * neither can be edited after the fact without the hash changing.
 *
 * Two things it deliberately refuses to do:
 *
 *  - It will not accept an elapsed time it did not receive. There is no
 *    default and no estimate: an estimate presented as a measurement is
 *    escalation gate 4, and the manual arm's whole value is that someone
 *    actually held a stopwatch.
 *  - It will not overwrite a repetition that already exists. A second paste is
 *    a second repetition or an error, never a silent replacement of the first.
 */
const body = z.object({
  benchmarkId: z.string().min(1).max(40),
  rep: z.number().int().min(1).max(10),
  /** The analyst's answer, verbatim. Stored whole and hashed. */
  output: z.string().min(1).max(200_000),
  /** Wall clock, from the analyst's own timer. Required, never defaulted. */
  elapsedSeconds: z.number().positive().max(86_400),
  /** How the time was measured, in their words. Published with the result. */
  timingMethod: z.string().min(3).max(400),
  /** What the analyst's time is worth, so a reader can re-price the result. */
  humanRateUsdPerHour: z.number().min(0).max(2000).nullish(),
  /** Anything the analyst paid: an API, a data subscription, gas. */
  outOfPocketUsd: z.number().min(0).max(10_000).nullish(),
  evidenceUrl: z.string().url().max(500).nullish(),
  note: z.string().max(2000).nullish(),
})

export async function POST(request: Request) {
  const burst = checkBurst(`ledger:${clientKey(request.headers)}`)
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

  const [bench] = await db().select().from(benchmarkTable)
    .where(eq(benchmarkTable.id, input.benchmarkId)).limit(1)
  if (!bench) {
    return NextResponse.json({ error: `no benchmark ${input.benchmarkId} is registered` }, { status: 404 })
  }

  const existing = await db().select().from(benchmarkRun)
    .where(eq(benchmarkRun.benchmarkId, input.benchmarkId))
  if (existing.some((r) => r.arm === 'manual' && r.rep === input.rep)) {
    return NextResponse.json(
      { error: `manual repetition ${input.rep} of ${input.benchmarkId} is already recorded. A benchmark arm is never overwritten — record it as the next repetition, or say what went wrong.` },
      { status: 409 },
    )
  }

  const elapsedMs = Math.round(input.elapsedSeconds * 1000)
  const humanUsd = input.humanRateUsdPerHour
    ? Number(((input.elapsedSeconds / 3600) * input.humanRateUsdPerHour).toFixed(4))
    : null
  const cost = totalCost({
    gasUsd: 0,
    llmUsd: 0,
    agentFeeUsd: input.outOfPocketUsd ?? 0,
    humanUsd,
    humanRateUsdPerHour: input.humanRateUsdPerHour ?? null,
  })

  const outputHash = hashContent(input.output)
  const manifest: BenchmarkManifest = {
    version: '1',
    benchmark_id: bench.id,
    arm: 'manual',
    rep: input.rep,
    task_hash: bench.taskHash,
    input_hash: bench.inputHash,
    manual_output_hash: outputHash,
    agent_output_hash: null,
    agent_id: null,
    block: String((bench.input as Record<string, unknown>)['block'] ?? ''),
    job_id: null,
    tx_hashes: [],
    cost_breakdown: cost,
    elapsed_ms: elapsedMs,
    rubric_version: bench.rubricVersion,
    rubric_hash: bench.rubricHash,
    score_breakdown: {},
    score_total: 0,
    score_out_of: 0,
    ran_at: new Date().toISOString(),
  }

  // The manual sitting is keyed to the task the analyst actually answered.
  // Re-registering the benchmark at a new block produces a new task hash and
  // therefore a new sitting, so a manual arm can never be silently paired
  // against a task it never saw.
  const batch = `m${bench.taskHash.slice(2, 14)}`

  await db().insert(benchmarkRun).values({
    benchmarkId: bench.id,
    arm: 'manual',
    rep: input.rep,
    batch,
    output: { text: input.output },
    outputText: input.output,
    outputHash,
    elapsedMs,
    timingMethod: input.timingMethod,
    blockNumber: manifest.block || '0',
    txHashes: [],
    costBreakdown: cost as unknown as Record<string, unknown>,
    manifest: manifest as unknown as Record<string, unknown>,
    manifestHash: manifestHash(manifest),
    evidenceUrl: input.evidenceUrl ?? null,
    note: input.note ?? null,
  })

  return NextResponse.json({
    ok: true,
    benchmarkId: bench.id,
    rep: input.rep,
    outputHash,
    manifestHash: manifestHash(manifest),
  }, { status: 201 })
}
