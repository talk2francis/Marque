import { NextResponse } from 'next/server'
import { z } from 'zod'
import { grade, loadCaseById } from '@marque/conformance'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' }
const body = z.object({ caseId: z.string().min(3).max(200), response: z.unknown() })

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS' } }) }

/**
 * POST /api/v1/conformance/grade (SPEC-BUILDERS 6.1): grade an answer against a published case's frozen
 * ground truth with the Standard's own grader. Nothing is stored: a builder may fail privately, and a
 * pass here is not a warrant (only the scheduled run against a listed agent records one).
 */
export async function POST(req: Request) {
  const rate = checkWindow('cases-grade', clientKey(req.headers), 30, 60_000, 'Grading is limited to 30 answers a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { ...H, 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  const text = await req.text()
  if (text.length > 256_000) return NextResponse.json({ error: 'too_large', detail: 'Send at most 256 KB.' }, { status: 413, headers: H })
  let input: z.infer<typeof body>
  try { input = body.parse(JSON.parse(text)) } catch { return NextResponse.json({ error: 'bad_request', detail: 'Send JSON: { caseId, response }.' }, { status: 400, headers: H }) }
  const loaded = await loadCaseById(input.caseId).catch(() => null)
  if (!loaded) return NextResponse.json({ error: 'unknown_case', detail: 'No active case with that id. Read the current ones from /api/v1/conformance/cases.' }, { status: 404, headers: H })
  const diffs = grade(loaded.testCase.testId, loaded.groundTruth, input.response)
  return NextResponse.json({ caseId: loaded.testCase.id, testId: loaded.testCase.testId, blockNumber: loaded.testCase.blockNumber.toString(), pass: diffs.length > 0 && diffs.every((d) => d.pass), diffs, recorded: false }, { headers: H })
}
