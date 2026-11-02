import { publicClient } from '@marque/chain'
import { CASES, REB_FALLBACK_SUBJECTS } from './cases.js'
import { firstCapturable, observeCase } from './harness.js'
import type { LensCheck } from './lens-checks.js'
import type { TestId } from './tolerances.js'
import type { TestCase } from './types.js'

/**
 * The daily check call (V4.4 P1): one read-only question to a listed agent through its public free path, its answer read
 * in whatever layout it chose, and the chain facts it states compared with the chain. Separate from the Standard (MCS):
 * nothing here grades layout, a missing field is never a fail, and the published tolerances are not changed.
 *
 * Verdicts: agree (every stated chain fact Marque could compare agreed), wrong (a stated fact was outside tolerance),
 * not_comparable (no stated fact could be compared, or the agent could not be asked), unreadable (it answered, but nothing
 * in the answer could be read for its category). Only "wrong" is a fail.
 */
export type CheckVerdict = 'agree' | 'wrong' | 'not_comparable' | 'unreadable'

export const CHECK_TEST: Readonly<Record<string, TestId | undefined>> = {
  rebalancing: 'MCS-REB-1', grid: 'MCS-GRID-1', yield: 'MCS-YIELD-1', health_factor: 'MCS-HF-1',
}

/** A tool that changes state, unless it says it only plans, quotes, previews or reports. */
const WRITES = /send|swap|repay|supply|withdraw|execute|transfer|approve|mint|burn|deposit|trade/i
const READS = /plan|quote|preview|report/i
export function isReadOnlyTool(tool: { name?: string; description?: string }): boolean {
  const text = `${tool.name ?? ''} ${tool.description ?? ''}`
  return !WRITES.test(text) || READS.test(text)
}

/**
 * The category's question at a block a little behind the head: an agent reading through a lagging node must not be asked
 * about a block it cannot see yet (one refused a test for exactly that, 25 Oct). Observed only, never stored as a case.
 */
export async function observeCheckCase(category: string, lagBlocks = 30n): Promise<TestCase | null> {
  const testId = CHECK_TEST[category]
  const spec = testId ? CASES.find((c) => c.testId === testId) : undefined
  if (!testId || !spec) return null
  const head = await publicClient().getBlockNumber()
  const blockNumber = head - lagBlocks
  const id = `check-${testId}-${blockNumber}`
  const subjects = testId === 'MCS-REB-1' ? [spec.subject, ...REB_FALLBACK_SUBJECTS] : [spec.subject]
  const observed = await firstCapturable(subjects, (subject) => observeCase({ id, testId, subject, policy: spec.policy, blockNumber }))
  return observed.testCase
}

const num = (s: string | null): number | null => {
  const m = s?.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

/**
 * The verdict from Marque's checks of one answer. `pinned`: the answer named its block, so every chain check ran at that
 * block with the Standard's tolerance. Otherwise the checks ran at the case block and a fresh answer gets the aged
 * tolerance: a tick within one tick spacing, a health factor within 0.02 (0.05 once the answer is over an hour old).
 */
export function checkVerdict(checks: readonly LensCheck[], opts: { pinned: boolean; ageSeconds?: number; tickSpacing?: number | null; readable: boolean }): { verdict: CheckVerdict; checks: LensCheck[] } {
  const hfTolerance = (opts.ageSeconds ?? 0) > 3600 ? 0.05 : 0.02
  const judged = checks.map((c): LensCheck => {
    if (c.how !== 'chain' || c.state !== 'differs' || opts.pinned) return c
    const a = num(c.agent), m = num(c.marque)
    if (a === null || m === null) return c
    const within = c.key === 'hf' ? Math.abs(a - m) <= hfTolerance
      : c.key === 'tick' ? Math.abs(a - m) <= (opts.tickSpacing ?? 1)
        : false
    return within ? { ...c, state: 'match', detail: `${c.detail ?? ''}${c.detail ? '; ' : ''}answer named no block, compared with the aged tolerance` } : c
  })
  const chain = judged.filter((c) => c.how === 'chain' && (c.state === 'match' || c.state === 'differs'))
  if (chain.some((c) => c.state === 'differs')) return { verdict: 'wrong', checks: judged }
  if (chain.length) return { verdict: 'agree', checks: judged }
  return { verdict: opts.readable ? 'not_comparable' : 'unreadable', checks: judged }
}
