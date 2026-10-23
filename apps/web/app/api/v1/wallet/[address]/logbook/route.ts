import { NextResponse } from 'next/server'
import { logbook } from '../../../../../../lib/workspace'
import type { ChainId } from '@marque/commerce'

export const dynamic = 'force-dynamic'
const H = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=20' }

/** GET /api/v1/wallet/{address}/logbook?cursor=&chains=56,97&format=csv (SPEC-WORKSPACE 1.3): every Marque event for a wallet, newest first. */
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: 'bad_request', detail: 'Send a 0x address.' }, { status: 400, headers: H })
  const u = new URL(req.url)
  const chains = (u.searchParams.get('chains') ?? '56,97').split(',').map(Number).filter((c): c is ChainId => c === 56 || c === 97)
  const csv = u.searchParams.get('format') === 'csv'
  try {
    const page = await logbook(address, { chains, cursor: u.searchParams.get('cursor'), limit: csv ? 200 : 50 })
    if (!csv) return NextResponse.json(page, { headers: H })
    // A dated statement: time, network, event, agent, job, amount, tx (SPEC-WORKSPACE 1.3).
    const q = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`
    const rows = ['time_utc,network,event,agent,job,amount,tx', ...page.entries.map((e) => [q(e.at), q(e.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'), q(e.title), q(e.agent), q(e.jobId), q(e.amount), q(e.tx)].join(','))]
    return new Response(rows.join('\n') + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="marque-logbook-${address.slice(0, 8)}.csv"`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[api/v1/wallet/logbook]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'unavailable', detail: 'The logbook could not be read just now.' }, { status: 503, headers: H })
  }
}
