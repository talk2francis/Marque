import { createHash } from 'node:crypto'

/**
 * The Ledger rubric.
 *
 * MCS tests facts. The Ledger tests JUDGEMENT — and judgement cannot be graded
 * by assertion, which is exactly why it is dangerous. A rubric written after
 * the results are in is not a rubric, it is a rationalisation, and every
 * "our agent beat a human" claim in this industry is one.
 *
 * So the rubric is PRE-REGISTERED and VERSION-HASHED before any benchmark runs.
 * The hash is published with every result. If the rubric changes, the hash
 * changes, and a reader can tell instantly that a later result was graded by a
 * different yardstick than an earlier one.
 *
 * Three rules make the grading honest rather than merely documented:
 *
 *  1. **Blind.** Source labels are stripped before scoring. A grader who knows
 *     which arm is the agent is not grading the output, they are grading their
 *     expectation of it.
 *  2. **Wall clock.** Elapsed time is measured, never estimated. An estimated
 *     duration presented as a measurement is escalation gate 4.
 *  3. **Itemized cost.** Gas and LLM spend are separate lines. A single figure
 *     hides which one actually decides the answer at the buyer's size.
 */

export interface RubricCriterion {
  id: string
  name: string
  /** What a full-marks answer contains. Written before any answer exists. */
  standard: string
  /** Points available. The weights ARE the argument about what matters. */
  points: number
}

export interface Rubric {
  version: string
  category: string
  criteria: RubricCriterion[]
  /** Every criterion's points, summed. Published so a score is legible. */
  total: number
  notes: string[]
}

/**
 * The criteria shared by every benchmark.
 *
 * Correctness dominates deliberately. An answer that is fast, cheap, beautifully
 * explained and WRONG is worth less than nothing in this domain: it is a
 * confident wrong number that someone acts on.
 */
const COMMON: RubricCriterion[] = [
  {
    id: 'correct',
    name: 'Correctness',
    standard:
      'Every stated number is right against chain state at the pinned block, within the tolerance the published MCS test uses for that field. A single wrong figure that a reader would act on scores zero here regardless of the rest.',
    points: 40,
  },
  {
    id: 'complete',
    name: 'Completeness',
    standard:
      'Every field the task asked for is present. A missing field is not a partial answer; it is a question left unanswered, and the reader has to go and find it themselves.',
    points: 15,
  },
  {
    id: 'sourced',
    name: 'Provenance',
    standard:
      'Every number names where it came from — a contract read, a block, a timestamp — so a reader can check it without trusting the author. An unsourced figure scores zero on this criterion even when it is correct.',
    points: 15,
  },
  {
    id: 'actionable',
    name: 'Actionability',
    standard:
      'The output can be executed as written: the amounts are in the right units, the ticks are legal, the venue is named, the risks that would stop execution are stated. A correct analysis that cannot be acted on is a report, not a decision.',
    points: 15,
  },
  {
    id: 'honest',
    name: 'Stated limits',
    standard:
      'The answer says what it does not know, what it assumed, and what would change the conclusion. Confidence unearned by evidence is penalised here; so is hedging that avoids committing to a number the task asked for.',
    points: 15,
  },
]

const CATEGORY_NOTES: Record<string, string[]> = {
  security: [
    'A "safe" verdict is never full marks. The correct output of a triage is what was found and what the method cannot see.',
    'A finding without an exploit path scores at most half on actionability: severity without a mechanism is an adjective.',
  ],
  rebalancing: [
    'Proposed ticks that are not multiples of the pool spacing score zero on actionability: the plan cannot execute.',
    'A slippage bound must be stated. Its absence is an incomplete answer, not a neutral omission.',
  ],
  yield: [
    'A gross APR quoted where the task asked for net scores zero on correctness. They are different numbers and the difference is the whole question.',
    'Declining to recommend a move, when nothing clears the stated threshold, is a full-marks answer.',
  ],
  health_factor: [
    'The repayment must actually restore the target when applied. An answer that is close but does not reach the target is wrong, not approximate.',
  ],
}

export function buildRubric(category: string, version = '1.0'): Rubric {
  const criteria = COMMON
  return {
    version,
    category,
    criteria,
    total: criteria.reduce((s, c) => s + c.points, 0),
    notes: [
      'Graded BLIND: source labels are stripped from both arms before scoring.',
      'Elapsed time is wall clock, measured, never estimated.',
      'Cost is itemized: gas and LLM spend are separate lines.',
      ...(CATEGORY_NOTES[category] ?? []),
    ],
  }
}

/**
 * The version hash, computed over the canonical rubric.
 *
 * This is what gets written into every manifest. Two results carrying different
 * rubric hashes were not graded by the same standard and must not be compared,
 * and publishing the hash is how a reader finds that out without taking our
 * word for it.
 */
export function rubricHash(rubric: Rubric): string {
  const canonical = JSON.stringify({
    version: rubric.version,
    category: rubric.category,
    criteria: [...rubric.criteria]
      .map((c) => ({ id: c.id, standard: c.standard, points: c.points }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    notes: [...rubric.notes].sort(),
  })
  return `0x${createHash('sha256').update(canonical).digest('hex')}`
}

export interface ScoreBreakdown {
  /** criterion id -> points awarded. */
  awarded: Record<string, number>
  total: number
  outOf: number
  /** One line per criterion saying why, written against the standard. */
  reasons: Record<string, string>
}

export function scoreTotal(rubric: Rubric, awarded: Record<string, number>): ScoreBreakdown {
  const clean: Record<string, number> = {}
  for (const c of rubric.criteria) {
    const raw = awarded[c.id] ?? 0
    clean[c.id] = Math.max(0, Math.min(c.points, raw))
  }
  return {
    awarded: clean,
    total: Object.values(clean).reduce((s, n) => s + n, 0),
    outOf: rubric.total,
    reasons: {},
  }
}
