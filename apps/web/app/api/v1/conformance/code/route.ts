import { NextResponse } from 'next/server'
import { MCS_CODE_ANCHOR, MCS_VERSION, MCS_TOLERANCE_REVISION } from '@marque/conformance'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    version: 1, testVersion: MCS_VERSION, toleranceRevision: MCS_TOLERANCE_REVISION,
    code: MCS_CODE_ANCHOR,
    limitations: ['A content-addressed source manifest, not an onchain anchor or issuer signature.', 'Compare with the source checkout and lockfile using scripts/generate-mcs-code-anchor.mjs --check.'],
  }, { headers: { 'Cache-Control': 'no-store' } })
}
