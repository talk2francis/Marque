import type { Address, PublicClient } from 'viem'
import { publicClient } from '@marque/chain'
import {
  BSC_ADDRESSES, erc20MetaAbi, nonfungiblePositionManagerAbi,
  pancakeV3FactoryAbi, pancakeV3PoolAbi,
} from './abis.js'
import {
  amountsForLiquidity, distanceToBounds, inRange, rangePosition,
  sqrtPriceX96ToPrice, tickSpacingForFee, tickToPrice, toHuman,
} from './v3-math.js'
import { onchain, ok, fail, type Q, type ReaderResult, type ReadContext } from './provenance.js'
import { priceInUsdt } from './spot.js'

/**
 * PancakeSwap V3 position reader.
 *
 * Reads every position an address owns, resolves each pool, and derives the
 * numbers the Rebalancing category is ranked on. Uncollected fees come from a
 * static `collect` call rather than `tokensOwed`, because tokensOwed only
 * updates when the position is poked and understates fees the rest of the time.
 */

const MAX_UINT128 = (1n << 128n) - 1n

/**
 * Value a position and its uncollected fees in dollars.
 *
 * `positionValueUsd` and `feesUsd` were declared on V3Position and rendered by
 * the Desk from the start, but nothing ever computed them — so a real position
 * has always shown "—" where its size should be. A marketplace that cannot say
 * what a position is worth cannot argue about what rebalancing it is worth.
 *
 * Both tokens must price, or the value is ABSENT. Half a position priced and
 * the other half silently treated as zero would understate the position, which
 * is worse than saying nothing (AGENTS.md: absence is shown as absence).
 *
 * Prices are memoised per token for the life of one read, so a wallet with five
 * positions in the same pair costs one price lookup, not ten.
 */
async function valueInUsd(
  client: PublicClient,
  blockNumber: bigint,
  cache: Map<string, number | null>,
  a: { token: Address; decimals: number; amount: number },
  b: { token: Address; decimals: number; amount: number },
): Promise<number | null> {
  const priceOf = async (t: Address, d: number): Promise<number | null> => {
    const key = t.toLowerCase()
    if (!cache.has(key)) cache.set(key, await priceInUsdt(client, t, d, blockNumber).catch(() => null))
    return cache.get(key) ?? null
  }
  const [pa, pb] = await Promise.all([priceOf(a.token, a.decimals), priceOf(b.token, b.decimals)])
  if (pa === null || pb === null) return null
  const total = a.amount * pa + b.amount * pb
  return Number.isFinite(total) ? total : null
}

/**
 * viem infers multicall result types from a literal `contracts` array. Ours is
 * built with Array.from, so inference collapses to `never`. These aliases name
 * the shape we know each batch returns, keeping the cast at one boundary
 * instead of sprinkling `as` through the reader.
 */
type MulticallResult<T> = { status: 'success'; result: T } | { status: 'failure'; error: Error }

type RawPosition = readonly [
  bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint,
]

export interface TokenMeta {
  address: Address
  symbol: string
  decimals: number
}

export interface V3Position {
  tokenId: string
  token0: TokenMeta
  token1: TokenMeta
  fee: number
  /** The pool's own spacing. A proposed tick must be a multiple of this. */
  tickSpacing: number
  pool: Address

  tickLower: number
  tickUpper: number
  tickCurrent: number
  liquidity: string

  inRange: Q
  /** Human price of token0 in token1 at each boundary and now. */
  priceLower: Q
  priceUpper: Q
  priceCurrent: Q
  /** Percentage price move needed to reach each bound. */
  pctToLower: Q
  pctToUpper: Q
  /** 0 at the lower bound, 1 at the upper. Outside [0,1] means out of range. */
  rangePosition: Q

  amount0: Q
  amount1: Q
  /** Real uncollected fees, from a static collect call. */
  fees0: Q
  fees1: Q

  /**
   * Present only when both tokens could be priced. Absent is deliberate:
   * showing a zero USD value for a position we could not price would be a
   * fabricated metric (AGENTS.md invariant 4).
   */
  positionValueUsd?: Q
  feesUsd?: Q
}

export interface V3Portfolio {
  owner: Address
  positions: V3Position[]
  /** Positions held but carrying no liquidity. Counted, not hidden. */
  emptyPositions: number
}

async function tokenMeta(client: PublicClient, address: Address): Promise<TokenMeta> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20MetaAbi, functionName: 'symbol' }).catch(() => '???'),
    client.readContract({ address, abi: erc20MetaAbi, functionName: 'decimals' }).catch(() => 18),
  ])
  return { address, symbol: String(symbol), decimals: Number(decimals) }
}

/**
 * Real uncollected fees. `collect` is a state-changing function, so we simulate
 * it from the owner's address with the maximum requested amounts; the return
 * value is what would actually be paid out.
 */
