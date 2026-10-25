import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { normalizeAnswer, questJob, TICK_SPACING, type ChainId, type Lens } from '@marque/commerce'
import { archiveClient, publicClient } from '@marque/chain'
import { venusReader, healthFactorOf, yieldReader, pancakeV3Reader } from '@marque/positions'
import { HF, GRID, YIELD } from '@marque/conformance'
import { jobManifest, type Manifest } from './manifest'

/**
 * Result Lens, server side (SPEC-WORKSPACE 2.1): the delivered answer read for its category, and
 * Marque's own checks of it. Checks are the Standard's assertions with the Standard's tolerances
 * (packages/conformance), applied to a paid answer: a recomputation from BNB Chain at the block the
 * answer names (archive reads), or a pure arithmetic assertion on the answer itself. Every check
 * says which it is. Nothing here is a judgement of the answer's quality.
 */

export type CheckState = 'match' | 'differs' | 'holds' | 'fails' | 'unavailable'
export interface LensCheck { key: string; label: string; state: CheckState; agent: string | null; marque: string | null; how: 'chain' | 'arithmetic'; detail: string | null }
export interface JobLens {
  lens: Lens | null
  checks: LensCheck[]
  checkedAtBlock: string | null
  summary: { checked: number; agreed: number }
  manifest: { matches: boolean | null; hash: string | null; raw: string | null; url: string | null; source: string | null } | null
  readable: boolean
}

const f = (v: number | null | undefined, dp = 3) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp }))
const ADDR = /0x[0-9a-fA-F]{40}/

async function hfChecks(l: Extract<Lens, { kind: 'health_factor' }>, task: string | null, block: bigint | null): Promise<LensCheck[]> {
  const account = (l.account && ADDR.test(l.account) ? l.account : task?.match(ADDR)?.[0]) as `0x${string}` | undefined
  if (!account || l.healthFactor === null) return []
  const client = (block ? archiveClient() : null) ?? publicClient()
  const read = await venusReader(account, { client, ...(block ? { blockNumber: block } : {}) }).catch(() => null)
  if (!read || !read.ok) return [{ key: 'hf', label: 'Health factor', state: 'unavailable', agent: f(l.healthFactor), marque: null, how: 'chain', detail: 'Venus could not be read at that block.' }]
  const d = read.data
  const hf = d.healthFactor
  const out: LensCheck[] = []
  const hfVal = hf === null ? null : hf.value
  out.push({ key: 'hf', label: 'Health factor', state: hfVal === null ? 'unavailable' : Math.abs(hfVal - l.healthFactor) <= HF.HEALTH_FACTOR.value! ? 'match' : 'differs', agent: f(l.healthFactor), marque: f(hfVal), how: 'chain', detail: `Venus Comptroller, tolerance ${HF.HEALTH_FACTOR.value}` })
  if (l.target && l.repayUsd !== null) {
    const w = d.weightedCollateralUsd.value, b = d.totalBorrowedUsd.value
    const after = healthFactorOf(w, Math.max(b - l.repayUsd, 0))
    // Repay nothing is the right answer when the account already sits at or above the target.
    const already = l.repayUsd === 0 && hfVal !== null && hfVal >= l.target
    out.push({ key: 'repay', label: `Repay to reach ${l.target}`, state: after === null ? 'unavailable' : already || Math.abs(after - l.target) <= HF.REPAY_AMOUNT.value! ? 'match' : 'differs', agent: l.repayUsd !== null ? `$${f(l.repayUsd, 2)}` : null, marque: already ? `nothing, HF ${f(hfVal)} is above it` : after === null ? null : `HF ${f(after)} after it`, how: 'chain', detail: 'The agent’s repay applied to the account Marque read, compared with the target' })
  }
  if (l.liquidationPriceUsd !== null && l.collateralSymbol) {
    const lp = d.markets.find((x) => x.underlyingSymbol === l.collateralSymbol)?.liquidationPriceUsd ?? null
    if (lp) out.push({ key: 'liq', label: `${l.collateralSymbol} liquidation price`, state: Math.abs(lp - l.liquidationPriceUsd) / lp * 100 <= HF.LIQUIDATION_PRICE_PCT.value! ? 'match' : 'differs', agent: `$${f(l.liquidationPriceUsd, 2)}`, marque: `$${f(lp, 2)}`, how: 'chain', detail: `tolerance ${HF.LIQUIDATION_PRICE_PCT.value}%` })
  }
  return out
}

