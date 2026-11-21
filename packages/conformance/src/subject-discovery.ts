import { parseAbiItem, type Address, type PublicClient } from 'viem'
import { BSC_ADDRESSES, nonfungiblePositionManagerAbi, erc20MetaAbi } from '@marque/positions'

/**
 * Live replacement subjects for published cases whose listed third-party subject has gone away.
 *
 * Live replacement subjects for MCS-REB-1 (21 Nov 2026).
 *
 * The published rebalancing case names real PancakeSwap V3 positions owned by strangers. Any of them can be closed at
 * any time, and by 21 Nov every listed one had been (four at zero liquidity, one burned). The test then could not be
 * captured for anyone: the bench answered "could not be read from BNB Chain" and no agent was ever asked.
 *
 * When every listed subject fails, this finds positions that are live right now: the newest IncreaseLiquidity events
 * on the position manager, kept only if the NFT still exists, still holds liquidity and sits on the policy's fee tier.
 * Nothing is fabricated: the case is still read from chain at its own block, exactly as for a listed subject, and the
 * stored subject names the owner/NFT actually read.
 */

const INCREASE = parseAbiItem('event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)')
/** Public BSC nodes refuse wide log ranges; a few small windows cover the last ~30 minutes of deposits. */
export const DISCOVERY_SPAN = 1_500n
export const DISCOVERY_WINDOWS = 3
const MAX_CANDIDATES = 40

export type RebSubject = { owner: string; tokenId: string; pair: string }

/** Newest-first unique token ids from IncreaseLiquidity logs. */
export function newestTokenIds(logs: ReadonlyArray<{ blockNumber: bigint | null; logIndex: number | null; args: { tokenId?: bigint } }>, max = MAX_CANDIDATES): bigint[] {
  const sorted = [...logs].sort((a, b) => {
    const db = (b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)
    return db !== 0n ? (db > 0n ? 1 : -1) : (b.logIndex ?? 0) - (a.logIndex ?? 0)
  })
  const out: bigint[] = []
  for (const l of sorted) {
    const id = l.args.tokenId
    if (id === undefined || out.includes(id)) continue
    out.push(id)
    if (out.length >= max) break
  }
  return out
}

/** Whether a position row is usable as a rebalancing subject. */
export function usablePosition(row: { fee: number; liquidity: bigint }, feeTier: number): boolean {
  return row.fee === feeTier && row.liquidity > 0n
}

