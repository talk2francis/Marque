import { parseAbi, type PublicClient } from 'viem'
import { archiveClient } from '@marque/chain'
import { yieldReader } from '@marque/positions'
import { RYIELD } from '../tolerances.js'
import { diffAbsolute, diffAssert, num, str, type FieldDiff, type TestCase } from '../types.js'

/**
 * MCS-RYIELD-1 — Realised yield.
 *
 * MCS-YIELD-1 grades a forward route at a size from the rates venues quote now. This test grades the other half of
 * the question: what each venue actually PAID between two blocks, from the growth of its on-chain exchange rate,
 * annualised over the true time between the blocks (simple, not compounded):
 *
 *     realisedApr = (rate[to] / rate[from] - 1) / years(timestamp[to] - timestamp[from]) × 100
 *
 * Facts only. The window is supplied by the case; every figure is reproduced from archived reads; the
 * recommendation is checked for agreement with the agent's own ranking, never for wisdom.
 */

export interface RyieldPolicy {
  asset: string
  amount: number
  /** The window's nominal length; the case pins the exact blocks. */
  days: number
  statement: string
}

export interface RyieldGroundTruth {
  asset: string
  amount: number
  fromBlock: string
  toBlock: string
  fromTime: string
  toTime: string
  /** Every Venus supply market for the asset whose rate was readable at both blocks. */
  venues: Array<{ symbol: string; market: string; realisedAprPct: number }>
}

/** Nominal block time used to place the start of the window; the true length comes from the two timestamps. */
const BLOCK_SECONDS = 0.45
const VTOKEN = parseAbi(['function exchangeRateStored() view returns (uint256)'])

export async function ryieldGroundTruth(testCase: TestCase<RyieldPolicy>, opts: { client?: PublicClient } = {}): Promise<RyieldGroundTruth> {
  const archive = opts.client ?? archiveClient()
  if (!archive) throw new Error('MCS-RYIELD-1 ground truth needs an archive endpoint (BSC_ARCHIVE_RPC_URL)')
  const p = testCase.policy
  // Ten blocks behind the case block, so an archive that serves the newest blocks a moment late still has both ends.
  const toBlock = testCase.blockNumber - 10n
  const fromBlock = toBlock - BigInt(Math.round((p.days * 86_400) / BLOCK_SECONDS))
  const [bTo, bFrom] = await Promise.all([archive.getBlock({ blockNumber: toBlock }), archive.getBlock({ blockNumber: fromBlock })])
  const years = Number(bTo.timestamp - bFrom.timestamp) / (365 * 86_400)
  const read = await yieldReader({ client: archive, blockNumber: toBlock, maxMarkets: 40 })
  if (!read.ok) throw new Error(`MCS-RYIELD-1 ground truth unavailable: ${read.error}`)
  const matching = read.data.venues.filter((v) => v.underlyingSymbol.toUpperCase() === p.asset.toUpperCase())
  const venues: RyieldGroundTruth['venues'] = []
  for (const v of matching) {
    try {
      const [now, before] = await Promise.all([
        archive.readContract({ address: v.market as `0x${string}`, abi: VTOKEN, functionName: 'exchangeRateStored', blockNumber: toBlock }),
        archive.readContract({ address: v.market as `0x${string}`, abi: VTOKEN, functionName: 'exchangeRateStored', blockNumber: fromBlock }),
      ])
      venues.push({ symbol: v.symbol, market: v.market, realisedAprPct: Number(((Number(now) / Number(before) - 1) / years * 100).toFixed(6)) })
    } catch { /* a market unreadable at the window start is left out of the truth, as an agent may leave it out of its answer */ }
  }
  if (!venues.length) throw new Error(`MCS-RYIELD-1: no ${p.asset} market readable at both blocks`)
  return {
    asset: p.asset, amount: p.amount, fromBlock: fromBlock.toString(), toBlock: toBlock.toString(),
    fromTime: new Date(Number(bFrom.timestamp) * 1000).toISOString(), toTime: new Date(Number(bTo.timestamp) * 1000).toISOString(),
    venues,
  }
}

export function ryieldPrompt(testCase: TestCase<RyieldPolicy>, gt: RyieldGroundTruth): string {
  return [
    `Where did ${gt.amount} ${gt.asset} earn the most on BNB Chain between block ${gt.fromBlock} and block ${gt.toBlock}, after switching costs? Measure realised yield, from on-chain exchange-rate growth, over exactly those blocks.`,
    ``,
    `POLICY YOU MUST FOLLOW: ${testCase.policy.statement}`,
    ``,
    `Return strict JSON with these fields:`,
    `{`,
    `  "recommend": <boolean>,`,
    `  "venue": <string or null, the recommended venue>,`,
    `  "window": { "fromBlock": "${gt.fromBlock}", "toBlock": "${gt.toBlock}" },`,
    `  "ranking": [ { "venue": <string naming the market, e.g. "Venus vUSDT">, "realisedAprPct": <number>, "netRealisedAprPct": <number>, "source": <string naming the on-chain reads> }, ... ]`,
    `}`,
    ``,
    `realisedAprPct is simple annualised growth of the venue's exchange rate between the two blocks, over the true time between their timestamps. No prose. JSON only.`,
  ].join('\n')
}

