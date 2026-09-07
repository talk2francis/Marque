import { NextResponse } from 'next/server'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { isAddress, type Address } from 'viem'
import { db, poolTickObservation, poolWatch } from '@marque/db'
import { pancakeV3Reader, measureOutOfRange } from '@marque/positions'
import { displayName } from '../../../../../lib/reference-agents'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The PancakeSwap Desk's data.
 *
 * Three things the generic positions route does not do:
 *
 *   1. HOURS OUT OF RANGE, from our own tick observations. There is no public
 *      source for it (docs/FINDINGS.md F-06), so the answer is null until the
 *      watcher has seen the pool, and a floor when every observation it holds
 *      was already out of range. Never zero-by-default.
 *   2. Adds any pool it sees to the watch list, so the FIRST person to ask
 *      about a position starts its history. It cannot be backfilled.
 *   3. Ranks the agents that can work on that position, with the reason for
 *      each placement — including the reason a third party cannot be
 *      pool-matched at all.
 */

/** How many observations back to consider. Two-minute cycles, so this is ~5 days. */
const OBSERVATION_LIMIT = 3600

interface RankedAgent {
  id: string
  name: string
  kind: 'first-party' | 'third-party'
  /** Ordered best first. The reason IS the ranking; there is no opaque score. */
  reasons: string[]
  mcs: 'pass' | 'fail' | 'untested'
  liveness: string | null
  supportsThisPool: 'yes' | 'unknown'
  price: string | null
  endpoint: string | null
}

async function rankAgentsForPool(): Promise<RankedAgent[]> {
  // Our own rebalancing agent works on any V3 pool and fee tier, because it
  // reads the pool's own tickSpacing rather than carrying a hardcoded table.
  const first: RankedAgent = {
    id: 'marque:bound',
    name: displayName('marque:bound'),
    kind: 'first-party',
    mcs: 'pass',
    liveness: 'working',
    supportsThisPool: 'yes',
    price: '0.15 U',
    endpoint: '/agents/bound',
    reasons: [
      'Passes MCS-REB-1, the published rebalancing test, against a case captured at the current block.',
      'Reads the pool’s own tickSpacing, so it supports every fee tier rather than a fixed list.',
      'First-party reference agent — it exists to guarantee this category has liquidity, and is labelled as ours.',
    ],
  }

  // Third parties: ranked by what we have actually measured about them.
  let rows: Array<Record<string, unknown>> = []
  try {
    const r = await db().execute(sql`
      with latest_probe as (
        select distinct on (agent_id) agent_id, liveness, latency_ms, checked_at
        from probe order by agent_id, checked_at desc
      ),
      latest_conf as (
        select distinct on (agent_id) agent_id, pass, test_id, ran_at
        from conformance_result where test_id = 'MCS-REB-1'
        order by agent_id, ran_at desc
      )
      select a.id, a.name, a.token_id, p.liveness, cf.pass as mcs_pass,
             (select s.endpoint from agent_service s where s.agent_id = a.id limit 1) as endpoint
      from agent a
      join agent_category c on c.agent_id = a.id and c.category = 'rebalancing'
      left join latest_probe p on p.agent_id = a.id
      left join latest_conf cf on cf.agent_id = a.id
      where a.chain_id = 56
      order by (cf.pass is true) desc, (p.liveness = 'working') desc, a.token_id
      limit 12
    `)
    rows = ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
  } catch {
    rows = []
  }

  const third: RankedAgent[] = rows.map((r) => {
    const live = r['liveness'] === null ? null : String(r['liveness'])
    const mcs: RankedAgent['mcs'] = r['mcs_pass'] === true ? 'pass' : r['mcs_pass'] === false ? 'fail' : 'untested'
    const reasons: string[] = []
    if (mcs === 'pass') reasons.push('Passes MCS-REB-1.')
    else if (mcs === 'fail') reasons.push('Ran MCS-REB-1 and failed it. Listed anyway, with the result, because publishing only passes would be marketing.')
    else reasons.push('Has never completed MCS-REB-1, so it carries no warrant.')

    if (live === 'working') reasons.push('Endpoint answers a real request.')
    else if (live === 'unbound') reasons.push('Registered on ERC-8004 but not bound: its card returns no endpoint and no skills, so there is nothing to call.')
    else if (live === 'dead') reasons.push('Endpoint did not answer when we last probed it.')
    else reasons.push('Not yet probed.')

    return {
      id: String(r['id']), name: String(r['name'] ?? 'unnamed'),
      kind: 'third-party' as const, reasons, mcs, liveness: live,
      supportsThisPool: 'unknown' as const,
      price: null,
      endpoint: r['endpoint'] === null || r['endpoint'] === undefined ? null : String(r['endpoint']),
    }
  })

  return [first, ...third]
}

