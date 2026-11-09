import { erc20Abi, parseAbi, type Abi, type Address, type PublicClient } from 'viem'
import { CHARTER_CHAINS, marketOf, type CharterChainId } from './addresses.js'
import { loanGuardAbi } from './abi.js'
import { healthOf, NO_DEBT, STATE_CODES, usdOf, WAD, type GuardState } from './health.js'

/**
 * A Venus Core loan read the way a Loan Guard reads it (C1): health comes from Venus's own getAccountLiquidity,
 * which weighs collateral by each market's liquidation threshold (confirmed on both chains, P1/A05). Per-market
 * values are read too, for price framing and for saying which loans a guard can protect, but the health shown is
 * always Venus's. Every value carries the block it was read at.
 */
const comptrollerAbi = parseAbi([
  'function getAccountLiquidity(address) view returns (uint256,uint256,uint256)',
  'function getAssetsIn(address) view returns (address[])',
  'function oracle() view returns (address)',
  'function vaiController() view returns (address)',
  'function markets(address) view returns (bool,uint256,bool,uint256,uint256,uint96,bool)',
])
const vTokenAbi = parseAbi([
  'function getAccountSnapshot(address) view returns (uint256,uint256,uint256,uint256)',
  'function symbol() view returns (string)',
  'function underlying() view returns (address)',
])
const oracleAbi = parseAbi(['function getUnderlyingPrice(address) view returns (uint256)'])
const vaiAbi = parseAbi(['function getVAIRepayAmount(address) view returns (uint256)'])

export interface LoanMarket {
  vToken: Address
  /** The underlying's symbol ("BNB" for the native market, which has no underlying). */
  symbol: string
  underlying: Address | null
  decimals: number
  /** Venus price, scaled to 1e(36 - decimals). */
  price: bigint
  /** Underlying units supplied and borrowed. */
  supplied: bigint
  borrowed: bigint
  collateralFactor: bigint
  liquidationThreshold: bigint
  /** Supplied value weighted by the liquidation threshold, USD with 18 decimals. */
  weightedUsd: bigint
  borrowedUsd: bigint
  /** A Loan Guard can repay debt in this market. */
  repayable: boolean
  /** When something is borrowed here that no guard can repay, why, in words; otherwise null. */
  unsupportedReason: string | null
}

export interface Loan {
  chainId: CharterChainId
  account: Address
  blockNumber: bigint
  readAt: string
  /** Venus's weighted collateral and total debt (VAI included), and the health they give. */
  collateralUsd: bigint
  debtUsd: bigint
  health: bigint
  vaiDebtUsd: bigint
  markets: LoanMarket[]
  /** The market carrying the most weighted collateral: the one price framing speaks about. */
  mainCollateral: LoanMarket | null
}

const UNSUPPORTED_NATIVE = 'Automatic repayment is not available for BNB debt yet. Stablecoin loans first.'
const UNSUPPORTED_OTHER = 'Automatic repayment covers USDT, USDC and FDUSD loans on Venus Core for now.'

