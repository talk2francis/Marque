import { NextResponse } from 'next/server'
import { QUEST_ADDRESS } from '../../../../../../lib/quest-api'
import { sealAddress } from '../../../../../../lib/share-token'

export const dynamic = 'force-dynamic'

/** GET /api/v1/quest/{address}/share: the progress link that does not show the address (/quest/s/{token}). */
export function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return params.then(({ address }) => {
    if (!QUEST_ADDRESS.test(address)) return NextResponse.json({ error: 'bad_request', detail: 'Send a 0x address of 40 hex characters.' }, { status: 400 })
    const token = sealAddress(address)
    if (!token) return NextResponse.json({ error: 'unavailable', detail: 'Private links are not available just now.' }, { status: 503 })
    return NextResponse.json({ token, url: `https://marque.trade/quest/s/${token}` }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  })
}
