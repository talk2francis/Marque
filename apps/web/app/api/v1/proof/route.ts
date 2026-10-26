import { NextResponse } from 'next/server'
import { proofCsv, proofProjection } from '../../../../lib/proof'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/proof: every job hired through Marque on BSC mainnet (56) and testnet (97), one row each, with who paid
 * (outside | team | operator), what happened, the chain checks, terms met and any action taken, plus totals per network
 * and funder class. `stats` repeats /api/v1/phase2/stats's counted figures from the same read. `?format=csv` downloads.
 */
export async function GET(req: Request) {
  try {
    const p = await proofProjection()
    if (new URL(req.url).searchParams.get('format') === 'csv') {
      return new NextResponse(proofCsv(p.value.rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="marque-proof-${p.value.measuredAt.slice(0, 10)}.csv"`, 'cache-control': 'no-store' } })
    }
    return NextResponse.json({
      ...p.value, provenance: 'ONCHAIN',
      note: "Outside means not in Marque's published team list (config/team-wallets.json). It does not prove the buyer is unrelated.",
    }, { headers: { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' } })
  } catch {
    return NextResponse.json({ error: 'unavailable', detail: 'The proof table could not be read just now. Try again in a minute.' }, { status: 503 })
  }
}
