import { NextResponse } from 'next/server'
import { ALL_TOLERANCES, loadCase, type TestId } from '@marque/conformance'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const H = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' }
const TESTS = Object.keys(ALL_TOLERANCES) as TestId[]

/**
 * GET /api/v1/conformance/cases?test=MCS-HF-1 (SPEC-BUILDERS 6.1): the active published case for a test,
 * the same row the scheduled conformance runs and /standard read, with the question asked and the
 * tolerances it is graded at. Ground truth stays server side; grade an answer with POST /grade.
 */
export async function GET(req: Request) {
  const rate = checkWindow('cases-read', clientKey(req.headers), 60, 60_000, 'Case reads are limited to 60 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { ...H, 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  const want = new URL(req.url).searchParams.get('test')
  const tests = want ? TESTS.filter((t) => t === want) : TESTS
  if (want && !tests.length) return NextResponse.json({ error: 'bad_request', detail: `test must be one of ${TESTS.join(', ')}.` }, { status: 400, headers: H })
  try {
    const cases = (await Promise.all(tests.map((t) => loadCase(t)))).flatMap((c) => (c ? [{
      caseId: c.testCase.id, testId: c.testCase.testId, category: c.testCase.category, chainId: c.testCase.chainId,
      blockNumber: c.testCase.blockNumber.toString(), subject: c.testCase.subject, policy: c.testCase.policy, prompt: c.testCase.prompt,
      capturedAt: c.capturedAt ?? null, groundTruthHash: c.groundTruthHash,
      tolerances: ALL_TOLERANCES[c.testCase.testId],
    }] : []))
    return NextResponse.json({ cases, grade: '/api/v1/conformance/grade', note: 'Read chain state at blockNumber (an archive RPC). Each case is graded by the same code the Standard publishes.' }, { headers: H })
  } catch (e) {
    console.error('[api/v1/conformance/cases]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'unavailable', detail: 'The cases could not be read just now.' }, { status: 503, headers: H })
  }
}