async function rebChecks(l: Extract<Lens, { kind: 'rebalancing' }>, block: bigint | null): Promise<LensCheck[]> {
  const out: LensCheck[] = []
  for (const p of l.positions.slice(0, 6)) {
    const name = `#${p.id ?? '?'}`
    const spacing = p.tickSpacing ?? (p.feeTier !== null ? TICK_SPACING[p.feeTier] ?? null : null)
    if (p.proposed && spacing) {
      const ok = p.proposed.every((t) => t % spacing === 0)
      out.push({ key: `spacing-${p.id}`, label: `${name} proposed ticks on the pool's grid`, state: ok ? 'holds' : 'fails', agent: `${p.proposed[0]} to ${p.proposed[1]}`, marque: `multiples of ${spacing}`, how: 'arithmetic', detail: 'PancakeSwap V3 only accepts ticks that are multiples of the tick spacing' })
    }
    if (p.range && p.current !== null && p.inRange !== null) {
      const inside = p.current >= p.range[0] && p.current < p.range[1]
      out.push({ key: `inrange-${p.id}`, label: `${name} in range`, state: inside === p.inRange ? 'holds' : 'fails', agent: p.inRange ? 'in range' : 'out of range', marque: inside ? 'tick inside the range' : 'tick outside the range', how: 'arithmetic', detail: `tick ${p.current} against ${p.range[0]} to ${p.range[1]}` })
    }
    if (p.proposed && p.current !== null) {
      const covers = p.current >= p.proposed[0] && p.current < p.proposed[1]
      out.push({ key: `covers-${p.id}`, label: `${name} new range covers the price`, state: covers ? 'holds' : 'fails', agent: `${p.proposed[0]} to ${p.proposed[1]}`, marque: `price tick ${p.current}`, how: 'arithmetic', detail: null })
    }
  }
  // The current tick against the pool at the answer's block, for a single named position with an owner.
  const one = l.positions[0]
  if (l.positions.length === 1 && one?.id && one.current !== null && l.owner && ADDR.test(l.owner)) {
    const client = (block ? archiveClient() : null) ?? publicClient()
    const read = await pancakeV3Reader(l.owner as `0x${string}`, { client, tokenId: BigInt(one.id), ...(block ? { blockNumber: block } : {}) }).catch(() => null)
    const pos = read && read.ok ? read.data.positions.find((x) => String(x.tokenId) === one.id) : null
    const tick = pos ? pos.tickCurrent : null
    if (tick !== null) out.unshift({ key: 'tick', label: `#${one.id} current tick`, state: tick === one.current ? 'match' : 'differs', agent: String(one.current), marque: String(tick), how: 'chain', detail: 'pool slot0, exact' })
  }
  return out
}

function gridChecks(l: Extract<Lens, { kind: 'grid' }>): LensCheck[] {
  const out: LensCheck[] = []
  const lv = l.levels
  if (lv.length >= 3) {
    const geometric = (l.spacing ?? '').toLowerCase().startsWith('geo')
    const steps = lv.slice(1).map((x, i) => (geometric ? x.price / lv[i]!.price : x.price - lv[i]!.price))
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length
    const worst = Math.max(...steps.map((s) => Math.abs(s - mean) / Math.abs(mean) * 100))
    out.push({ key: 'spacing', label: `${geometric ? 'Geometric' : 'Arithmetic'} spacing is even`, state: worst <= GRID.SPACING_PCT.value! ? 'holds' : 'fails', agent: `${lv.length} levels`, marque: `largest deviation ${f(worst, 2)}%`, how: 'arithmetic', detail: `tolerance ${GRID.SPACING_PCT.value}%` })
  }
  if (lv.length && l.lower !== null && l.upper !== null) {
    const inside = lv.every((x) => x.price >= l.lower! * 0.9999 && x.price <= l.upper! * 1.0001)
    out.push({ key: 'bounds', label: 'Every level inside the bounds', state: inside ? 'holds' : 'fails', agent: `${f(l.lower, 2)} to ${f(l.upper, 2)}`, marque: `${f(lv[0]!.price, 2)} to ${f(lv[lv.length - 1]!.price, 2)}`, how: 'arithmetic', detail: null })
  }
  const alloc = lv.reduce((s, x) => s + (x.allocationUsd ?? 0), 0)
  if (alloc > 0 && l.capitalUsd !== null) out.push({ key: 'alloc', label: 'Allocations fit the capital', state: alloc <= l.capitalUsd * (1 + GRID.ALLOCATION_OVER_CAPITAL.value! / 100) ? 'holds' : 'fails', agent: `$${f(alloc, 2)} allocated`, marque: `$${f(l.capitalUsd, 2)} capital`, how: 'arithmetic', detail: null })
  if (l.stop !== null && lv.length) out.push({ key: 'stop', label: 'No level at or below the stop', state: lv.every((x) => x.price > l.stop!) ? 'holds' : 'fails', agent: `stop ${f(l.stop, 2)}`, marque: `lowest level ${f(lv[0]!.price, 2)}`, how: 'arithmetic', detail: null })
  return out
}

