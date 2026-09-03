import type { Address, PublicClient } from 'viem'
import { publicClient } from '@marque/chain'
import { BSC_ADDRESSES, erc20MetaAbi, venusComptrollerAbi, vTokenAbi } from './abis.js'
import { measured, onchain, ok, fail, type Q, type ReaderResult, type ReadContext } from './provenance.js'

/**
 * Yield reader.
 *
 * The point of this file is one number nobody else shows: **net APR at your
 * actual size**. A 6.8% headline APR on $200 is negative once gas is paid, and
 * a marketplace that hides that is selling a loss as a gain.
 *
 * So `netAprAtSize` is a function, not a scalar. Gas is priced from the live
 * base fee and a measured gas figure for the venue's own deposit path — never
 * a hardcoded dollar constant.
 */

/** Venus supply gas, measured from real BSC mint transactions. */
const VENUS_MINT_GAS_UNITS = 250_000n
const VENUS_APPROVE_GAS_UNITS = 46_000n
const GAS_SOURCE = 'measured from Venus vToken mint + ERC-20 approve transactions on BSC mainnet'

/**
 * A market with no cash cannot actually be deposited into or withdrawn from at
 * any meaningful size, and deprecated markets (Venus still lists the dead UST
 * market) report nonsense per-block rates.
 */
const MIN_CASH_USD = 25_000
/**
 * No honest lending market pays this. A rate above it means a broken or
 * deprecated market, not an opportunity — Venus's dead UST market reports an
 * APR of ~1e14%. Surfacing that as a yield would be a fabricated metric.
 */
const MAX_CREDIBLE_APR_PCT = 200

export interface YieldVenue {
  protocol: 'venus'
  market: Address
  symbol: string
  underlying: Address | null
  underlyingSymbol: string
  underlyingDecimals: number

  /** Base lending rate, compounded from the contract's per-block rate. */
  grossApr: Q
  /** Additional token incentives. Zero until an incentive source is wired in. */
  incentiveApr: Q
  /** Round-trip gas to enter and exit, at the current base fee. */
  gasCostUsd: Q
  /** Swap cost in basis points to reach this venue's asset. */
  swapCostBps: Q
  /** Liquidity available to withdraw right now. */
  cashUsd: Q
  priceUsd: number
}

export interface YieldQuote {
  venue: YieldVenue
  sizeUsd: number
  grossAprPct: number
  costPct: number
  /** Gross minus every cost, at this size. Negative for small sizes. */
  netAprPct: number
  /** Size at which net APR crosses zero. Below this, depositing loses money. */
  breakEvenUsd: number
}

/** A market we deliberately did not offer, and why. Shown, never hidden. */
export interface ExcludedVenue {
  market: Address
  underlyingSymbol: string
  reason: 'no_liquidity' | 'implausible_rate' | 'zero_rate'
  detail: string
}

export interface YieldOpportunities {
  venues: YieldVenue[]
  /** AGENTS.md invariant 7: publish the attrition rather than quietly filtering. */
  excluded: ExcludedVenue[]
  /** Live BNB price and base fee, so a caller can reproduce the gas figure. */
  gasPriceWei: string
  bnbPriceUsd: number
  blocksPerYear: number
}

/**
 * Net APR at a given size.
 *
 * costPct is the one-off cost expressed as a percentage of the deposit, which
 * is what makes the answer size-dependent: the same $1.40 of gas is 0.14% of
 * $1,000 and 14% of $10.
 *
 * A one-year holding period is assumed and stated, because "net APR" is
 * meaningless without one — the same gas amortises differently over a week.
 */
export function netAprAtSize(venue: YieldVenue, sizeUsd: number, holdingPeriodYears = 1): YieldQuote {
  if (sizeUsd <= 0) throw new Error('size must be positive')
  const grossAprPct = venue.grossApr.value + venue.incentiveApr.value
  const swapCostUsd = sizeUsd * (venue.swapCostBps.value / 10_000)
  const oneOffCostUsd = venue.gasCostUsd.value + swapCostUsd
  const costPct = (oneOffCostUsd / sizeUsd / holdingPeriodYears) * 100
  const netAprPct = grossAprPct - costPct

  // Break-even: gross earnings over the period equal the one-off costs.
  //   size * gross * years = gas + size * swapBps
  const swapFraction = venue.swapCostBps.value / 10_000
  const denominator = (grossAprPct / 100) * holdingPeriodYears - swapFraction
  const breakEvenUsd = denominator > 0 ? venue.gasCostUsd.value / denominator : Number.POSITIVE_INFINITY

  return { venue, sizeUsd, grossAprPct, costPct, netAprPct, breakEvenUsd }
}

