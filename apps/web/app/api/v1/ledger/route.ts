import { NextResponse } from 'next/server'
import { readLedger, readSeals } from '../../../../lib/ledger'

export const dynamic = 'force-dynamic'

/** The whole Ledger, including the benchmarks that are not finished. */
export async function GET() {
  const [benchmarks, seals] = await Promise.all([readLedger(), readSeals()])
  return NextResponse.json({ benchmarks, seals })
}