/** The ground-truth venue a ranking row names (by its market symbol, e.g. vUSDT). */
function matchVenue(gt: RyieldGroundTruth, name: string): RyieldGroundTruth['venues'][number] | null {
  const n = name.toLowerCase()
  return gt.venues.find((v) => new RegExp(`(^|[^a-z0-9])${v.symbol.toLowerCase()}([^a-z0-9]|$)`).test(n)) ?? null
}

export function gradeRyield(gt: RyieldGroundTruth, raw: unknown): FieldDiff[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const diffs: FieldDiff[] = []
  const w = (r['window'] ?? {}) as Record<string, unknown>
  const from = str(w['fromBlock']) ?? (num(w['fromBlock']) !== undefined ? String(num(w['fromBlock'])) : undefined)
  const to = str(w['toBlock']) ?? (num(w['toBlock']) !== undefined ? String(num(w['toBlock'])) : undefined)
  diffs.push(diffAssert(RYIELD.WINDOW_EXACT.id, from === gt.fromBlock && to === gt.toBlock,
    `blocks ${gt.fromBlock} to ${gt.toBlock}`, from || to ? `blocks ${from ?? '?'} to ${to ?? '?'}` : '(no window stated)',
    'The answer measured a different window than the one the case supplied, so its figures answer a different question.'))

  const ranking = (Array.isArray(r['ranking']) ? r['ranking'] : []) as Array<Record<string, unknown>>
  const rows = ranking.map((row) => ({ name: str(row['venue']) ?? '', realised: num(row['realisedAprPct']), net: num(row['netRealisedAprPct']), source: str(row['source']) }))

  // Every row Marque can reproduce is checked; a row naming a market Marque did not measure is reported, not passed.
  let matched = 0
  for (const row of rows) {
    const v = matchVenue(gt, row.name)
    if (!v) continue
    matched++
    diffs.push(diffAbsolute(RYIELD.REALISED_APR_BPS.id, v.realisedAprPct, row.realised, (RYIELD.REALISED_APR_BPS.value as number) / 100, 'percentage points', `Realised APR of ${row.name}`))
  }
  if (!matched) {
    diffs.push(diffAssert(RYIELD.REALISED_APR_BPS.id, false, `a realised APR for at least one of ${gt.venues.map((v) => v.symbol).join(', ')}`, rows.length ? `${rows.length} rows, none naming a measured market` : '(no ranking)', 'No realised figure in the answer could be checked against the chain.'))
  }

  diffs.push(diffAssert(RYIELD.NET_NOT_ABOVE_GROSS.id, rows.length > 0 && rows.every((x) => x.net !== undefined && x.realised !== undefined && x.net <= x.realised + 1e-9),
    'net realised APR at or below realised APR on every row', rows.length ? `${rows.filter((x) => x.net !== undefined && x.realised !== undefined && x.net <= x.realised + 1e-9).length} of ${rows.length} rows` : '(no ranking)',
    'A row reports a net figure above its gross realised figure, or omits one of them.'))

  diffs.push(diffAssert(RYIELD.SOURCED.id, rows.length > 0 && rows.every((x) => Boolean(x.source && x.source.trim())),
    'every row names its on-chain source', rows.length ? `${rows.filter((x) => x.source && x.source.trim()).length} of ${rows.length} sourced` : '(no ranking)',
    'A realised figure without its source cannot be checked by the buyer.'))

  const declared = r['recommend']
  const explicit = declared === true || declared === false
  const best = rows.filter((x) => x.net !== undefined).sort((a, b) => (b.net as number) - (a.net as number))[0]
  const venue = str(r['venue'])
  const consistent = !explicit ? false
    : declared === true ? Boolean(best && venue && best.name.toLowerCase() === venue.toLowerCase())
      : !best || (best.net as number) <= 0
  diffs.push(diffAssert(RYIELD.DECISION_CONSISTENT.id, consistent,
    declared === false ? 'a decline only when no ranked venue pays a positive net realised APR' : 'an explicit recommend, naming the top venue of its own ranking by net realised APR',
    !explicit ? '(recommend not stated)' : declared ? `recommended ${venue ?? 'nothing named'}; top of its ranking is ${best?.name ?? 'none'}` : `declined; best net ${best?.net ?? 'none'}`,
    'The recommendation does not agree with the numbers in the answer itself.'))
  return diffs
}
