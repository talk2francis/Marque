import { NextResponse } from 'next/server'
import { questJob, isSupportedChain } from '@marque/commerce'
import { served, bad, HEADERS } from '../../../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/phase2/job/:chainId/:jobId (SPEC-TRACKING 6.4): the full job timeline. Also the feedbackURI of Marque ratings. */
export async function GET(_req: Request, { params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const { chainId, jobId } = await params
  const c = Number(chainId)
  if (!isSupportedChain(c)) return bad('chainId must be 56 or 97.')
  if (!/^\d{1,30}$/.test(jobId)) return bad('jobId must be a number.')
  const res = await served(`phase2:job:${c}:${jobId}`, 'job', async () => (await questJob(c, jobId)) ?? { notFound: true })
  const body = await res.clone().json().catch(() => null) as { notFound?: boolean } | null
  if (body?.notFound) return NextResponse.json({ error: 'not_found', detail: `No indexed job ${jobId} on chain ${c}.` }, { status: 404, headers: HEADERS })
  return res
}
