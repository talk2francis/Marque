import { NextResponse } from 'next/server'
import { jobLens } from '../../../../../lib/lens'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/judge/health (V4.2 L0): is the walkthrough's featured job still proving what /judge says? Read by the
 * alerts worker every 15 minutes. `ok` means the featured job's answer has at least one decided chain check.
 */
export async function GET() {
  const [chain, job] = (process.env['JUDGE_JOB'] ?? '56:57066').split(':') as [string, string]
  const lens = await jobLens(Number(chain) as 56 | 97, job).then((p) => p.value).catch(() => null)
  const decided = lens?.summary.checked ?? 0
  return NextResponse.json({
    job: `${chain}:${job}`, ok: decided > 0, state: lens?.state ?? 'unreadable', reason: lens?.reason ?? null,
    checked: decided, agreed: lens?.summary.agreed ?? 0, at: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
