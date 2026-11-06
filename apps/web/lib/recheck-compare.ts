import type { Lens } from '@marque/commerce'
import { HF, YIELD, REB, type LensCheck } from '@marque/conformance'
import { distanceToBounds, exactRepayToReachTargetHf, healthFactorOf } from '@marque/positions'
import type { RecheckField } from './recheck-schema'

export type FreshReading =
  | { kind: 'health_factor'; healthFactor: number | null; weightedCollateralUsd: number; totalBorrowedUsd: number; liquidation: Record<string, number | null> }
  | { kind: 'rebalancing'; positions: Array<{ id: string; current: number; lower: number; upper: number; inRange: boolean; distanceToBoundPct?: number }> }
  | { kind: 'yield'; venues: Array<{ name: string; asset: string; grossAprPct: number; netAprPct: number | null }> }
  | { kind: 'grid'; priceUsd: number | null }

/** A bare task pair has the existing task schema's USDT quote. An explicit conflicting answer is never replaced. */
export function gridAssetForRecheck(answerPair: string | null, validatedTaskPair: unknown): string | null {
  const task = typeof validatedTaskPair === 'string' ? validatedTaskPair.toUpperCase() : null
  const pair = answerPair?.toUpperCase().replace(/\s/g, '') ?? null
  const explicit = pair?.match(/^(BNB|WBNB|BTCB|ETH|CAKE)[/-]USDT$/)?.[1]
  const bare = pair === null || pair === task ? task : null
  const asset = explicit ?? (bare && /^(BNB|BTCB|ETH|CAKE)$/.test(bare) ? bare : null)
  return asset === 'WBNB' ? 'BNB' : asset
}

export function validRecheckBlocks(original: string | null, declared: string | null, current: string): boolean {
  if (!original || !/^\d{1,16}$/.test(original) || !/^\d{1,16}$/.test(current)) return false
  const a = BigInt(original), n = BigInt(current)
  return a > 0n && n >= a && (declared === null || declared === original)
}

