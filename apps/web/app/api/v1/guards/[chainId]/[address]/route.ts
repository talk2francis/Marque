import { NextResponse } from 'next/server'
import { teamWallets } from '@marque/commerce'
import { GuardKey } from '@marque/charters'
import { guardDetail } from '../../../../../../lib/guards'
import { guardPageVisible, previewCookieFrom } from '../../../../../../lib/charters-access'
import { checkWindow, clientKey } from '../../../../../../lib/limits'
import { NO_STORE, notFound, unavailable } from '../../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/guards/:chainId/:address : one guard, its events, Keel's key, its health history and a live read.
 * Reachable whenever its owner is outside the team list, so an owner can always find their guard (AGENTS.md C5).
 */
export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; address: string }> }) {
  const limit = checkWindow('guards:detail', clientKey(request.headers), 60, 60_000, 'Too many requests.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429, headers: NO_STORE })
  const key = GuardKey.safeParse(await params)
  if (!key.success) return NextResponse.json({ error: 'bad_request', detail: 'Use /api/v1/guards/56 or 97/<guard address>.' }, { status: 400, headers: NO_STORE })
  try {
    const d = await guardDetail(key.data.chainId, key.data.address)
    if (!d || !guardPageVisible(previewCookieFrom(request.headers), d.guard.owner, teamWallets())) return notFound()
    return NextResponse.json(d, { headers: NO_STORE })
  } catch { return unavailable() }
}
