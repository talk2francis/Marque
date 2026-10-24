import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, parseAbi, parseUnits, type Address, type Hex, type PublicClient } from 'viem'
import { venusReader, BSC_ADDRESSES, type VenusAccount } from '@marque/positions'

/**
 * Act on the answer (SPEC-ACT, invariant 34). The agent decides; Marque rebuilds the transaction.
 *
 * From an answer only DECISION fields are read: the action, a market or asset by symbol, the target.
 * Every address, amount and calldata comes from Marque's own reads at the current block and the
 * Venus Core Pool allowlist below. The beneficiary is always the signer's own position.
 */

export const VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36' as const
const COMPTROLLER = BSC_ADDRESSES.venusComptroller as Address
const comptrollerAbi = parseAbi(['function getAllMarkets() view returns (address[])', 'function markets(address) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus)', 'function oracle() view returns (address)'])
const vTokenAbi = parseAbi([
  'function underlying() view returns (address)', 'function symbol() view returns (string)',
  'function mint(uint256 mintAmount) returns (uint256)', 'function repayBorrow(uint256 repayAmount) returns (uint256)',
  'function getAccountSnapshot(address) view returns (uint256, uint256, uint256, uint256)',
])
const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function allowance(address, address) view returns (uint256)'])
const oracleAbi = parseAbi(['function getUnderlyingPrice(address) view returns (uint256)'])

/** The decision an answer carries. Nothing here is an address, an amount to send or calldata. */
export type Intent =
  | { action: 'repay'; targetHf: number; market: string | null; agentHf: number | null; agentRepayUsd: number | null; account: string | null; atBlock: bigint | null }
  | { action: 'supply'; asset: string; sizeUsd: number | null; atBlock: bigint | null }

interface LensLike { kind: string; meta?: { block?: string | null } | null; [k: string]: unknown }

/** Decision fields only (invariant 34). Returns null when the answer is not actionable in V4. */
export function intentFromLens(lens: LensLike, hints: { taskAsset?: string | null } = {}): Intent | null {
  const atBlock = lens.meta?.block && /^\d{6,12}$/.test(lens.meta.block) ? BigInt(lens.meta.block) : null
  if (lens.kind === 'health_factor') {
    const target = typeof lens['target'] === 'number' ? (lens['target'] as number) : null
    if (!target || target <= 1 || target > 10 || lens['hasPosition'] === false) return null
    const markets = Array.isArray(lens['markets']) ? (lens['markets'] as Array<{ symbol?: string; borrowedUsd?: number | null }>) : []
    const borrowed = markets.filter((m) => (m.borrowedUsd ?? 0) > 0).sort((a, b) => (b.borrowedUsd ?? 0) - (a.borrowedUsd ?? 0))[0]
    return {
      action: 'repay', targetHf: target, market: borrowed?.symbol ? String(borrowed.symbol).replace(/^v/, '') : null,
      agentHf: typeof lens['healthFactor'] === 'number' ? (lens['healthFactor'] as number) : null,
      agentRepayUsd: typeof lens['repayUsd'] === 'number' ? (lens['repayUsd'] as number) : null,
      account: typeof lens['account'] === 'string' ? (lens['account'] as string) : null, atBlock,
    }
  }
  if (lens.kind === 'yield') {
    if (lens['recommend'] !== true) return null
    const venue = String(lens['venue'] ?? '').toLowerCase()
    if (venue && !venue.includes('venus')) return null
    // The asset the buyer asked about may be named only in the task (a buyer's word, not the agent's).
    const asset = String(lens['asset'] ?? hints.taskAsset ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!asset) return null
    return { action: 'supply', asset, sizeUsd: typeof lens['sizeUsd'] === 'number' ? (lens['sizeUsd'] as number) : null, atBlock }
  }
  return null
}

export interface AllowedMarket { vToken: Address; underlying: Address; symbol: string; decimals: number; collateralFactor: number }