export async function readLoan(client: PublicClient, chainId: CharterChainId, account: Address, blockNumber?: bigint): Promise<Loan> {
  const chain = CHARTER_CHAINS[chainId]
  const block = blockNumber ?? (await client.getBlockNumber())
  const c = chain.comptroller
  const [liq, assets, oracle, vai] = await Promise.all([
    client.readContract({ address: c, abi: comptrollerAbi, functionName: 'getAccountLiquidity', args: [account], blockNumber: block }),
    client.readContract({ address: c, abi: comptrollerAbi, functionName: 'getAssetsIn', args: [account], blockNumber: block }),
    client.readContract({ address: c, abi: comptrollerAbi, functionName: 'oracle', blockNumber: block }),
    client.readContract({ address: c, abi: comptrollerAbi, functionName: 'vaiController', blockNumber: block }),
  ])
  if (liq[0] !== 0n) throw new Error(`Venus returned error ${liq[0]} reading this account`)
  const n = assets.length
  const calls = <T>(fn: (a: Address) => object) => client.multicall({ contracts: assets.map(fn) as never, allowFailure: true, blockNumber: block }) as Promise<Array<{ status: 'success' | 'failure'; result?: T }>>
  const [snaps, infos, prices, underlyings] = await Promise.all([
    calls<readonly [bigint, bigint, bigint, bigint]>((a) => ({ address: a, abi: vTokenAbi, functionName: 'getAccountSnapshot', args: [account] })),
    calls<readonly [boolean, bigint, boolean, bigint, bigint, bigint, boolean]>((a) => ({ address: c, abi: comptrollerAbi, functionName: 'markets', args: [a] })),
    calls<bigint>((a) => ({ address: oracle, abi: oracleAbi, functionName: 'getUnderlyingPrice', args: [a] })),
    calls<Address>((a) => ({ address: a, abi: vTokenAbi, functionName: 'underlying' })),
  ])
  // Symbol and decimals of each underlying; the native market has no underlying, so it reads its own symbol twice.
  const metaCalls: Array<{ address: Address; abi: Abi; functionName: string }> = []
  assets.forEach((a, i) => {
    const u = underlyings[i]?.status === 'success' ? underlyings[i]!.result! : null
    if (u) metaCalls.push({ address: u, abi: erc20Abi, functionName: 'symbol' }, { address: u, abi: erc20Abi, functionName: 'decimals' })
    else metaCalls.push({ address: a, abi: vTokenAbi, functionName: 'symbol' }, { address: a, abi: vTokenAbi, functionName: 'symbol' })
  })
  const meta = await client.multicall({ contracts: metaCalls as never, allowFailure: true, blockNumber: block }) as Array<{ status: string; result?: unknown }>

  const markets: LoanMarket[] = []
  let debtUsd = 0n
  for (let i = 0; i < n; i++) {
    const s = snaps[i], info = infos[i], p = prices[i]
    if (s?.status !== 'success' || info?.status !== 'success' || p?.status !== 'success') throw new Error('Venus could not be read for every market of this account')
    const [err, vBal, borrowed, rate] = s.result!
    if (err !== 0n) throw new Error(`Venus returned error ${err} for a market of this account`)
    const underlying = underlyings[i]?.status === 'success' ? underlyings[i]!.result! : null
    const symbol = underlying ? String(meta[2 * i]?.result ?? '?') : 'BNB'
    const decimals = underlying ? Number(meta[2 * i + 1]?.result ?? 18) : 18
    const price = p.result!
    const [, cf, , lt] = info.result!
    const supplied = (vBal * rate) / WAD
    // As Venus does: tokensToDenom = threshold * exchangeRate * price, then times the vToken balance.
    const weightedUsd = (((((lt * rate) / WAD) * price) / WAD) * vBal) / WAD
    const borrowedUsd = usdOf(price, borrowed)
    debtUsd += borrowedUsd
    const supported = marketOf(chainId, assets[i]!)
    markets.push({
      vToken: assets[i]!, symbol, underlying, decimals, price, supplied, borrowed, collateralFactor: cf, liquidationThreshold: lt,
      weightedUsd, borrowedUsd, repayable: supported !== null,
      unsupportedReason: supported || borrowed === 0n ? null : underlying ? UNSUPPORTED_OTHER : UNSUPPORTED_NATIVE,
    })
  }
  const vaiDebtUsd = vai === '0x0000000000000000000000000000000000000000' ? 0n
    : await client.readContract({ address: vai, abi: vaiAbi, functionName: 'getVAIRepayAmount', args: [account], blockNumber: block })
  debtUsd += vaiDebtUsd
  const [, liquidity, shortfall] = liq
  const collateralUsd = debtUsd + liquidity > shortfall ? debtUsd + liquidity - shortfall : 0n
  const mainCollateral = markets.filter((m) => m.weightedUsd > 0n).sort((a, b) => (b.weightedUsd > a.weightedUsd ? 1 : -1))[0] ?? null
  return {
    chainId, account, blockNumber: block, readAt: new Date().toISOString(),
    collateralUsd, debtUsd, health: healthOf({ collateralUsd, debtUsd }), vaiDebtUsd, markets, mainCollateral,
  }
}

export interface GuardPreview {
  state: GuardState
  health: bigint
  wouldRepay: bigint
  tipIfAgent: bigint
  available: bigint
  debt: bigint
}

/** LoanGuard.preview(). It reverts when Venus cannot price a borrowed market; that surfaces as an error. */
export async function readPreview(client: PublicClient, guard: Address, blockNumber?: bigint): Promise<GuardPreview> {
  const [state, health, wouldRepay, tipIfAgent, available, debt] = await client.readContract({ address: guard, abi: loanGuardAbi, functionName: 'preview', blockNumber })
  const name = STATE_CODES[state]
  // A state this code does not know means the guard is newer than the reader: never guess at a calm one.
  if (!name) throw new Error(`unknown LoanGuard preview state ${state}`)
  return { state: name, health, wouldRepay, tipIfAgent, available, debt }
}

/** The owner's balance of the debt token and its allowance to a guard address (which may not exist yet). */
export async function readReserve(client: PublicClient, token: Address, owner: Address, guard: Address, blockNumber?: bigint) {
  const [balance, allowance] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner], blockNumber }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, guard], blockNumber }),
  ])
  return { balance, allowance }
}

export { NO_DEBT }
