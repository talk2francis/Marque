import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { readProfile } from '../../../../../lib/profile'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

/**
 * Everything Marque already knows about one address, as JSON.
 *
 * A projection of existing records — charters granted from it, hires done for
 * it, receipts, sealed calls — plus two chain facts (native balance, tx count).
 * No wallet, no account, no stored profile: pasting an address reaches this the
 * same way it reaches /api/v1/positions, which is the endpoint for the live
 * position read this deliberately does not duplicate.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: 'bad_address', detail: 'Not a valid BNB Smart Chain address.' },
      { status: 400 },
    )
  }

  try {
    const profile = await readProfile(address)
    return NextResponse.json({
      chainId: 56,
      provenance: 'FIRST-PARTY',
      readAt: new Date().toISOString(),
      ...profile,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'profile_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
