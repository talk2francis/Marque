import type { Address, PublicClient } from 'viem'
import { publicClient } from '@marque/chain'
import { BSC_ADDRESSES, erc20MetaAbi, pancakeV3FactoryAbi, pancakeV3PoolAbi } from './abis.js'
import { sqrtPriceX96ToPrice } from './v3-math.js'
import { onchain, ok, type Q, type ReaderResult, type ReadContext } from './provenance.js'

/**
 * Spot balance reader.
 *
 * Idle assets are the demand side of the Yield and Grid categories: a wallet
 * holding 1,240 USDT earning nothing is the clearest possible reason to hire
 * an agent.
 *
 * Prices come from PancakeSwap V3 pools rather than a price API, so they are
 * ONCHAIN rather than MEASURED and carry a block number. Where no pool route
 * exists, the price is simply absent — never zero, never estimated.
 */

/** The assets we track by default. Everything here has deep BSC liquidity. */
export const TRACKED_TOKENS: ReadonlyArray<{ address: Address; symbol: string; decimals: number }> = [
  { address: BSC_ADDRESSES.usdt as Address, symbol: 'USDT', decimals: 18 },
  { address: BSC_ADDRESSES.usdc as Address, symbol: 'USDC', decimals: 18 },
  { address: BSC_ADDRESSES.wbnb as Address, symbol: 'WBNB', decimals: 18 },
  { address: BSC_ADDRESSES.cake as Address, symbol: 'CAKE', decimals: 18 },
]

export interface SpotBalance {
  symbol: string
  address: Address | 'native'
  decimals: number
  amount: Q
  /** Absent when no on-chain route to USDT was found. Never defaulted to 0. */
  priceUsd?: Q
  valueUsd?: Q
}

export interface SpotHoldings {
  address: Address
  balances: SpotBalance[]
  /** Sum over only the balances we could price. `pricedCount` says how many. */
  totalValueUsd: Q
  pricedCount: number
  unpricedCount: number
}

/**
 * Mid price of `token` in USDT from the deepest available V3 pool.
 *
 * Exported because the V3 position reader needs exactly this to value a
 * position in dollars, and two implementations of "what is this token worth"
 * would eventually disagree on the same screen.
 */
export async function priceInUsdt(
  client: PublicClient,
  token: Address,
  decimals: number,
  blockNumber: bigint,
): Promise<number | null> {
  const usdt = BSC_ADDRESSES.usdt as Address
  if (token.toLowerCase() === usdt.toLowerCase()) return 1

  // Try each fee tier; the first pool with liquidity wins.
  for (const fee of [500, 2500, 100, 10000]) {
    try {
      const pool = await client.readContract({
        address: BSC_ADDRESSES.pancakeV3Factory as Address,
        abi: pancakeV3FactoryAbi, functionName: 'getPool',
        args: [token, usdt, fee], blockNumber,
      })
      if (pool === '0x0000000000000000000000000000000000000000') continue

      const [slot0, liquidity] = await Promise.all([
        client.readContract({ address: pool, abi: pancakeV3PoolAbi, functionName: 'slot0', blockNumber }),
        client.readContract({ address: pool, abi: pancakeV3PoolAbi, functionName: 'liquidity', blockNumber }),
      ])
      if ((liquidity as bigint) === 0n) continue

      const [sqrtPriceX96] = slot0 as readonly [bigint, ...unknown[]]
      // The factory orders tokens by address, so which side is token0 decides
      // whether the pool price is token/USDT or USDT/token.
      const tokenIsToken0 = token.toLowerCase() < usdt.toLowerCase()
      const price = tokenIsToken0
        ? sqrtPriceX96ToPrice(sqrtPriceX96, decimals, 18)
        : 1 / sqrtPriceX96ToPrice(sqrtPriceX96, 18, decimals)
      if (Number.isFinite(price) && price > 0) return price
    } catch {
      continue
    }
  }
  return null
}

export async function spotReader(
  address: Address,
  opts: { client?: PublicClient; blockNumber?: bigint } = {},
): Promise<ReaderResult<SpotHoldings>> {
  const client = opts.client ?? publicClient()
  const blockNumber = opts.blockNumber ?? (await client.getBlockNumber())
  const ctx: ReadContext = { blockNumber, readAt: new Date().toISOString(), chainId: 56 }

  const nativeBalance = await client.getBalance({ address, blockNumber })

  const raw = (await client.multicall({
    contracts: TRACKED_TOKENS.map((t) => ({
      address: t.address, abi: erc20MetaAbi, functionName: 'balanceOf', args: [address],
    })),
    allowFailure: true, blockNumber,
  })) as unknown as Array<{ status: 'success' | 'failure'; result?: bigint }>

  const balances: SpotBalance[] = []
  let totalValueUsd = 0
  let pricedCount = 0
  let unpricedCount = 0

  const bnbPrice = await priceInUsdt(client, BSC_ADDRESSES.wbnb as Address, 18, blockNumber)

  // Native BNB, which has no ERC-20 balanceOf.
  if (nativeBalance > 0n) {
    const amount = Number(nativeBalance) / 1e18
    const entry: SpotBalance = {
      symbol: 'BNB', address: 'native', decimals: 18, amount: onchain(amount, 'BNB'),
    }
    if (bnbPrice !== null) {
      entry.priceUsd = onchain(bnbPrice, 'USD')
      entry.valueUsd = onchain(amount * bnbPrice, 'USD')
      totalValueUsd += amount * bnbPrice
      pricedCount++
    } else {
      unpricedCount++
    }
    balances.push(entry)
  }

  for (let i = 0; i < TRACKED_TOKENS.length; i++) {
    const token = TRACKED_TOKENS[i]
    const row = raw[i]
    if (!token || row?.status !== 'success' || row.result === undefined || row.result === 0n) continue

    const amount = Number(row.result) / 10 ** token.decimals
    const price = await priceInUsdt(client, token.address, token.decimals, blockNumber)
    const entry: SpotBalance = {
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
      amount: onchain(amount, token.symbol),
    }
    if (price !== null) {
      entry.priceUsd = onchain(price, 'USD')
      entry.valueUsd = onchain(amount * price, 'USD')
      totalValueUsd += amount * price
      pricedCount++
    } else {
      unpricedCount++
    }
    balances.push(entry)
  }

  return ok({
    address,
    balances,
    totalValueUsd: onchain(totalValueUsd, 'USD'),
    pricedCount,
    unpricedCount,
  }, ctx)
}
