import { NextResponse } from 'next/server'
import { readLedger, readSeals } from '../../../../lib/ledger'
import { readLedgerOutcomeReferences } from '../../../../lib/ledger-outcomes'

export const dynamic = 'force-dynamic'

/** The whole Ledger, including the benchmarks that are not finished. */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get('format') === 'outcomes') {
    try {
      return NextResponse.json(await readLedgerOutcomeReferences(), { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return NextResponse.json({ error: 'ledger_outcomes_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
  }
  const [benchmarks, seals] = await Promise.all([readLedger(), readSeals()])
  return NextResponse.json({ benchmarks, seals })
}
