import { NextResponse, type NextRequest } from 'next/server'
import { readRegistration } from '../../../../../lib/registration-edit'

export const dynamic = 'force-dynamic'

/** GET ?chainId=&tokenId=: an agent's current ERC-8004 registration and owner, read from chain (public data). */
export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get('chainId'))
  const tokenId = req.nextUrl.searchParams.get('tokenId') ?? ''
  try {
    const r = await readRegistration(chainId, tokenId)
    if (!r) return NextResponse.json({ error: 'not_found', detail: 'That registration could not be read.' }, { status: 404 })
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'unavailable', detail: 'The registry could not be read just now.' }, { status: 503 })
  }
}
