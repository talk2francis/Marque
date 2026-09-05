/**
 * The benchmarks, pre-registered.
 *
 * Each names a real subject on BNB Smart Chain, a task both arms answer
 * identically, and a method paragraph that says what would falsify the result.
 * They are written HERE, in code, before any arm runs, and the rubric is hashed
 * with them — so the standard cannot drift once the numbers start arriving.
 *
 * The comparison is deliberately narrow: an agent against a competent analyst
 * doing the same task by hand, twice each, on the same chain state. It is not
 * a claim that agents are better than people. It is a measurement of one task,
 * with the working shown, which is more than this industry usually manages.
 */

export interface BenchmarkSpec {
  id: string
  title: string
  category: string
  agentId: string
  agentName: string
  /** The task text, verbatim, given to BOTH arms. */
  task: (ctx: { block: string }) => string
  /** Pinned inputs, hashed so both arms provably saw the same thing. */
  input: Record<string, unknown>
  /** What this measures, and what would falsify it. Published on /ledger. */
  method: string
  /** Mandatory benchmarks run first; the stretch one is cut under pressure. */
  mandatory: boolean
}

const DEMO = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
const LP_OWNER = '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD'
/** BSC-USD. Chosen because it is real, widely held, and genuinely privileged. */
const BSC_USD = '0x55d398326f99059fF775485246999027B3197955'

export const BENCHMARKS: readonly BenchmarkSpec[] = [
  {
    id: 'ADV-01',
    title: 'Security triage of a live BSC contract',
    category: 'security',
    agentId: 'marque:redcell',
    agentName: 'Redcell',
    input: { subject: BSC_USD, kind: 'contract-triage' },
    task: ({ block }) => [
      `Triage the BNB Smart Chain contract ${BSC_USD} for the risks that would affect someone holding or approving this token.`,
      `Chain: BNB Smart Chain (56). Block: ${block}.`,
      '',
      'Cover, at minimum: whether the contract is upgradeable and by whom; whether a privileged party can mint, pause, blacklist or change fees; and what a holder is exposed to if that party is compromised.',
      'For every claim, say how you established it. State explicitly what your method cannot see.',
    ].join('\n'),
    method: [
      'A high-stakes triage on a contract with real money behind it, chosen because it is genuinely privileged rather than because it flatters either arm — BSC-USD is upgradeable-adjacent, owner-controlled and holds billions.',
      'Both arms answer at the same block. The agent reads deployed bytecode and storage slots; the manual arm may use any tool, including BscScan and the verified source, which is an advantage the agent does not have.',
      'FALSIFIED IF: the agent reports a privilege the contract does not have, or misses one that a reader of the verified source finds in the manual arm.',
    ].join(' '),
    mandatory: true,
  },
  {
    id: 'ADV-02',
    title: 'A V3 re-centre decision on a live position',
    category: 'rebalancing',
    agentId: 'marque:bound',
    agentName: 'Bound',
    input: { subject: LP_OWNER, tokenId: '7321916', rangePct: 6, feeTier: 2500 },
    task: ({ block }) => [
      `PancakeSwap V3 position NFT id 7321916 on BNB Smart Chain (chain 56).`,
      `Block: ${block} — answer for this block.`,
      '',
      'POLICY YOU MUST FOLLOW: re-centre the position symmetrically at ±6% around the current spot price, on the 0.25% fee tier, keeping the same liquidity.',
      '',
      'Report: the current tick, whether the position is in range, the percentage price move to the nearer bound, the proposed tick range, the token amounts required to mint it, and the slippage bound you would execute under.',
      'Proposed ticks must be multiples of the pool tick spacing.',
    ].join('\n'),
    method: [
      'The arithmetic has exactly one right answer at a given block, so this measures whether either arm can produce it quickly and legally.',
      'The decisive check is the tick spacing: a proposed tick that is not a multiple of the pool spacing makes the plan unexecutable, and it is the most common failure among agents on this chain.',
      'FALSIFIED IF: the agent proposes an illegal tick, or its amounts diverge from the V3 liquidity formula by more than 0.5%.',
    ].join(' '),
    mandatory: true,
  },
  {
    id: 'ADV-03',
    title: 'Best net route for 1,000 USDT',
    category: 'yield',
    agentId: 'marque:sluicegate',
    agentName: 'Sluicegate',
    input: { asset: 'USDT', sizeUsd: 1000, allowedProtocols: ['venus'], minImprovementBps: 50, currentAprPct: 0 },
    task: ({ block }) => [
      `Find the best net-of-cost route for 1,000 USD of USDT on BNB Smart Chain (chain 56).`,
      `Block: ${block} — answer for this block.`,
      '',
      'Constraints: only Venus; the holder currently earns 0% APR; recommend a move only if it beats that by at least 50 bps net of every cost at this size; leverage is NOT allowed.',
      '',
      'Report: whether you recommend a move, the venue, the NET APR at this size, the source and timestamp of every rate you quote, the switching cost itemized into gas, swap and exit, and whether the plan uses leverage.',
    ].join('\n'),
    method: [
      'The interesting quantity is net APR at a stated size, not a headline rate: the same gas is 0.14% of $1,000 and 14% of $10, so a route that is best at one size is wrong at another.',
      'Two live traps decide this benchmark. BSC blocks are 0.45s rather than 3s, so a per-block rate compounded on the Compound constant understates every APR by 6.7×; and Venus lists a dead market reporting 1.05e14% APR, which becomes the headline number unless it is excluded.',
      'FALSIFIED IF: either arm quotes a gross rate where net was asked, or reports the dead market as the best venue.',
    ].join(' '),
    mandatory: true,
  },
  {
    id: 'ADV-04',
    title: 'Exact repayment to restore a health factor',
    category: 'health_factor',
    agentId: 'marque:keel',
    agentName: 'Keel',
    input: { subject: DEMO, targetHealthFactor: 1.35 },
    task: ({ block }) => [
      `A Venus Core position on BNB Smart Chain (chain 56) held by ${DEMO}.`,
      `Block: ${block} — answer for this block.`,
      '',
      'Report the account’s current health factor to three decimals, the collateral factor of its largest collateral market, the liquidation price of that collateral, and the EXACT USD of debt that must be repaid to restore a health factor of 1.35.',
      'The repayment must actually reach 1.35 when applied.',
    ].join('\n'),
    method: [
      'The stretch benchmark. A single wrong number here is worse than no answer, because a liquidation price is acted on directly.',
      'A target of 1.35 is deliberately NOT the 2.5 the published MCS case uses: an agent whose target parser silently defaults would answer the case’s question instead of this one and score well for it. That exact bug has happened in this project once already.',
      'FALSIFIED IF: applying the stated repayment to the stated balances does not produce a health factor of 1.35 within 0.005.',
    ].join(' '),
    mandatory: false,
  },
]

export function benchmarkById(id: string): BenchmarkSpec | null {
  return BENCHMARKS.find((b) => b.id === id) ?? null
}
