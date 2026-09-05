import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  CASES, captureCase, loadCase, runConformance, adapterFor, type TestId,
} from '@marque/conformance'
import { checkTestBurst, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The free public conformance tool.
 *
 * Anyone may point this at any endpoint, which makes it an SSRF primitive if
 * built carelessly. Every outbound request goes through the adapters, and every
 * adapter goes through `safeFetch` — DNS resolved first, private, reserved,
 * link-local and metadata ranges refused, re-validated after each redirect,
 * hard timeout, response size cap.
 *
 * Results here are NOT persisted against an agent's public record. A builder
 * testing their own work-in-progress must be able to fail privately; a tool
 * that published every attempt would simply not be used, and the published
 * record is supposed to mean an agent was tested, not that someone once poked
 * an endpoint that happened to be theirs.
 */

const body = z.object({
  endpoint: z.string().url().max(500),
  testId: z.enum(['MCS-REB-1', 'MCS-GRID-1', 'MCS-YIELD-1', 'MCS-HF-1']),
  kind: z.enum(['a2a', 'mcp']).default('a2a'),
})

export async function POST(request: Request) {
  const burst = checkTestBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch {
    return NextResponse.json({
      error: 'bad_request',
      detail: 'Provide an endpoint URL, a testId and optionally kind (a2a or mcp).',
    }, { status: 400 })
  }

  const spec = CASES.find((c) => c.testId === input.testId)
  if (!spec) return NextResponse.json({ error: 'no_such_test' }, { status: 404 })

  // Capture the case immediately before running it. BSC keeps ~64 blocks of
  // state — about 29 seconds — so a case captured any earlier cannot be read
  // by the endpoint under test OR by us, and the comparison would be against
  // a block neither side could see.
  try {
    await captureCase({ id: spec.id, testId: spec.testId, subject: spec.subject, policy: spec.policy })
  } catch (err) {
    return NextResponse.json({
      error: 'could_not_capture_case',
      detail: err instanceof Error ? err.message : 'the chain read failed',
    }, { status: 503 })
  }

  const loaded = await loadCase(input.testId as TestId)
  if (!loaded) return NextResponse.json({ error: 'no_active_case' }, { status: 503 })

  const adapter = adapterFor(input.kind, 'builders:test', 'endpoint under test', input.endpoint)
  if (!adapter) {
    return NextResponse.json({
      error: 'unsupported_kind',
      detail: 'Only A2A and MCP expose a task interface we can address generically.',
    }, { status: 400 })
  }

  try {
    const outcome = await runConformance({ adapter, testId: input.testId as TestId, persist: false })
    return NextResponse.json({
      testId: outcome.testId,
      pass: outcome.pass,
      error: outcome.error ?? null,
      latencyMs: outcome.latencyMs,
      caseId: outcome.caseId,
      blockNumber: outcome.blockNumber,
      diffs: outcome.diffs,
      note: 'This result is not recorded against any public agent record. Testing your own work should not be publishing it.',
    })
  } catch (err) {
    return NextResponse.json({
      error: 'run_failed',
      detail: err instanceof Error ? err.message : 'the run failed',
    }, { status: 502 })
  }
}