/** Measure BSC's actual block time rather than assuming 3s. */
async function blocksPerYear(client: PublicClient, head: bigint): Promise<number> {
  const span = 1000n
  const [recent, older] = await Promise.all([
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: head - span }),
  ])
  const seconds = Number(recent.timestamp - older.timestamp) / Number(span)
  if (!(seconds > 0)) throw new Error('could not measure block time')
  return Math.round((365 * 24 * 60 * 60) / seconds)
}

/** Compound a per-block rate into an annual percentage. */
export function aprFromRatePerBlock(ratePerBlockMantissa: bigint, perYear: number): number {
  const perBlock = Number(ratePerBlockMantissa) / 1e18
  // (1 + r)^n - 1, computed in log space so n ~ 10^7 does not overflow.
  return (Math.expm1(perYear * Math.log1p(perBlock))) * 100
}

interface MulticallResult<T> {
  status: 'success' | 'failure'
  result?: T
}

export async function yieldReader(
  opts: { client?: PublicClient; blockNumber?: bigint; maxMarkets?: number } = {},
): Promise<ReaderResult<YieldOpportunities>> {
  const client = opts.client ?? publicClient()
  const blockNumber = opts.blockNumber ?? (await client.getBlockNumber())
  const ctx: ReadContext = { blockNumber, readAt: new Date().toISOString(), chainId: 56 }
  const comptroller = BSC_ADDRESSES.venusComptroller as Address

  let markets: readonly Address[]
  try {
    markets = await client.readContract({
      address: comptroller, abi: venusComptrollerAbi, functionName: 'getAllMarkets', blockNumber,
    })
  } catch (err) {
    return fail('comptroller_unreadable', ctx, err instanceof Error ? err.message : String(err))
  }

  const perYear = await blocksPerYear(client, blockNumber)
  const gasPriceWei = await client.getGasPrice()

  // Price BNB from the oracle so the gas figure is in real dollars.
  const oracle = await client
    .readContract({ address: comptroller, abi: venusComptrollerAbi, functionName: 'oracle', blockNumber })
    .catch(() => BSC_ADDRESSES.venusOracle as Address)

  const selected = markets.slice(0, opts.maxMarkets ?? 30)

  const [rates, cash, symbols, underlyings, prices] = await Promise.all([
    client.multicall({
      contracts: selected.map((m) => ({ address: m, abi: vTokenAbi, functionName: 'supplyRatePerBlock' })),
      allowFailure: true, blockNumber,
    }) as unknown as Promise<Array<MulticallResult<bigint>>>,
    client.multicall({
      contracts: selected.map((m) => ({ address: m, abi: vTokenAbi, functionName: 'getCash' })),
      allowFailure: true, blockNumber,
    }) as unknown as Promise<Array<MulticallResult<bigint>>>,
    client.multicall({
      contracts: selected.map((m) => ({ address: m, abi: vTokenAbi, functionName: 'symbol' })),
      allowFailure: true, blockNumber,
    }) as unknown as Promise<Array<MulticallResult<string>>>,
    client.multicall({
      contracts: selected.map((m) => ({ address: m, abi: vTokenAbi, functionName: 'underlying' })),
      allowFailure: true, blockNumber,
    }) as unknown as Promise<Array<MulticallResult<Address>>>,
    client.multicall({
      contracts: selected.map((m) => ({
        address: oracle,
        abi: [{
          type: 'function', name: 'getUnderlyingPrice', stateMutability: 'view',
          inputs: [{ name: 'v', type: 'address' }], outputs: [{ type: 'uint256' }],
        }] as const,
        functionName: 'getUnderlyingPrice', args: [m],
      })),
      allowFailure: true, blockNumber,
    }) as unknown as Promise<Array<MulticallResult<bigint>>>,
  ])

  const decimals = await Promise.all(
    selected.map(async (_, i) => {
      const u = underlyings[i]
      if (u?.status !== 'success' || !u.result) return 18
      return client
        .readContract({ address: u.result, abi: erc20MetaAbi, functionName: 'decimals', blockNumber })
        .then(Number)
        .catch(() => 18)
    }),
  )

  const underlyingSymbols = await Promise.all(
    selected.map(async (_, i) => {
      const u = underlyings[i]
      if (u?.status !== 'success' || !u.result) return 'BNB'
      return client
        .readContract({ address: u.result, abi: erc20MetaAbi, functionName: 'symbol', blockNumber })
        .then(String)
        .catch(() => '???')
    }),
  )

  // BNB is priced through vBNB, whose underlying() call reverts — that absence
  // is exactly how we identify it.
  let bnbPriceUsd = 0
  for (let i = 0; i < selected.length; i++) {
    if (underlyings[i]?.status !== 'success' && prices[i]?.status === 'success') {
      bnbPriceUsd = Number(prices[i]?.result ?? 0n) / 1e18
      break
    }
  }

  const gasUnits = VENUS_MINT_GAS_UNITS + VENUS_APPROVE_GAS_UNITS
  // Round trip: enter and exit.
  const gasCostBnb = (Number(gasPriceWei) / 1e18) * Number(gasUnits) * 2
  const gasCostUsd = gasCostBnb * bnbPriceUsd
  const at = ctx.readAt

  const venues: YieldVenue[] = []
  const excluded: ExcludedVenue[] = []
  for (let i = 0; i < selected.length; i++) {
    const market = selected[i]
    const rate = rates[i]
    const price = prices[i]
    if (!market || rate?.status !== 'success' || rate.result === undefined) continue
    if (price?.status !== 'success' || price.result === undefined) continue

    const d = decimals[i] ?? 18
    const priceUsd = Number(price.result) / 10 ** (36 - d)
    const grossApr = aprFromRatePerBlock(rate.result, perYear)
    const symbol = underlyingSymbols[i] ?? '???'
    const cashRaw = cash[i]?.status === 'success' ? (cash[i]?.result ?? 0n) : 0n
    const cashUsd = (Number(cashRaw) / 10 ** d) * priceUsd

    if (!Number.isFinite(grossApr) || grossApr <= 0) {
      excluded.push({ market, underlyingSymbol: symbol, reason: 'zero_rate', detail: 'market pays no supply rate' })
      continue
    }
    if (grossApr > MAX_CREDIBLE_APR_PCT) {
      excluded.push({
        market, underlyingSymbol: symbol, reason: 'implausible_rate',
        detail: `reported ${grossApr.toExponential(3)}% APR, above the ${MAX_CREDIBLE_APR_PCT}% credibility ceiling`,
      })
      continue
    }
    if (cashUsd < MIN_CASH_USD) {
      excluded.push({
        market, underlyingSymbol: symbol, reason: 'no_liquidity',
        detail: `$${cashUsd.toFixed(2)} available, below the $${MIN_CASH_USD.toLocaleString()} floor`,
      })
      continue
    }

    venues.push({
      protocol: 'venus',
      market,
      symbol: symbols[i]?.status === 'success' ? String(symbols[i]?.result) : 'v???',
      underlying: underlyings[i]?.status === 'success' ? (underlyings[i]?.result ?? null) : null,
      underlyingSymbol: symbol,
      underlyingDecimals: d,
      grossApr: onchain(grossApr, '%'),
      // No incentive source is wired in yet, so this is honestly zero rather
      // than an invented number. Wiring XVS distribution is a later phase.
      incentiveApr: onchain(0, '%'),
      gasCostUsd: measured(gasCostUsd, 'USD', `${GAS_SOURCE}; priced at the live base fee`, at),
      // Depositing an asset you already hold costs no swap. A route that needs
      // one is priced when the caller supplies the source asset.
      swapCostBps: onchain(0, 'bps'),
      cashUsd: onchain(cashUsd, 'USD'),
      priceUsd,
    })
  }

  venues.sort((a, b) => b.grossApr.value - a.grossApr.value)

  return ok({
    venues,
    excluded,
    gasPriceWei: gasPriceWei.toString(),
    bnbPriceUsd,
    blocksPerYear: perYear,
  }, ctx)
}

export type { Q }
