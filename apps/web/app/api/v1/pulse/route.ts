import { NextResponse } from 'next/server'
import { cachedProjection } from '@marque/db'
import { indexerStatus, campaignChainId } from '@marque/commerce'
import { tierFreshness } from '@marque/probe'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/pulse: the two header pills in one cheap read (DESIGN-SYSTEM.md
 * section 6, SiteHeader).
 *
 * network: the campaign chain's Quest Index. `ok` while the indexer is within
 * LAG_AMBER blocks of head, `lagging` beyond that, `down` when the RPC gives no
 * head or the gap outruns the public log window (the indexer could no longer
 * catch up by itself).
 *
 * system: `ok` when every first-party (T0) service was probed inside its
 * freshness window, `degraded` otherwise.
 */

// 270 blocks is about two minutes at the 0.45 s block time measured on BSC
// mainnet on 26 Sep 2026 (2,000 blocks in 900 s). The indexer normally tails at ~10.
const LAG_AMBER = 270

export interface Pulse {
  at: string
  network: { chainId: number; state: 'ok' | 'lagging' | 'down'; lagBlocks: number | null; cursorBlock: number | null; headBlock: number | null }
  system: { state: 'ok' | 'degraded'; firstPartyFresh: number | null; firstPartyServices: number | null }
}

async function compute(): Promise<Pulse> {
  const chainId = campaignChainId()
  const [idx, tiers] = await Promise.all([
    indexerStatus().catch(() => null),
    tierFreshness().catch(() => null),
  ])
  const mine = idx?.find((c) => c.chainId === chainId) ?? null
  const lag = mine?.lagBlocks ?? null
  const netState: Pulse['network']['state'] =
    !mine || mine.headBlock === null || lag === null ? 'down'
      : lag > mine.logWindowBlocks ? 'down'
      : lag > LAG_AMBER ? 'lagging'
      : 'ok'
  const t0 = tiers?.find((t) => t.tier === 'T0') ?? null
  const sysState: Pulse['system']['state'] = t0 && t0.fresh === t0.services && netState !== 'down' ? 'ok' : 'degraded'
  return {
    at: new Date().toISOString(),
    network: { chainId, state: netState, lagBlocks: lag, cursorBlock: mine?.cursorBlock ?? null, headBlock: mine?.headBlock ?? null },
    system: { state: sysState, firstPartyFresh: t0?.fresh ?? null, firstPartyServices: t0?.services ?? null },
  }
}

export async function GET() {
  try {
    const p = await cachedProjection('pulse:v1', compute, { freshMs: 20_000, timeoutMs: 8_000 })
    return NextResponse.json(p.value, { headers: { 'Cache-Control': 'public, max-age=15', 'Access-Control-Allow-Origin': '*' } })
  } catch (err) {
    console.error('[api/v1/pulse]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'pulse_unavailable', detail: 'Status could not be read just now.' }, { status: 503 })
  }
}
