import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { readSession, readWalletProfile } from '../../../../../../lib/wallet-profile'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/me/profile/{address}: the name and portrait an address chose to show (or its defaults). With the owner's
 * session token, also its preferences and a private profile.
 */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!isAddress(address)) return NextResponse.json({ error: 'bad_address', detail: 'Not a valid address.' }, { status: 400 })
  const session = readSession(request.headers.get('authorization'))
  try {
    const profile = await readWalletProfile(address, session?.address ?? null)
    return NextResponse.json({ profile, signedIn: session?.address === address.toLowerCase() }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'unavailable', detail: 'The profile could not be read just now.' }, { status: 503 })
  }
}
