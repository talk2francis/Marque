import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prepareRating, isSupportedChain } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { hireError, limited } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const Body = z.object({
  chainId: z.number().int(),
  jobId: z.string().regex(/^\d{1,30}$/),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(280).optional(),
})

/**
 * POST /api/v1/phase2/rate: check the rating guards (the wallet paid for this job, the job
 * was delivered, the wallet does not own or operate the agent), store the optional comment
 * behind the feedbackURI, and return the giveFeedback call for the buyer's wallet to send.
 * Marque never signs a rating.
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('rate', clientKey(req.headers), 20, 60_000, 'Ratings are limited to 20 a minute.')
  if (!v.ok) return limited(v.detail, v.retryAfterSeconds)
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !isSupportedChain(parsed.data.chainId)) {
    return NextResponse.json({ error: 'bad_request', detail: 'Send the chain, job, your wallet and 1 to 5 stars.' }, { status: 400 })
  }
  try {
    const p = await prepareRating({ ...parsed.data, chainId: parsed.data.chainId as 56 | 97 })
    return NextResponse.json({
      call: { to: p.call.to, chainId: p.call.chainId, functionName: p.call.functionName, args: p.call.args.map((a) => String(a)) },
      feedbackHash: p.feedbackHash, feedbackURI: p.feedbackURI, canonical: p.canonical, agentId: p.agentId,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'rate')
  }
}
