import 'server-only'
import { sql } from 'drizzle-orm'
import { parseAbiItem, type PublicClient } from 'viem'
import { cachedProjection, db } from '@marque/db'
import { publicClient } from '@marque/chain'
import { venusReader, pancakeV3Reader } from '@marque/positions'
import { CASES, REB_FALLBACK_SUBJECTS } from '@marque/conformance'

/**
 * Live examples for the hire form (3 Nov): up to five real positions a buyer can hand an agent, each read from BNB Chain
 * when the list is built, so the form shows what the agent will find (a health factor, a range in or out). Venus
 * accounts come from the published test case, the accounts earlier hires on Marque asked about, and accounts that
 * borrowed on Venus in the last hours (its Borrow events); PancakeSwap V3
 * positions from the published test cases and Marque's own position. Only accounts with a live loan and positions with
 * liquidity are offered. Nothing here is a recommendation; the buyer picks one or types their own.
 */
export interface LoanExample { address: string; healthFactor: number | null; borrowedUsd: number; block: string }
export interface PositionExample { tokenId: string; owner: string; pair: string; inRange: boolean; block: string }
export interface LiveExamples { loans: LoanExample[]; positions: PositionExample[]; readAt: string }

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const MARQUE_POSITION = { tokenId: '7367728', owner: '0x2e010AaDFdFEbC2AdFCAFA5F83e9687ffA47C573' }
/** Venus vUSDT and vUSDC: their Borrow events name accounts that took a loan in the last hours. */
const VTOKENS = ['0xfD5840Cd36d94D7229439859C0112a4185BC0255', '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8'] as const
const BORROW = parseAbiItem('event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)')

/** Accounts that borrowed recently on Venus, newest first, read from chain logs in small windows. */
async function recentBorrowers(client: PublicClient, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted()
  const head = await client.getBlockNumber()
  const out: string[] = []
  for (let i = 0; i < 16 && out.length < 60; i++) {
    signal.throwIfAborted()
    const toBlock = head - BigInt(i * 2000)
    const logs = await client.getLogs({ address: [...VTOKENS], event: BORROW, fromBlock: toBlock - 1999n, toBlock }).catch(() => [])
    for (const l of [...logs].reverse()) { const b = (l.args as { borrower?: string }).borrower; if (b) out.push(b.toLowerCase()) }
  }
  return [...new Set(out)]
}

async function build(): Promise<LiveExamples> {
  // Match the existing HTTP budget, and cancel the underlying RPCs as well.
  // A timed-out scan must not keep walking borrowers behind later requests.
  const signal = AbortSignal.timeout(25_000)
  const client = publicClient(signal) as PublicClient
  // Venus accounts: the published case first, then the accounts earlier health factor hires named (most asked first).
  const asked = rowsOf(await db().execute(sql`
    select lower(m[1]) as address, count(*) as n
    from hire_intent i join agent_category c on c.agent_id = i.agent_id and c.category = 'health_factor'
    cross join lateral regexp_matches(coalesce(i.description, ''), '(0x[0-9a-fA-F]{40})', 'g') m
    group by 1 order by 2 desc limit 16`).catch(() => []))
  const caseAccount = CASES.find((c) => c.testId === 'MCS-HF-1')?.subject['address']
  signal.throwIfAborted()
  const borrowers = await recentBorrowers(client, signal).catch(() => [] as string[])
  signal.throwIfAborted()
  const accounts = [...new Set([caseAccount, ...asked.map((r) => String(r['address'])), ...borrowers].filter((a): a is string => Boolean(a)).map((a) => a.toLowerCase()))]
  const loans: LoanExample[] = []
  for (const address of accounts.slice(0, 60)) {
    signal.throwIfAborted()
    if (loans.length >= 5) break
    const read = await venusReader(address as `0x${string}`, { client }).catch(() => null)
    if (!read || !read.ok) continue
    const borrowed = read.data.totalBorrowedUsd.value
    // A loan worth acting on: at least $1,000 borrowed, with a health factor a repay plan can matter to (below 3).
    const hf = read.data.healthFactor?.value ?? null
    if (!(borrowed >= 1000) || hf === null || hf >= 3) continue
    loans.push({ address, healthFactor: read.data.healthFactor?.value ?? null, borrowedUsd: Math.round(borrowed), block: read.blockNumber.toString() })
  }
  // PancakeSwap V3 positions: Marque's own, then the published case subjects.
  const rebCase = CASES.find((c) => c.testId === 'MCS-REB-1')?.subject
  // Positions earlier test cases were captured on, most used first: real third-party positions, published with the Standard.
  const used = rowsOf(await db().execute(sql`
    select subject->>'owner' as owner, subject->>'tokenId' as token_id, count(*) as n from conformance_case
    where test_id = 'MCS-REB-1' and subject ? 'owner' and subject ? 'tokenId' group by 1, 2 order by 3 desc limit 10`).catch(() => []))
  const seen = new Set<string>()
  const candidates = [MARQUE_POSITION, ...(rebCase ? [{ tokenId: rebCase['tokenId']!, owner: rebCase['owner']! }] : []),
    ...used.map((r) => ({ tokenId: String(r['token_id']), owner: String(r['owner']) })),
    ...REB_FALLBACK_SUBJECTS.map((s) => ({ tokenId: s['tokenId']!, owner: s['owner']! }))].filter((c) => !seen.has(c.tokenId) && seen.add(c.tokenId))
  const positions: PositionExample[] = []
  for (const c of candidates) {
    signal.throwIfAborted()
    if (positions.length >= 5) break
    const read = await pancakeV3Reader(c.owner as `0x${string}`, { client, tokenId: BigInt(c.tokenId) }).catch(() => null)
    const p = read && read.ok ? read.data.positions.find((x) => String(x.tokenId) === c.tokenId) : null
    if (!p || p.liquidity === '0') continue
    positions.push({ tokenId: c.tokenId, owner: c.owner, pair: `${p.token0.symbol}/${p.token1.symbol}`, inRange: p.inRange.value === 1, block: read!.ok ? read!.blockNumber.toString() : '' })
  }
  signal.throwIfAborted()
  return { loans, positions, readAt: new Date().toISOString() }
}

/** Fresh for ten minutes: positions move slowly next to a hire, and each read is several chain calls. */
export async function liveExamples(): Promise<LiveExamples> {
  return (await cachedProjection('hire:examples:v3', build, { freshMs: 10 * 60_000, timeoutMs: 25_000, staleWhileRevalidate: true, staleRefreshLeaseMs: 180_000 })).value
}