/** The allowlist: Venus Core Pool ERC-20 markets the Comptroller lists, read from chain. vBNB is excluded (payable path). */
export async function allowedMarkets(client: PublicClient, blockNumber?: bigint): Promise<AllowedMarket[]> {
  const at = blockNumber ? { blockNumber } : {}
  const all = await client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: 'getAllMarkets', ...at })
  const out: AllowedMarket[] = []
  await Promise.all(all.filter((v) => v.toLowerCase() !== VBNB.toLowerCase()).map(async (v) => {
    try {
      const [listed, cf] = await client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: 'markets', args: [v], ...at })
      if (!listed) return
      const underlying = await client.readContract({ address: v, abi: vTokenAbi, functionName: 'underlying', ...at })
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address: underlying, abi: erc20Abi, functionName: 'symbol', ...at }),
        client.readContract({ address: underlying, abi: erc20Abi, functionName: 'decimals', ...at }),
      ])
      out.push({ vToken: getAddress(v), underlying: getAddress(underlying), symbol, decimals, collateralFactor: Number(cf) / 1e18 })
    } catch { /* a market that does not answer is not offered */ }
  }))
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export interface PlanCall { to: Address; data: Hex; kind: 'approval' | 'repay' | 'supply'; words: string }
export interface PlanState { block: string; healthFactor: number | null; debtUsd: number; weightedUsd: number; market: { borrowed: number; supplied: number; walletBalance: number } }
export type Plan =
  | {
    ok: true; chainId: 56; user: Address; action: 'repay' | 'supply'
    market: { vToken: Address; underlying: Address; symbol: string; decimals: number; priceUsd: number }
    amountRaw: string; amount: number; amountUsd: number; bounds: { min: number; max: number }
    calls: PlanCall[]; before: PlanState; predicted: PlanState & { simulated: boolean }
    gas: string[]; readAt: string
    agent: { atBlock: string | null; healthFactor: number | null; repayUsd: number | null; target: number | null }
    stale: { reason: string; agentSays: string; nowNeeds: string } | null
    capped: string | null
  }
  | { ok: false; code: 'not_actionable' | 'not_allowed' | 'no_position' | 'already_met' | 'no_balance' | 'sim_failed' | 'worse' | 'not_owner' | 'read_failed'; reason: string }

