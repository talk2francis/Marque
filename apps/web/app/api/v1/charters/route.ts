import { NextResponse } from 'next/server'
import { POLICY_PREVIEW_NOTICE } from '@marque/mandates/availability'
import { listCharters, CHARTER_CHAIN_ID } from '../../../../lib/charters'

export const dynamic = 'force-dynamic'

export async function GET() {
  const charters = await listCharters()
  return NextResponse.json({ charters, chainId: CHARTER_CHAIN_ID })
}

/** Existing records/revocation remain; no new operator-signed grant is issued. */
export async function POST() {
  return NextResponse.json({ error: POLICY_PREVIEW_NOTICE, code: 'authority_unverified',
    mode: 'READ_ONLY_POLICY_PREVIEW', previewUrl: '/app/charter' }, { status: 409 })
}
