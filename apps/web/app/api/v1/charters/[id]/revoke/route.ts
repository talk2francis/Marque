import { NextResponse } from 'next/server'
import { charterService, charterServiceAvailable, readCharter } from '../../../../../../lib/charters'
import { checkBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/**
 * Revoke. One transaction, immediately.
 *
 * There is no confirmation step and no soft state. Altana's criteria name
 * revocation explicitly, and a revoke that first opens a dialogue asking
 * whether you are sure is a revoke that arrives after the money has moved.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!charterServiceAvailable()) {
    return NextResponse.json({ error: 'charters are not configured on this deployment' }, { status: 503 })
  }
  const burst = checkBurst(`revoke:${clientKey(request.headers)}`)
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  const { id } = await params
  const charterId = decodeURIComponent(id)
  const existing = await readCharter(charterId)
  if (!existing) return NextResponse.json({ error: 'no such charter' }, { status: 404 })
  if (existing.status === 'revoked') {
    return NextResponse.json({ charter: existing, alreadyRevoked: true })
  }

  const result = await charterService().revoke(charterId)
  if (!result.ok) {
    return NextResponse.json(
      { error: `the revocation did not land: ${result.detail ?? 'unknown'}` },
      { status: 502 },
    )
  }
  const charter = await readCharter(charterId)
  return NextResponse.json({ charter, txHash: result.txHash })
}
