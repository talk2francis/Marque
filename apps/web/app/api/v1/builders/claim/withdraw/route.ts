import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { readClaimToken } from '../../../../../../lib/claim'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Delist: the owner proved control with a signed message (the same rail as listing, /claim/verify) and Marque marks
 * the listing withdrawn. The agent leaves the marketplace and the practice picker; its identity, its test results and
 * any job history stay on chain and on its record. Listing again is the claim rail again.
 */
const body = z.object({ claimToken: z.string().min(1).max(4000) })

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })
  let input: z.infer<typeof body>
  try { input = body.parse(await request.json()) } catch {
    return NextResponse.json({ error: 'bad_request', detail: 'Provide the claimToken from a signed proof.' }, { status: 400 })
  }
  const claim = readClaimToken(input.claimToken)
  if (!claim) return NextResponse.json({ error: 'claim_expired', detail: 'Prove control again: the claim window closed.' }, { status: 401 })
  const rows = (await db().execute(sql`
    update builder_listing set status = 'withdrawn', withdrawn_at = now()
    where agent_id = ${claim.agentId} and withdrawn_at is null
    returning id, withdrawn_at`)) as unknown as { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
  const list = (Array.isArray(rows) ? rows : rows.rows ?? [])
  if (!list.length) return NextResponse.json({ error: 'not_listed', detail: 'This identity has no listing on Marque to withdraw.' }, { status: 404 })
  return NextResponse.json({ withdrawn: true, agentId: claim.agentId, at: new Date(String(list[0]!['withdrawn_at'])).toISOString() })
}