const fmt = (n: number, dp = 2) => (n !== 0 && Math.abs(n) < 10 ** -dp ? n.toLocaleString('en-US', { maximumSignificantDigits: 4 }) : n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const STALE_BLOCKS = 4000n // about 30 minutes of BSC blocks

/**
 * Build, simulate and predict one action for `user` at the current block. `amount` (in token units)
 * lets the user adjust within bounds; the default is what the decision needs now.
 */
export async function plan(opts: { client: PublicClient; user: Address; intent: Intent; amount?: number | null; positionAccount?: string | null }): Promise<Plan> {
  const { client, intent } = opts
  const user = getAddress(opts.user)
  // The beneficiary is the signer's own position: never someone else's.
  if (opts.positionAccount && opts.positionAccount.toLowerCase() !== user.toLowerCase()) {
    return { ok: false, code: 'not_owner', reason: `The answer is about ${opts.positionAccount.slice(0, 8)}…, not the connected wallet. Only the position's owner can act on it.` }
  }
  const head = await client.getBlockNumber()
  const [acct, markets] = await Promise.all([
    venusReader(user, { client, blockNumber: head }).catch(() => null),
    allowedMarkets(client, head).catch(() => [] as AllowedMarket[]),
  ])
  if (!acct || !acct.ok) return { ok: false, code: 'read_failed', reason: 'Venus could not be read at the current block. Nothing was built.' }
  const a: VenusAccount = acct.data
  const debt = a.totalBorrowedUsd.value ?? 0
  const weighted = a.weightedCollateralUsd.value ?? 0
  const hf = a.healthFactor?.value ?? null

  let m: AllowedMarket | undefined
  if (intent.action === 'repay') {
    if (!a.hasPosition || debt <= 0) return { ok: false, code: 'no_position', reason: 'This wallet has no Venus borrow to repay.' }
    const borrowedHere = a.markets.filter((x) => x.borrowedUsd > 0).sort((x, y) => y.borrowedUsd - x.borrowedUsd)
    const wanted = intent.market ? borrowedHere.find((x) => x.underlyingSymbol.toUpperCase() === intent.market!.toUpperCase()) : undefined
    const pick = wanted ?? borrowedHere[0]
    m = pick ? markets.find((x) => x.vToken.toLowerCase() === pick.vToken.toLowerCase()) : undefined
    if (!m) return { ok: false, code: 'not_allowed', reason: `The borrowed market ${pick?.symbol ?? ''} is not one Marque can build for (Venus Core Pool ERC-20 markets only; vBNB is excluded).` }
    if (hf !== null && hf >= intent.targetHf) return { ok: false, code: 'already_met', reason: `The health factor is already ${hf.toFixed(3)}, at or above the ${intent.targetHf} target. Nothing to repay.` }
  } else {
    m = markets.find((x) => x.symbol.toUpperCase() === intent.asset.toUpperCase())
    if (!m) return { ok: false, code: 'not_allowed', reason: `${intent.asset} is not a Venus Core Pool market Marque can build for.` }
  }

  const oracle = await client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: 'oracle', blockNumber: head })
  const [priceRaw, balRaw, snap] = await Promise.all([
    client.readContract({ address: oracle, abi: oracleAbi, functionName: 'getUnderlyingPrice', args: [m.vToken], blockNumber: head }),
    client.readContract({ address: m.underlying, abi: erc20Abi, functionName: 'balanceOf', args: [user], blockNumber: head }),
    client.readContract({ address: m.vToken, abi: vTokenAbi, functionName: 'getAccountSnapshot', args: [user], blockNumber: head }),
  ])
  const priceUsd = Number(priceRaw) / 10 ** (36 - m.decimals)
  const walletBalance = Number(formatUnits(balRaw, m.decimals))
  const borrowedUnits = Number(formatUnits(snap[2], m.decimals))
  const suppliedUnits = Number(formatUnits((snap[1] * snap[3]) / 10n ** 18n, m.decimals))
  const inPosition = a.markets.find((x) => x.vToken.toLowerCase() === m!.vToken.toLowerCase())

  // What the decision needs now, then the user's choice within bounds.
  let need: number
  let max: number
  if (intent.action === 'repay') {
    const needUsd = Math.max(0, debt - weighted / intent.targetHf)
    need = Math.min(needUsd / priceUsd, borrowedUnits)
    max = Math.min(borrowedUnits, walletBalance)
  } else {
    need = intent.sizeUsd ? intent.sizeUsd / priceUsd : walletBalance
    max = walletBalance
  }
  if (max <= 0) return { ok: false, code: 'no_balance', reason: `The wallet holds no ${m.symbol} to ${intent.action === 'repay' ? 'repay with' : 'supply'}.` }
  const chosen = opts.amount != null && Number.isFinite(opts.amount) && opts.amount > 0 ? Math.min(opts.amount, max) : Math.min(need, max)
  const capped = chosen < need - 1e-9 ? `The wallet holds ${fmt(walletBalance, 4)} ${m.symbol}; the plan uses ${opts.amount != null ? 'the amount you chose' : 'all of it'}, short of the ${fmt(need, 4)} the decision needs.` : null
  // Exact units: round down to the token's precision (never more than the wallet holds or the debt).
  const amountRaw = parseUnits(chosen.toFixed(Math.min(m.decimals, 8)), m.decimals)
  const amount = Number(formatUnits(amountRaw, m.decimals))
  if (amountRaw <= 0n) return { ok: false, code: 'no_balance', reason: 'The amount rounds to zero.' }

  const verb = intent.action === 'repay' ? 'Repay' : 'Supply'
  const calls: PlanCall[] = [
    { to: m.underlying, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [m.vToken, amountRaw] }), kind: 'approval', words: `Allow Venus ${await client.readContract({ address: m.vToken, abi: vTokenAbi, functionName: 'symbol', blockNumber: head }).catch(() => 'market')} to take exactly ${fmt(amount, 4)} ${m.symbol}` },
    intent.action === 'repay'
      ? { to: m.vToken, data: encodeFunctionData({ abi: vTokenAbi, functionName: 'repayBorrow', args: [amountRaw] }), kind: 'repay', words: `${verb} ${fmt(amount, 4)} ${m.symbol} of your own borrow on Venus` }
      : { to: m.vToken, data: encodeFunctionData({ abi: vTokenAbi, functionName: 'mint', args: [amountRaw] }), kind: 'supply', words: `${verb} ${fmt(amount, 4)} ${m.symbol} to Venus, credited to your wallet` },
  ]

  // Simulate the exact sequence at the current block, then read the account back inside the simulation.
  const snapshotCall = { to: m.vToken, data: encodeFunctionData({ abi: vTokenAbi, functionName: 'getAccountSnapshot', args: [user] }) }
  let sim
  try { sim = await client.simulateCalls({ account: user, calls: [...calls.map((c) => ({ to: c.to, data: c.data })), snapshotCall] }) } catch (e) {
    return { ok: false, code: 'sim_failed', reason: `The simulation at the current block failed: ${(e as Error).message.split('\n')[0]!.slice(0, 160)}` }
  }
  const failed = sim.results.findIndex((r) => r.status !== 'success')
  if (failed >= 0 && failed < calls.length) return { ok: false, code: 'sim_failed', reason: `Step ${failed + 1} (${calls[failed]!.kind}) reverted in the simulation at the current block.` }
  // Compound-style markets return an error code instead of reverting: 0 is success.
  const code = decodeFunctionResult({ abi: vTokenAbi, functionName: intent.action === 'repay' ? 'repayBorrow' : 'mint', data: sim.results[1]!.data })
  if (code !== 0n) return { ok: false, code: 'sim_failed', reason: `Venus returned error code ${code} for the ${intent.action} in the simulation.` }
  const after = decodeFunctionResult({ abi: vTokenAbi, functionName: 'getAccountSnapshot', data: sim.results[2]!.data })
  const borrowedAfter = Number(formatUnits(after[2], m.decimals))
  const suppliedAfter = Number(formatUnits((after[1] * after[3]) / 10n ** 18n, m.decimals))

  const cf = inPosition ? inPosition.collateralFactor : 0 // collateral counts only in an entered market
  const debtAfter = Math.max(0, debt - (borrowedUnits - borrowedAfter) * priceUsd)
  const weightedAfter = weighted + (suppliedAfter - suppliedUnits) * priceUsd * cf
  const hfAfter = debtAfter > 0 ? weightedAfter / debtAfter : null
  if (intent.action === 'repay' && hf !== null && hfAfter !== null && hfAfter <= hf) return { ok: false, code: 'worse', reason: 'The simulated health factor does not improve. Nothing is offered.' }
  if (intent.action === 'supply' && suppliedAfter <= suppliedUnits) return { ok: false, code: 'worse', reason: 'The simulated supply did not increase. Nothing is offered.' }

  // A stale answer or a moved position: show both numbers.
  let stale: Extract<Plan, { ok: true }>['stale'] = null
  if (intent.action === 'repay') {
    const old = intent.atBlock !== null && head - intent.atBlock > STALE_BLOCKS
    const moved = intent.agentHf !== null && hf !== null && Math.abs(intent.agentHf - hf) > 0.05
    if (old || moved) {
      stale = {
        reason: old ? `The agent answered at block ${intent.atBlock!.toLocaleString('en-US')}, more than 30 minutes ago.` : `The health factor moved from ${intent.agentHf!.toFixed(3)} to ${hf!.toFixed(3)} since the agent answered.`,
        agentSays: intent.agentRepayUsd !== null ? `$${fmt(intent.agentRepayUsd)}` : 'not stated',
        nowNeeds: `${fmt(need, 4)} ${m.symbol} ($${fmt(need * priceUsd)})`,
      }
    }
  }

  return {
    ok: true, chainId: 56, user, action: intent.action,
    market: { vToken: m.vToken, underlying: m.underlying, symbol: m.symbol, decimals: m.decimals, priceUsd },
    amountRaw: amountRaw.toString(), amount, amountUsd: amount * priceUsd, bounds: { min: 0, max }, calls,
    before: { block: head.toString(), healthFactor: hf, debtUsd: debt, weightedUsd: weighted, market: { borrowed: borrowedUnits, supplied: suppliedUnits, walletBalance } },
    predicted: { block: head.toString(), healthFactor: hfAfter, debtUsd: debtAfter, weightedUsd: weightedAfter, market: { borrowed: borrowedAfter, supplied: suppliedAfter, walletBalance: walletBalance - amount }, simulated: true },
    gas: sim.results.slice(0, calls.length).map((r) => r.gasUsed.toString()), readAt: new Date().toISOString(),
    agent: { atBlock: intent.atBlock?.toString() ?? null, healthFactor: intent.action === 'repay' ? intent.agentHf : null, repayUsd: intent.action === 'repay' ? intent.agentRepayUsd : null, target: intent.action === 'repay' ? intent.targetHf : null },
    stale, capped,
  }
}