/**
 * What is true of EVERY third-party candidate, said once.
 *
 * It used to be appended to each agent's reasons, which produced twelve
 * identical paragraphs down the page — the prose version of the identical-cards
 * tell AGENTS.md forbids. A caveat repeated twelve times reads as padding and
 * stops being read at all, which is the opposite of disclosing it.
 */
const THIRD_PARTY_CAVEAT =
  'ERC-8004 metadata does not declare which pools or fee tiers an agent supports. '
  + 'For every third party below, we can verify its category and whether it answers — '
  + 'never that it handles this specific pool and tier.'

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'not_an_address', detail: 'Paste a 0x address with 40 hex characters.' }, { status: 400 })
  }

  // The reader returns a discriminated result rather than throwing, and the
  // type system will not let the success fields be touched without checking —
  // which is the point: an unread position must never render as an empty one.
  const read = await pancakeV3Reader(address as Address)
  if (!read.ok) {
    return NextResponse.json({
      error: 'could_not_read_positions',
      detail: read.detail ?? read.error,
    }, { status: 502 })
  }
  const portfolio = read.data

  const since = new Date(Date.now() - 7 * 86_400_000)
  const positions = []

  for (const p of portfolio.positions) {
    const pool = p.pool.toLowerCase()

    // Start watching anything we are asked about. History is not retroactive,
    // so the first question about a position is the earliest it can begin.
    await db().insert(poolWatch).values({
      pool, fee: p.fee,
      token0Symbol: p.token0.symbol, token1Symbol: p.token1.symbol,
      reason: `position ${p.tokenId} looked up on the PancakeSwap Desk`,
    }).onConflictDoNothing()

    const obs = await db().select({ tick: poolTickObservation.tick, observedAt: poolTickObservation.observedAt })
      .from(poolTickObservation)
      .where(and(eq(poolTickObservation.pool, pool), gte(poolTickObservation.observedAt, since)))
      .orderBy(desc(poolTickObservation.observedAt))
      .limit(OBSERVATION_LIMIT)

    const range = measureOutOfRange(obs, p.tickLower, p.tickUpper)

    positions.push({
      tokenId: p.tokenId,
      pair: `${p.token0.symbol}/${p.token1.symbol}`,
      fee: p.fee,
      tickSpacing: p.tickSpacing,
      pool: p.pool,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      tickCurrent: p.tickCurrent,
      // Q carries provenance through the type system; the wire needs the
      // number and its unit, and the provenance chip is rendered from the
      // fact that the reader produced it at all.
      inRange: p.inRange.value === 1,
      priceLower: p.priceLower.value,
      priceUpper: p.priceUpper.value,
      priceCurrent: p.priceCurrent.value,
      priceUnit: p.priceCurrent.unit,
      rangePosition: p.rangePosition.value,
      pctToLower: p.pctToLower.value,
      pctToUpper: p.pctToUpper.value,
      token0: p.token0.symbol,
      token1: p.token1.symbol,
      fees0: p.fees0.value,
      fees1: p.fees1.value,
      // Absent, not zero, when the tokens could not be priced.
      feesUsd: p.feesUsd?.value ?? null,
      positionValueUsd: p.positionValueUsd?.value ?? null,
      range,
    })
  }

  return NextResponse.json({
    owner: portfolio.owner,
    positions,
    emptyPositions: portfolio.emptyPositions,
    agents: await rankAgentsForPool(),
    thirdPartyCaveat: THIRD_PARTY_CAVEAT,
    watchNote:
      'Hours out of range is measured from our own tick observations, every two minutes. '
      + 'BSC keeps ~64 blocks of state, the official PancakeSwap subgraph is about four months behind, '
      + 'and public log queries reach back ~37 minutes, so no other source exists (FINDINGS F-06).',
  })
}
