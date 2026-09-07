import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CASES, captureCase, loadCase, runConformance, adapterFor, type TestId } from '@marque/conformance'
import { db, conformanceResult } from '@marque/db'
import { readClaimToken } from '../../../../../../lib/claim'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Step 3: run the Standard against the endpoint the builder is about to list,
 * in front of them, and KEEP the result — attached to the real ERC-8004
 * identity so it shows on the profile and counts on /standard.
 *
 * This differs from /api/v1/builders/test in exactly one way: that tool never
 * persists, because testing your own work-in-progress should not publish it.
 * Here the builder has proven control and is choosing to put the result on the
 * record, pass or fail.
 */

const body = z.object({
  claimToken: z.string().min(1).max(4000),
  endpoint: z.string().url().max(500),
  testId: z.enum(['MCS-REB-1', 'MCS-GRID-1', 'MCS-YIELD-1', 'MCS-HF-1']),
  kind: z.enum(['a2a', 'mcp']).default('a2a'),
})

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'bad_request', detail: 'Provide claimToken, endpoint, testId and kind.' }, { status: 400 })
  }

  const claim = readClaimToken(input.claimToken)
  if (!claim) return NextResponse.json({ error: 'claim_expired', detail: 'Prove control again — the claim window closed.' }, { status: 401 })

  const spec = CASES.find((c) => c.testId === input.testId)
  if (!spec) return NextResponse.json({ error: 'no_such_test' }, { status: 404 })

  try {
    await captureCase({ id: spec.id, testId: spec.testId, subject: spec.subject, policy: spec.policy })
  } catch (err) {
    return NextResponse.json({ error: 'could_not_capture_case', detail: err instanceof Error ? err.message : 'the chain read failed' }, { status: 503 })
  }

  const loaded = await loadCase(input.testId as TestId)
  if (!loaded) return NextResponse.json({ error: 'no_active_case' }, { status: 503 })

  const adapter = adapterFor(input.kind, claim.agentId, 'listed by owner', input.endpoint)
  if (!adapter) {
    return NextResponse.json({ error: 'unsupported_kind', detail: 'Only A2A and MCP expose a task interface we can address generically.' }, { status: 400 })
  }

  let outcome
  try {
    outcome = await runConformance({ adapter, testId: input.testId as TestId, persist: false })
  } catch (err) {
    return NextResponse.json({ error: 'run_failed', detail: err instanceof Error ? err.message : 'the run failed' }, { status: 502 })
  }

  // Persist against the real identity, pass or fail. Invariant 7: failures ship.
  const [row] = await db().insert(conformanceResult).values({
    agentId: claim.agentId,
    testId: outcome.testId,
    testVersion: outcome.testVersion,
    toleranceRevision: outcome.toleranceRevision,
    category: outcome.category,
    caseId: outcome.caseId,
    chainId: outcome.chainId,
    blockNumber: outcome.blockNumber,
    pass: outcome.pass,
    diffs: outcome.diffs as unknown[],
    failedFields: outcome.failedFields,
    latencyMs: outcome.latencyMs,
    costUsd: outcome.costUsd,
    request: outcome.request as Record<string, unknown>,
    response: outcome.response as Record<string, unknown>,
    requestHash: outcome.requestHash,
    responseHash: outcome.responseHash,
    error: outcome.error,
  }).returning({ id: conformanceResult.id })

  return NextResponse.json({
    conformanceResultId: row?.id ?? null,
    testId: outcome.testId,
    category: outcome.category,
    pass: outcome.pass,
    error: outcome.error ?? null,
    latencyMs: outcome.latencyMs,
    caseId: outcome.caseId,
    blockNumber: outcome.blockNumber,
    diffs: outcome.diffs,
    note: 'This result is now on the public record for this identity, whichever way it went.',
  })
}
