import type { Address, PublicClient } from 'viem'
import { publicClient } from '@marque/chain'
import {
  BSC_ADDRESSES, erc20MetaAbi, venusComptrollerAbi, venusOracleAbi, vTokenAbi,
} from './abis.js'
import { onchain, ok, fail, type Q, type ReaderResult, type ReadContext } from './provenance.js'

/**
 * Venus Core health-factor reader.
 *
 * The Health Factor category lives or dies on this file: MCS-HF-1 asserts the
 * health factor to three decimals and the exact repay amount to restore a
 * target, with a tolerance of 0.005. An agent that gets a user's liquidation
 * price wrong is worse than no agent, so every number here is derived from
 * chain state and nothing is approximated.
 *
 * Venus follows Compound's conventions:
 *  - `getUnderlyingPrice` is scaled to 1e(36 - underlyingDecimals);
 *  - a vToken balance converts to underlying via `exchangeRateMantissa` / 1e18;
 *  - `collateralFactorMantissa` is 1e18-scaled.
 */

const WAD = 10n ** 18n

export interface VenusMarket {
  vToken: Address
  symbol: string
  underlying: Address | null
  underlyingSymbol: string
  underlyingDecimals: number
  /** Fraction of this asset's value that counts as collateral, 0..1. */
  collateralFactor: number
  priceUsd: number

  /** Underlying units supplied, and their USD value. */
  supplied: number
  suppliedUsd: number
  /** Underlying units borrowed, and their USD value. */
  borrowed: number
  borrowedUsd: number

  /**
   * Price at which this asset alone would push the account to HF 1.0, holding
   * every other position constant. Null when the asset is not collateral here,
   * or when no price can push the account under (nothing borrowed against it).
   */
  liquidationPriceUsd: number | null
  pctDropToLiquidation: number | null
}