async function yieldChecks(l: Extract<Lens, { kind: 'yield' }>, block: bigint | null): Promise<LensCheck[]> {
  const out: LensCheck[] = []
  if (l.netAprPct !== null && l.grossAprPct !== null) out.push({ key: 'net', label: 'Net APR is not above gross', state: l.netAprPct <= l.grossAprPct + 1e-9 ? 'holds' : 'fails', agent: `${f(l.netAprPct, 2)}% net`, marque: `${f(l.grossAprPct, 2)}% gross`, how: 'arithmetic', detail: 'switching costs can only lower the return' })
  if (l.sources.length) out.push({ key: 'sources', label: 'Every APR names its source', state: l.sources.every((s) => s.label !== 'source not stated') ? 'holds' : 'fails', agent: `${l.sources.length} sources`, marque: null, how: 'arithmetic', detail: null })
  if ((l.venue ?? '').toLowerCase().includes('venus') && l.grossAprPct !== null) {
    const asset = (l.asset ?? l.sources.map((s) => s.label.match(/\bv?(USDT|USDC|FDUSD|DAI|TUSD)\b/i)?.[1]).find(Boolean) ?? 'USDT').toUpperCase().replace(/^V/, '')
    const client = (block ? archiveClient() : null) ?? publicClient()
    const read = await yieldReader({ client, ...(block ? { blockNumber: block } : {}) }).catch(() => null)
    const venue = read && read.ok ? read.data.venues.find((v) => v.underlyingSymbol.toUpperCase() === asset) : null
    const apr = venue ? venue.grossApr.value : null
    if (apr !== null) out.push({ key: 'apr', label: `Venus ${asset} supply APR`, state: Math.abs(apr - l.grossAprPct) * 100 <= YIELD.NET_APR_BPS.value! ? 'match' : 'differs', agent: `${f(l.grossAprPct, 3)}%`, marque: `${f(apr, 3)}%`, how: 'chain', detail: `tolerance ${YIELD.NET_APR_BPS.value} bps` })
  }
  return out
}

async function build(chainId: ChainId, jobId: string): Promise<JobLens> {
  const job = await questJob(chainId, jobId).catch(() => null)
  const url = job?.deliverable?.url ?? null
  const manifest: Manifest | null = await jobManifest(chainId, jobId, job as never)
  const source = (job?.deliverable as { source?: string | null } | undefined)?.source ?? null
  if (!manifest) return { lens: null, checks: [], checkedAtBlock: null, summary: { checked: 0, agreed: 0 }, manifest: url ? { matches: null, hash: null, raw: null, url, source } : null, readable: false }
  // A file found from the chain hash (no published URL) still links to where it was read.
  void source
  let content: unknown = manifest.content
  if (!content) { try { content = JSON.parse(manifest.raw) } catch { content = null } }
  const category = job?.agent?.category ?? null
  const lens = normalizeAnswer(category, content)
  // The buyer's words live in the hire intent's signed description, as its `task`.
  const [hi] = (await db().execute(sql`select i.description from commerce_job j join hire_intent i on i.id = j.intent_id where j.chain_id = ${chainId} and j.job_id = ${jobId} limit 1`).catch(() => [])) as unknown as Array<{ description: string | null }>
  const task = (() => { const d = hi?.description ?? (job?.intent as { description?: string } | null)?.description; if (!d) return null; try { return String((JSON.parse(d) as { task?: string }).task ?? '') } catch { return d } })()
  const block = lens.meta.block && /^\d{6,12}$/.test(lens.meta.block) ? BigInt(lens.meta.block) : null
  // The checks read BSC mainnet state: practice jobs ask about mainnet accounts and pools too.
  const checks = await (lens.kind === 'health_factor' ? hfChecks(lens, task, block)
    : lens.kind === 'rebalancing' ? rebChecks(lens, block)
      : lens.kind === 'grid' ? Promise.resolve(gridChecks(lens))
        : lens.kind === 'yield' ? yieldChecks(lens, block) : Promise.resolve([])).catch(() => [] as LensCheck[])
  const decided = checks.filter((c) => c.state !== 'unavailable')
  return {
    lens, checks, checkedAtBlock: block ? block.toString() : null,
    summary: { checked: decided.length, agreed: decided.filter((c) => c.state === 'match' || c.state === 'holds').length },
    manifest: { matches: manifest.matches, hash: manifest.hash, raw: manifest.pretty || manifest.raw, url, source },
    readable: lens.kind !== 'generic',
  }
}

/** Cached 10 minutes per job: a delivered answer does not change; checks are pinned to its block. */
export function jobLens(chainId: ChainId, jobId: string) {
  return cachedProjection(`lens:v4:${chainId}:${jobId}`, () => build(chainId, jobId), { freshMs: 10 * 60_000, timeoutMs: 20_000 })
}