export async function discoverRebSubjects(client: PublicClient, opts: { feeTier: number; want?: number }): Promise<RebSubject[]> {
  const npm = BSC_ADDRESSES.pancakeV3PositionManager as Address
  const want = opts.want ?? 3
  const head = await client.getBlockNumber()
  const logs: Array<{ blockNumber: bigint | null; logIndex: number | null; args: { tokenId?: bigint } }> = []
  for (let w = 0; w < DISCOVERY_WINDOWS; w++) {
    const toBlock = head - BigInt(w) * DISCOVERY_SPAN
    const fromBlock = toBlock - DISCOVERY_SPAN + 1n
    try {
      logs.push(...await client.getLogs({ address: npm, event: INCREASE, fromBlock, toBlock }))
    } catch { /* one refused window does not stop the others */ }
    if (newestTokenIds(logs).length >= MAX_CANDIDATES) break
  }
  const ids = newestTokenIds(logs)
  if (!ids.length) return []

  const reads = await client.multicall({
    allowFailure: true,
    blockNumber: head,
    contracts: ids.flatMap((id) => [
      { address: npm, abi: nonfungiblePositionManagerAbi, functionName: 'positions', args: [id] } as const,
      { address: npm, abi: nonfungiblePositionManagerAbi, functionName: 'ownerOf', args: [id] } as const,
    ]),
  })

  const picked: Array<{ id: bigint; owner: string; t0: Address; t1: Address }> = []
  for (let i = 0; i < ids.length && picked.length < want; i++) {
    const pos = reads[2 * i], own = reads[2 * i + 1]
    if (pos?.status !== 'success' || own?.status !== 'success') continue
    const r = pos.result as readonly [bigint, Address, Address, Address, number, number, number, bigint, ...unknown[]]
    if (!usablePosition({ fee: Number(r[4]), liquidity: r[7] }, opts.feeTier)) continue
    picked.push({ id: ids[i]!, owner: own.result as string, t0: r[2], t1: r[3] })
  }
  if (!picked.length) return []

  const syms = await client.multicall({
    allowFailure: true,
    contracts: picked.flatMap((p) => [
      { address: p.t0, abi: erc20MetaAbi, functionName: 'symbol' } as const,
      { address: p.t1, abi: erc20MetaAbi, functionName: 'symbol' } as const,
    ]),
  })
  return picked.map((p, i) => {
    const s0 = syms[2 * i]?.status === 'success' ? String(syms[2 * i]!.result) : 'TOKEN0'
    const s1 = syms[2 * i + 1]?.status === 'success' ? String(syms[2 * i + 1]!.result) : 'TOKEN1'
    return { owner: p.owner, tokenId: p.id.toString(), pair: `${s0}/${s1}` }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// MCS-HF-1 (21 Nov 2026): the listed Venus account repaid its debt, so the health-factor case became invalid ("no
// debt"). Same remedy: accounts that borrowed or partly repaid recently on major Venus Core markets, newest first,
// those using two or more markets first (as the original multi-market subject did). The case reader still decides
// validity: an account without debt at the capture block is refused there, exactly as before.

const BORROW = parseAbiItem('event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)')
const REPAY = parseAbiItem('event RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)')
/** vUSDT, vUSDC, vBNB, vBTC, vETH, vFDUSD on Venus Core (BSC mainnet). */
export const HF_DISCOVERY_MARKETS: readonly Address[] = [
  '0xfD5840Cd36d94D7229439859C0112a4185BC0255', '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8',
  '0xA07c5b74C9B40447a954e1466938b865b6BBea36', '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B',
  '0xf508fCD89b8bd15579dc79A6827cB4686A3592c8', '0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba',
]
export const HF_DISCOVERY_SPAN = 5_000n
export const HF_DISCOVERY_WINDOWS = 6
const getAssetsInAbi = [{ type: 'function', name: 'getAssetsIn', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'address[]' }] }] as const

type BorrowLog = { blockNumber: bigint | null; logIndex: number | null; args: { borrower?: Address; accountBorrows?: bigint } }

/** Newest-first unique borrowers whose balance after the event was still positive. */
export function newestBorrowers(logs: readonly BorrowLog[], max = 20): Address[] {
  const sorted = [...logs].sort((a, b) => {
    const db = (b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)
    return db !== 0n ? (db > 0n ? 1 : -1) : (b.logIndex ?? 0) - (a.logIndex ?? 0)
  })
  const out: Address[] = []
  for (const l of sorted) {
    const who = l.args.borrower
    if (!who || (l.args.accountBorrows ?? 0n) === 0n) continue
    if (out.some((x) => x.toLowerCase() === who.toLowerCase())) continue
    out.push(who)
    if (out.length >= max) break
  }
  return out
}

export async function discoverHfSubjects(client: PublicClient, opts: { want?: number } = {}): Promise<Array<{ address: string }>> {
  const want = opts.want ?? 4
  const head = await client.getBlockNumber()
  const logs: BorrowLog[] = []
  for (let w = 0; w < HF_DISCOVERY_WINDOWS; w++) {
    const toBlock = head - BigInt(w) * HF_DISCOVERY_SPAN
    const fromBlock = toBlock - HF_DISCOVERY_SPAN + 1n
    try {
      logs.push(...await client.getLogs({ address: [...HF_DISCOVERY_MARKETS], events: [BORROW, REPAY], fromBlock, toBlock }) as BorrowLog[])
    } catch { /* keep going with the other windows */ }
    if (newestBorrowers(logs).length >= want * 3) break
  }
  const who = newestBorrowers(logs)
  if (!who.length) return []
  const assets = await client.multicall({
    allowFailure: true,
    blockNumber: head,
    contracts: who.map((a) => ({ address: BSC_ADDRESSES.venusComptroller as Address, abi: getAssetsInAbi, functionName: 'getAssetsIn', args: [a] } as const)),
  })
  const ranked = who
    .map((a, i) => ({ a, n: assets[i]?.status === 'success' ? (assets[i]!.result as readonly Address[]).length : 0 }))
    .filter((x) => x.n > 0)
    .sort((x, y) => (y.n >= 2 ? 1 : 0) - (x.n >= 2 ? 1 : 0))
  return ranked.slice(0, want).map((x) => ({ address: x.a }))
}