/** Compare fresh chain facts with the original answer. Existing grades and tolerances are never changed. */
export function compareRecheck(lens: Lens, checks: LensCheck[], fresh: FreshReading, originalBlock: string, currentBlock: string): RecheckField[] {
  const rows: RecheckField[] = []
  const put = (field: string, label: string, unit: string | null, before: number | string | boolean | null, now: number | string | boolean | null, holds: boolean | null, detail: string, checkKey = field, measured = false) => {
    const check = checks.find(c => c.key === checkKey)
    const agreed = check ? ['match', 'holds'].includes(check.state) ? true : ['differs', 'fails'].includes(check.state) ? false : null : null
    rows.push({ field, label, unit, atAnswer: { value: before, block: originalBlock, provenance: agreed === true ? 'TESTED' : 'CLAIMED', agreed }, now: { value: now, block: currentBlock, provenance: measured ? 'MEASURED' : 'ONCHAIN' }, stillHolds: now === null || agreed === false ? null : holds, detail: agreed === false ? `This field already disagreed in the original check. ${detail}` : detail })
  }
  const near = (a: number | null, b: number | null, tolerance: number) => a === null || b === null ? null : Math.abs(a - b) <= tolerance
  const distancePct = (tick: number, lower: number, upper: number): number | null => {
    if (![tick, lower, upper].every(n => Number.isInteger(n) && Math.abs(n) <= 887272)) return null
    const d = distanceToBounds(1.0001 ** tick, 1.0001 ** lower, 1.0001 ** upper)
    return Math.min(Math.abs(d.pctToLower), Math.abs(d.pctToUpper))
  }
  if (lens.kind === 'health_factor' && fresh.kind === lens.kind) {
    if (lens.healthFactor !== null) put('hf', 'Health factor', null, lens.healthFactor, fresh.healthFactor, near(lens.healthFactor, fresh.healthFactor, HF.HEALTH_FACTOR.value!), `Same Venus reader and health-factor tolerance (${HF.HEALTH_FACTOR.value}).`)
    if (lens.target !== null && lens.target > 0 && lens.repayUsd !== null) {
      const repay = exactRepayToReachTargetHf(fresh.weightedCollateralUsd, fresh.totalBorrowedUsd, lens.target)
      const after = healthFactorOf(fresh.weightedCollateralUsd, Math.max(0, fresh.totalBorrowedUsd - lens.repayUsd))
      const already = lens.repayUsd === 0 && fresh.healthFactor !== null && fresh.healthFactor >= lens.target
      put('repay', `Repay to reach HF ${lens.target}`, 'USD', lens.repayUsd, repay, already || after !== null && Math.abs(after - lens.target) <= HF.REPAY_AMOUNT.value!, 'Applies the original repay to the current account and checks its original target. The new amount uses the existing exact-repay calculation.', 'repay', true)
    }
    if (lens.collateralSymbol && lens.liquidationPriceUsd !== null) {
      const value = fresh.liquidation[lens.collateralSymbol.toUpperCase()] ?? null
      put('liq', `${lens.collateralSymbol} liquidation price`, 'USD', lens.liquidationPriceUsd, value, value !== null && value > 0 ? Math.abs(value - lens.liquidationPriceUsd) / value * 100 <= HF.LIQUIDATION_PRICE_PCT.value! : null, `Same per-market reader; tolerance ${HF.LIQUIDATION_PRICE_PCT.value}%.`, 'liq', true)
    }
  } else if (lens.kind === 'rebalancing' && fresh.kind === lens.kind) {
    for (const p of lens.positions.slice(0, 6)) {
      if (!p.id) continue
      const now = fresh.positions.find(x => x.id === p.id)
      const note = now ? 'The same position ID, read at the current block.' : 'That position was not active in this current read. No replacement position is substituted.'
      put(`tick-${p.id}`, `#${p.id} current tick`, 'ticks', p.current, now?.current ?? null, near(p.current, now?.current ?? null, REB.TICK_EXACT.value!), note, lens.positions.length === 1 ? 'tick' : `tick-${p.id}`)
      if (!p.range) {
        put(`inrange-${p.id}`, `#${p.id} in range`, null, p.inRange, now?.inRange ?? null, null, `${note} The original answer did not supply bounds, so its old range is not reconstructed.`, `inrange-${p.id}`)
        put(`distance-${p.id}`, `#${p.id} nearest bound`, '%', null, now ? now.distanceToBoundPct ?? distancePct(now.current, now.lower, now.upper) : null, null, 'The current range is readable; an original distance was not recorded. No historical value is invented.', `distance-${p.id}`, true)
      }
      if (p.range && p.current !== null) {
        const before = p.inRange ?? (p.current >= p.range[0] && p.current < p.range[1])
        put(`inrange-${p.id}`, `#${p.id} in range`, null, before, now?.inRange ?? null, now ? now.inRange === before : null, `${note} The original range check was arithmetic on the reported bounds.`, `inrange-${p.id}`)
        const distance = distancePct(p.current, p.range[0], p.range[1])
        const currentDistance = now ? now.distanceToBoundPct ?? distancePct(now.current, now.lower, now.upper) : null
        put(`distance-${p.id}`, `#${p.id} nearest bound`, '%', distance, currentDistance, near(distance, currentDistance, REB.DISTANCE_PCT.value!), `Price distance uses the existing V3 reader's calculation and ${REB.DISTANCE_PCT.value} percentage-point tolerance. Original bounds are provider-reported.`, `distance-${p.id}`, true)
      }
    }
  } else if (lens.kind === 'yield' && fresh.kind === lens.kind) {
    const sourceAsset = lens.sources.map(s => s.label.match(/\bv?(USDT|USDC|FDUSD|DAI|TUSD)\b/i)?.[1]).find(Boolean)
    const asset = (lens.asset ?? sourceAsset)?.toUpperCase().replace(/^V(?=USDT|USDC|FDUSD|DAI|TUSD)/, '')
    const primary = fresh.venues.find(v => v.asset === asset && /venus/i.test(lens.venue ?? ''))
    const gross = lens.grossAprPct ?? lens.sources.find(s => /venus/i.test(s.label))?.value ?? null
    if (gross !== null) put('apr', `Venus ${asset ?? 'asset not stated'} supply APR`, '% APR', gross, primary?.grossAprPct ?? null, near(gross, primary?.grossAprPct ?? null, YIELD.NET_APR_BPS.value! / 100), `Compares APR with APR, tolerance ${YIELD.NET_APR_BPS.value} bps. APY is never silently treated as APR.`)
    if (lens.netAprPct !== null) put('net-apr', 'Net APR at the stated size and holding period', '% APR', lens.netAprPct, primary?.netAprPct ?? null, near(lens.netAprPct, primary?.netAprPct ?? null, YIELD.NET_APR_BPS.value! / 100), 'A comparable size and holding period must be recorded in the original task. Otherwise no net return is inferred.', 'net', true)
    for (const [index, alternative] of lens.alternatives.slice(0, 12).entries()) {
      const venue = fresh.venues.find(v => /venus/i.test(alternative.venue) && alternative.venue.toUpperCase().split(/[^A-Z0-9]+/).some(word => word === v.asset || word === `V${v.asset}`))
      put(`venue-${index}`, `${alternative.venue} net APR`, '% APR', alternative.netAprPct, venue?.netAprPct ?? null, near(alternative.netAprPct, venue?.netAprPct ?? null, YIELD.NET_APR_BPS.value! / 100), 'Only an explicitly identified original Venus venue with the recorded size and holding period is comparable. Unavailable protocols are left unread.', `venue-${index}`, true)
    }
    const offered = [lens.venue, ...lens.alternatives.map(a => a.venue)].filter((n): n is string => Boolean(n))
    if (offered.length > 1) {
      const resolved = offered.map(name => fresh.venues.find(v => name.toLowerCase().includes(v.asset.toLowerCase()) && /venus/i.test(name)))
      const available = resolved.filter((v): v is NonNullable<typeof v> => Boolean(v && v.netAprPct !== null))
      const ranked = available.length === offered.length ? [...available].sort((a, b) => b.netAprPct! - a.netAprPct!) : null
      put('ranking', 'Ranking of the original venues', null, offered.join(' > '), ranked?.map(v => v.name).join(' > ') ?? null, ranked ? resolved[0] === ranked[0] : null, 'Only the original venue set is compared. Missing protocols, size or holding period leave the ranking unavailable; current badges or an APY ranking are not substituted.', 'ranking', true)
    }
  } else if (lens.kind === 'grid' && fresh.kind === lens.kind && lens.lower !== null && lens.upper !== null) {
    put('grid-price', 'Price against the original grid bounds', 'USDT', lens.price, fresh.priceUsd, fresh.priceUsd === null ? null : fresh.priceUsd >= lens.lower && fresh.priceUsd <= lens.upper, `Original band ${lens.lower} to ${lens.upper} USDT, from the answer or its recorded task. This reads the market price now; the original price was provider-reported. It does not rerun unchanged spacing arithmetic.`, 'grid-price')
  }
  return rows
}