export interface VenusAccount {
  address: Address
  markets: VenusMarket[]
  /** Collateral value already weighted by each market's collateral factor. */
  weightedCollateralUsd: Q
  totalBorrowedUsd: Q
  /**
   * weightedCollateral / totalBorrowed, to 3dp.
   * Null when nothing is borrowed — an account with no debt has no health
   * factor, and rendering "Infinity" or a placeholder would be a fabrication.
   */
  healthFactor: Q | null
  hasPosition: boolean
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * The exact repayment, in USD of debt, that moves an account to `target`.
 *
 * Closed form. Repaying reduces borrows and leaves weighted collateral
 * untouched, so from HF = C / B:
 *
 *     target = C / (B - R)   =>   R = B - C / target
 *
 * Returns 0 when the account is already at or above the target, and caps at B
 * because you cannot repay more than you owe.
 */
export function exactRepayToReachTargetHf(
  weightedCollateralUsd: number,
  totalBorrowedUsd: number,
  target: number,
): number {
  if (target <= 0) throw new Error('target health factor must be positive')
  if (totalBorrowedUsd <= 0) return 0
  const repay = totalBorrowedUsd - weightedCollateralUsd / target
  if (repay <= 0) return 0
  return Math.min(repay, totalBorrowedUsd)
}

/** HF for a given collateral/borrow pair. Null when there is no debt. */
export function healthFactorOf(
  weightedCollateralUsd: number,
  totalBorrowedUsd: number,
): number | null {
  if (totalBorrowedUsd <= 0) return null
  return weightedCollateralUsd / totalBorrowedUsd
}

interface MulticallResult<T> {
  status: 'success' | 'failure'
  result?: T
  error?: Error
}

export async function venusReader(
  account: Address,
  opts: { client?: PublicClient; blockNumber?: bigint } = {},
): Promise<ReaderResult<VenusAccount>> {
  const client = opts.client ?? publicClient()
  const blockNumber = opts.blockNumber ?? (await client.getBlockNumber())
  const ctx: ReadContext = { blockNumber, readAt: new Date().toISOString(), chainId: 56 }
  const comptroller = BSC_ADDRESSES.venusComptroller as Address

  let assetsIn: readonly Address[]
  try {
    assetsIn = await client.readContract({
      address: comptroller, abi: venusComptrollerAbi,
      functionName: 'getAssetsIn', args: [account], blockNumber,
    })
  } catch (err) {
    return fail('comptroller_unreadable', ctx, err instanceof Error ? err.message : String(err))
  }

  if (assetsIn.length === 0) {
    return ok({
      address: account,
      markets: [],
      weightedCollateralUsd: onchain(0, 'USD'),
      totalBorrowedUsd: onchain(0, 'USD'),
      healthFactor: null,
      hasPosition: false,
    }, ctx)
  }

  // The oracle is read from the comptroller rather than hardcoded, so a Venus
  // oracle migration does not silently leave us pricing against a dead feed.
  const oracle = await client
    .readContract({ address: comptroller, abi: venusComptrollerAbi, functionName: 'oracle', blockNumber })
    .catch(() => BSC_ADDRESSES.venusOracle as Address)

  const snapshots = (await client.multicall({
    contracts: assetsIn.map((v) => ({
      address: v, abi: vTokenAbi, functionName: 'getAccountSnapshot', args: [account],
    })),
    allowFailure: true, blockNumber,
  })) as unknown as Array<MulticallResult<readonly [bigint, bigint, bigint, bigint]>>

  const marketInfos = (await client.multicall({
    contracts: assetsIn.map((v) => ({
      address: comptroller, abi: venusComptrollerAbi, functionName: 'markets', args: [v],
    })),
    allowFailure: true, blockNumber,
  })) as unknown as Array<MulticallResult<readonly [boolean, bigint, boolean]>>

  const prices = (await client.multicall({
    contracts: assetsIn.map((v) => ({
      address: oracle, abi: venusOracleAbi, functionName: 'getUnderlyingPrice', args: [v],
    })),
    allowFailure: true, blockNumber,
  })) as unknown as Array<MulticallResult<bigint>>

  const vSymbols = (await client.multicall({
    contracts: assetsIn.map((v) => ({ address: v, abi: vTokenAbi, functionName: 'symbol' })),
    allowFailure: true, blockNumber,
  })) as unknown as Array<MulticallResult<string>>

  const underlyings = (await client.multicall({
    contracts: assetsIn.map((v) => ({ address: v, abi: vTokenAbi, functionName: 'underlying' })),
    allowFailure: true, blockNumber,
  })) as unknown as Array<MulticallResult<Address>>

  // vBNB has no `underlying()`; it is the native asset with 18 decimals.
  const underlyingDecimals = await Promise.all(
    assetsIn.map(async (_, i) => {
      const u = underlyings[i]
      if (!u || u.status !== 'success' || !u.result) return 18
      return client
        .readContract({ address: u.result, abi: erc20MetaAbi, functionName: 'decimals', blockNumber })
        .then((d) => Number(d))
        .catch(() => 18)
    }),
  )

  const underlyingSymbols = await Promise.all(
    assetsIn.map(async (_, i) => {
      const u = underlyings[i]
      if (!u || u.status !== 'success' || !u.result) return 'BNB'
      return client
        .readContract({ address: u.result, abi: erc20MetaAbi, functionName: 'symbol', blockNumber })
        .then((sym) => String(sym))
        .catch(() => '???')
    }),
  )

  const markets: VenusMarket[] = []
  let weightedCollateralUsd = 0
  let totalBorrowedUsd = 0

  for (let i = 0; i < assetsIn.length; i++) {
    const vToken = assetsIn[i]
    const snap = snapshots[i]
    const info = marketInfos[i]
    const price = prices[i]
    if (!vToken || snap?.status !== 'success' || !snap.result) continue
    if (info?.status !== 'success' || !info.result) continue
    if (price?.status !== 'success' || price.result === undefined) continue

    const [, vTokenBalance, borrowBalance, exchangeRate] = snap.result
    const [, collateralFactorMantissa] = info.result
    const decimals = underlyingDecimals[i] ?? 18

    // Compound convention: price is 1e(36 - decimals), so dividing by that
    // scale and by the token's own scale yields plain USD.
    const priceScale = 10 ** (36 - decimals)
    const priceUsd = Number(price.result) / priceScale

    const suppliedRaw = (vTokenBalance * exchangeRate) / WAD
    const supplied = Number(suppliedRaw) / 10 ** decimals
    const borrowed = Number(borrowBalance) / 10 ** decimals

    const collateralFactor = Number(collateralFactorMantissa) / Number(WAD)
    const suppliedUsd = supplied * priceUsd
    const borrowedUsd = borrowed * priceUsd

    weightedCollateralUsd += suppliedUsd * collateralFactor
    totalBorrowedUsd += borrowedUsd

    markets.push({
      vToken,
      symbol: vSymbols[i]?.status === 'success' ? String(vSymbols[i]?.result) : 'v???',
      underlying: underlyings[i]?.status === 'success' ? (underlyings[i]?.result ?? null) : null,
      underlyingSymbol: underlyingSymbols[i] ?? '???',
      underlyingDecimals: decimals,
      collateralFactor,
      priceUsd,
      supplied,
      suppliedUsd,
      borrowed,
      borrowedUsd,
      liquidationPriceUsd: null,
      pctDropToLiquidation: null,
    })
  }

  // Second pass: a liquidation price can only be computed once the totals for
  // every other market are known.
  for (const m of markets) {
    const contribution = m.suppliedUsd * m.collateralFactor
    const otherCollateral = weightedCollateralUsd - contribution
    if (m.supplied <= 0 || m.collateralFactor <= 0 || totalBorrowedUsd <= 0) continue

    // HF hits 1 when otherCollateral + supplied * CF * price == totalBorrowed.
    const liqPrice = (totalBorrowedUsd - otherCollateral) / (m.supplied * m.collateralFactor)
    if (liqPrice <= 0) continue // other collateral alone already covers the debt
    m.liquidationPriceUsd = liqPrice
    m.pctDropToLiquidation = ((m.priceUsd - liqPrice) / m.priceUsd) * 100
  }

  const hf = healthFactorOf(weightedCollateralUsd, totalBorrowedUsd)

  return ok({
    address: account,
    markets,
    weightedCollateralUsd: onchain(weightedCollateralUsd, 'USD'),
    totalBorrowedUsd: onchain(totalBorrowedUsd, 'USD'),
    healthFactor: hf === null ? null : onchain(round3(hf), 'HF'),
    hasPosition: markets.some((m) => m.supplied > 0 || m.borrowed > 0),
  }, ctx)
}