/** Measure the position after confirmation, the same reads as `before`. */
export async function measure(client: PublicClient, user: Address, vToken: Address, decimals: number, blockNumber: bigint): Promise<PlanState | null> {
  const acct = await venusReader(user, { client, blockNumber }).catch(() => null)
  if (!acct || !acct.ok) return null
  const [snap, underlying] = await Promise.all([
    client.readContract({ address: vToken, abi: vTokenAbi, functionName: 'getAccountSnapshot', args: [user], blockNumber }),
    client.readContract({ address: vToken, abi: vTokenAbi, functionName: 'underlying', blockNumber }),
  ])
  const bal = await client.readContract({ address: underlying, abi: erc20Abi, functionName: 'balanceOf', args: [user], blockNumber })
  return {
    block: blockNumber.toString(), healthFactor: acct.data.healthFactor?.value ?? null, debtUsd: acct.data.totalBorrowedUsd.value ?? 0, weightedUsd: acct.data.weightedCollateralUsd.value ?? 0,
    market: { borrowed: Number(formatUnits(snap[2], decimals)), supplied: Number(formatUnits((snap[1] * snap[3]) / 10n ** 18n, decimals)), walletBalance: Number(formatUnits(bal, decimals)) },
  }
}

/** The calls a confirmed transaction may contain: only these targets and selectors (for outcome verification). */
export function isAllowedCall(call: { to: string; data: string }, plan: Extract<Plan, { ok: true }>): boolean {
  return plan.calls.some((c) => c.to.toLowerCase() === call.to.toLowerCase() && c.data.toLowerCase() === call.data.toLowerCase())
}
