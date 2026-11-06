import 'server-only'
import { cachedProjection } from '@marque/db'
import { publicClient } from '@marque/chain'
import { normalizeAnswer, validateTask, type ChainId } from '@marque/commerce'
import { venusReader, pancakeV3Reader, yieldReader, priceInUsdt, netAprAtSize, type YieldVenue } from '@marque/positions'
import { erc20Abi } from 'viem'
import { jobManifest } from './manifest'
import { recheckOriginalAnswer } from './recheck-original'
import { onchainJobTask } from './job-description'
import { fieldsFromText } from './task-parse'
import { compareRecheck, gridAssetForRecheck, validRecheckBlocks, type FreshReading } from './recheck-compare'
import { RecheckResult } from './recheck-schema'
import { boundedWork } from './bounded-work'
import { recheckRecord } from './recheck-record'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
// Official PancakeSwap token list, read 6 Nov 2026. Addresses are used only for the new read-only comparison.
// https://github.com/pancakeswap/token-list/blob/main/lists/pancakeswap-extended.json
const GRID_ASSETS = {
  BNB: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB' },
  BTCB: { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB' },
  ETH: { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH' },
  CAKE: { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE' },
} as const
const active = new Map<string, Promise<unknown>>()
const freshRead = boundedWork(2, 8, 2500)

async function build(chainId: ChainId, jobId: string) {
  const base = { version: 1 as const, chainId, jobId, observationChainId: 56 as const, observedAt: new Date().toISOString(), category: null as string | null, answerBlock: null as string | null, currentBlock: null as string | null, answerAt: null as string | null, askAgain: null as string | null }
  const empty = (reason: string, state: 'nothing_to_recheck' | 'unsupported' = 'nothing_to_recheck') => RecheckResult.parse({ ...base, state, reason, rows: [] })
  // This is deliberately a SELECT. jobLens/replayLens are not invoked and lens_result is never updated or inserted.
  const kept = await recheckRecord(chainId, jobId)
  if (kept?.category === 'security') { base.category = 'security'; return empty('Security reviews have no live recheck. Read the original findings and their sources.', 'unsupported') }
  if (!kept?.block || !Array.isArray(kept.checks) || !kept.checks.length) return empty('No original checks pinned to a block are recorded for this job.')
  base.answerBlock = kept.block
  const c = publicClient()
  const job = kept.job
  if (!job) return empty('This indexed job could not be read.')
  base.category = kept.category
  if (base.category === 'security') return empty('Security reviews have no live recheck. Read the original findings and their sources.', 'unsupported')
  const [manifest, headRead, task] = await Promise.all([
    recheckOriginalAnswer(`${chainId}:${jobId}:${job.provider ?? ''}:${job.deliverable?.hash ?? ''}`, job.deliverable?.hash ?? null, () => jobManifest(chainId, jobId, job)),
    c.getBlockNumber().then(block => ({ block, at: new Date().toISOString() })), onchainJobTask(chainId, jobId),
  ])
  const head = headRead.block
  if (!manifest || manifest.matches !== true) return empty('The original answer could not be read with a matching on-chain content commitment.')
  const lens = normalizeAnswer(base.category, manifest.content ?? (() => { try { return JSON.parse(manifest.raw) } catch { return null } })())
  if (lens.kind === 'generic' || lens.kind === 'security') return empty('This answer has no supported live comparison.', 'unsupported')
  base.answerAt = lens.meta.readAt
  base.currentBlock = head.toString()
  if (!validRecheckBlocks(kept.block, lens.meta.block, head.toString())) return empty('The original and current block bindings are inconsistent or the current read is older. No comparison is shown.')
  const parsed = task?.task ? validateTask(lens.kind, fieldsFromText(lens.kind, task.task)) : null
  const resume = parsed?.ok ? encodeURIComponent(JSON.stringify(Object.fromEntries(Object.entries(parsed.fields).filter(([key]) => key !== 'block')))) : null
  base.askAgain = `/tender?category=${lens.kind}${resume && resume.length < 380 ? `&resume=${resume}` : ''}`
  let fresh: FreshReading
  if (lens.kind === 'health_factor') {
    const account = lens.account && ADDRESS.test(lens.account) ? lens.account : task?.task.match(/0x[0-9a-fA-F]{40}/)?.[0]
    if (!account) return empty('The original answer and task do not identify an account.')
    const r = await venusReader(account as `0x${string}`, { client: c, blockNumber: head })
    if (!r.ok) throw new Error('chain_unavailable')
    fresh = { kind: lens.kind, healthFactor: r.data.healthFactor?.value ?? null, weightedCollateralUsd: r.data.weightedCollateralUsd.value, totalBorrowedUsd: r.data.totalBorrowedUsd.value, liquidation: Object.fromEntries(r.data.markets.map(m => [m.underlyingSymbol.toUpperCase(), m.liquidationPriceUsd])) }
  } else if (lens.kind === 'rebalancing') {
    if (!lens.owner || !ADDRESS.test(lens.owner)) return empty('The original answer does not identify the position owner.')
    const id = lens.positions.length === 1 ? lens.positions[0]?.id : null
    const r = await pancakeV3Reader(lens.owner as `0x${string}`, { client: c, blockNumber: head, ...(id && /^\d{1,16}$/.test(id) ? { tokenId: BigInt(id) } : {}) })
    if (!r.ok) throw new Error('chain_unavailable')
    fresh = { kind: lens.kind, positions: r.data.positions.map(p => ({ id: p.tokenId, current: p.tickCurrent, lower: p.tickLower, upper: p.tickUpper, inRange: p.inRange.value === 1, distanceToBoundPct: Math.min(Math.abs(p.pctToLower.value), Math.abs(p.pctToUpper.value)) })) }
  } else if (lens.kind === 'yield') {
    const r = await yieldReader({ client: c, blockNumber: head })
    if (!r.ok) throw new Error('chain_unavailable')
    const days = parsed?.ok && typeof parsed.fields.holdingDays === 'number' && /\b\d{1,4}\s*(?:days|day|d)\b/i.test(task?.task ?? '') ? parsed.fields.holdingDays : null
    const amount = parsed?.ok && typeof parsed.fields.amount === 'number' ? parsed.fields.amount : null
    const fundingAsset = parsed?.ok && typeof parsed.fields.asset === 'string' ? r.data.venues.find(v => v.underlyingSymbol.toUpperCase() === String(parsed.fields.asset).toUpperCase()) : null
    const sizeUsd = amount !== null && fundingAsset ? amount * fundingAsset.priceUsd : null
    const net = (v: YieldVenue) => days !== null && sizeUsd !== null && sizeUsd > 0 ? netAprAtSize(v, sizeUsd, days / 365).netAprPct : null
    fresh = { kind: lens.kind, venues: r.data.venues.map(v => ({ name: `Venus ${v.underlyingSymbol}`, asset: v.underlyingSymbol.toUpperCase(), grossAprPct: v.grossApr.value, netAprPct: net(v) })) }
  } else {
    const key = gridAssetForRecheck(lens.pair, parsed?.ok ? parsed.fields.pair : null)
    const asset = key && key in GRID_ASSETS ? GRID_ASSETS[key as keyof typeof GRID_ASSETS] : null
    if (!asset) return empty('The original grid does not identify a supported USDT pair. A different quote currency is not substituted.', 'unsupported')
    const [symbol, decimals, price] = await Promise.all([
      c.readContract({ address: asset.address, abi: erc20Abi, functionName: 'symbol', blockNumber: head }),
      c.readContract({ address: asset.address, abi: erc20Abi, functionName: 'decimals', blockNumber: head }),
      priceInUsdt(c, asset.address, 18, head),
    ])
    if (symbol.toUpperCase() !== asset.symbol.toUpperCase() || decimals !== 18) return empty('The current token metadata does not match the pinned pair.', 'unsupported')
    fresh = { kind: lens.kind, priceUsd: price }
  }
  // Older grid answers sometimes omitted the requested bounds in their JSON. Use only the
  // validated task's recorded bounds as fallback, never a new band or an inferred price range.
  const comparisonLens = lens.kind === 'grid' && parsed?.ok ? { ...lens,
    lower: lens.lower ?? (typeof parsed.fields.lower === 'number' ? parsed.fields.lower : null),
    upper: lens.upper ?? (typeof parsed.fields.upper === 'number' ? parsed.fields.upper : null),
  } : lens
  const rows = compareRecheck(comparisonLens, kept.checks, fresh, kept.block, head.toString())
  return RecheckResult.parse({ ...base, observedAt: headRead.at, state: rows.length ? 'compared' : 'nothing_to_recheck', reason: rows.length ? null : 'No comparable field was supplied in the original answer.', rows })
}

/** Shared 60-second ephemeral projection. At most two new RPC comparisons run in this process at a time. */
export function recheckJob(chainId: ChainId, jobId: string) {
  return cachedProjection(`recheck:v1:${chainId}:${jobId}`, async () => {
    const key = `${chainId}:${jobId}`
    const existing = active.get(key)
    if (existing) return RecheckResult.parse(await existing)
    const work = freshRead(() => build(chainId, jobId)).finally(() => { active.delete(key) })
    active.set(key, work)
    return work
  }, { freshMs: 60_000, timeoutMs: 3800 }).then(p => {
    if (p.ageMs > 60_000) throw new Error('recheck_stale')
    const value = RecheckResult.parse(p.value)
    if (value.state === 'compared' && Date.now() - Date.parse(value.observedAt) > 60_000) throw new Error('recheck_stale_head')
    return { ...p, value }
  })
}