async function uncollectedFees(
  client: PublicClient,
  tokenId: bigint,
  owner: Address,
  blockNumber: bigint,
): Promise<{ amount0: bigint; amount1: bigint }> {
  try {
    const { result } = await client.simulateContract({
      address: BSC_ADDRESSES.pancakeV3PositionManager as Address,
      abi: nonfungiblePositionManagerAbi,
      functionName: 'collect',
      args: [{ tokenId, recipient: owner, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
      account: owner,
      blockNumber,
    })
    const [amount0, amount1] = result as readonly [bigint, bigint]
    return { amount0, amount1 }
  } catch {
    // A simulation can fail for reasons that are not our business (a paused
    // pool, an odd token). Report zero fees rather than failing the position,
    // and let the caller see the position is otherwise readable.
    return { amount0: 0n, amount1: 0n }
  }
}

export async function pancakeV3Reader(
  owner: Address,
  opts: { client?: PublicClient; blockNumber?: bigint; maxPositions?: number } = {},
): Promise<ReaderResult<V3Portfolio>> {
  const client = opts.client ?? publicClient()
  const nfpm = BSC_ADDRESSES.pancakeV3PositionManager as Address
  const blockNumber = opts.blockNumber ?? (await client.getBlockNumber())
  const ctx: ReadContext = { blockNumber, readAt: new Date().toISOString(), chainId: 56 }
  const maxPositions = opts.maxPositions ?? 40

  let balance: bigint
  try {
    balance = await client.readContract({
      address: nfpm, abi: nonfungiblePositionManagerAbi,
      functionName: 'balanceOf', args: [owner], blockNumber,
    })
  } catch (err) {
    return fail('position_manager_unreadable', ctx, err instanceof Error ? err.message : String(err))
  }

  const count = Number(balance) > maxPositions ? maxPositions : Number(balance)
  if (count === 0) return ok({ owner, positions: [], emptyPositions: 0 }, ctx)

  const tokenIds = (await client.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: nfpm, abi: nonfungiblePositionManagerAbi,
      functionName: 'tokenOfOwnerByIndex', args: [owner, BigInt(i)],
    })),
    allowFailure: true,
    blockNumber,
  })) as unknown as Array<MulticallResult<bigint>>

  const ids: bigint[] = []
  for (const r of tokenIds) if (r.status === 'success') ids.push(r.result)

  const rawPositions = (await client.multicall({
    contracts: ids.map((id) => ({
      address: nfpm, abi: nonfungiblePositionManagerAbi, functionName: 'positions', args: [id],
    })),
    allowFailure: true,
    blockNumber,
  })) as unknown as Array<MulticallResult<RawPosition>>

  const positions: V3Position[] = []
  let emptyPositions = 0
  /** One price per token for the whole read, not one per position. */
  const priceCache = new Map<string, number | null>()

  for (let i = 0; i < ids.length; i++) {
    const row = rawPositions[i]
    const tokenId = ids[i]
    if (!row || row.status !== 'success' || tokenId === undefined) continue

    const [, , token0Addr, token1Addr, fee, tickLower, tickUpper, liquidity] = row.result

    if (liquidity === 0n) {
      emptyPositions++
      continue
    }

    const pool = await client.readContract({
      address: BSC_ADDRESSES.pancakeV3Factory as Address,
      abi: pancakeV3FactoryAbi, functionName: 'getPool',
      args: [token0Addr, token1Addr, fee], blockNumber,
    })
    if (pool === '0x0000000000000000000000000000000000000000') continue

    const [slot0, meta0, meta1, fees] = await Promise.all([
      client.readContract({ address: pool, abi: pancakeV3PoolAbi, functionName: 'slot0', blockNumber }),
      tokenMeta(client, token0Addr),
      tokenMeta(client, token1Addr),
      uncollectedFees(client, tokenId, owner, blockNumber),
    ])

    const [sqrtPriceX96, tickCurrent] = slot0 as readonly [bigint, number, ...unknown[]]
    const d0 = meta0.decimals
    const d1 = meta1.decimals

    const priceCurrent = sqrtPriceX96ToPrice(sqrtPriceX96, d0, d1)
    const priceLower = tickToPrice(tickLower, d0, d1)
    const priceUpper = tickToPrice(tickUpper, d0, d1)
    const { pctToLower, pctToUpper } = distanceToBounds(priceCurrent, priceLower, priceUpper)
    const amounts = amountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, liquidity)

    const priceUnit = `${meta1.symbol}/${meta0.symbol}`

    const amt0 = toHuman(amounts.amount0, d0)
    const amt1 = toHuman(amounts.amount1, d1)
    const fee0 = toHuman(fees.amount0, d0)
    const fee1 = toHuman(fees.amount1, d1)

    const [valueUsd, feeUsd] = await Promise.all([
      valueInUsd(client, blockNumber, priceCache,
        { token: token0Addr, decimals: d0, amount: amt0 },
        { token: token1Addr, decimals: d1, amount: amt1 }),
      valueInUsd(client, blockNumber, priceCache,
        { token: token0Addr, decimals: d0, amount: fee0 },
        { token: token1Addr, decimals: d1, amount: fee1 }),
    ])

    positions.push({
      tokenId: tokenId.toString(),
      token0: meta0,
      token1: meta1,
      fee: Number(fee),
      tickSpacing: tickSpacingForFee(Number(fee)),
      pool,
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      tickCurrent: Number(tickCurrent),
      liquidity: liquidity.toString(),

      inRange: onchain(inRange(Number(tickCurrent), Number(tickLower), Number(tickUpper)) ? 1 : 0, 'bool'),
      priceLower: onchain(priceLower, priceUnit),
      priceUpper: onchain(priceUpper, priceUnit),
      priceCurrent: onchain(priceCurrent, priceUnit),
      pctToLower: onchain(pctToLower, '%'),
      pctToUpper: onchain(pctToUpper, '%'),
      rangePosition: onchain(rangePosition(Number(tickCurrent), Number(tickLower), Number(tickUpper)), 'fraction'),

      amount0: onchain(amt0, meta0.symbol),
      amount1: onchain(amt1, meta1.symbol),
      fees0: onchain(fee0, meta0.symbol),
      fees1: onchain(fee1, meta1.symbol),

      // Absent, never zero, when either leg could not be priced on chain.
      ...(valueUsd === null ? {} : { positionValueUsd: onchain(valueUsd, 'USD') }),
      ...(feeUsd === null ? {} : { feesUsd: onchain(feeUsd, 'USD') }),
    })
  }

  return ok({ owner, positions, emptyPositions }, ctx)
}
