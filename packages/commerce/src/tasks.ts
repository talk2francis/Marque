import { z } from 'zod'

/**
 * Category task schemas (SPEC-SUPPLY 4, invariant 42). One definition shared by the hire sheet's
 * TaskForm, the quote route and Tender: a hire cannot reach createJob until its task passes the
 * category's schema, and the sentence sent to the agent is composed from the validated fields,
 * so the quote names exactly this task.
 *
 * The sentences are the ones Marque's reference engines parse (apps/web/lib/hire-tasks.test.ts)
 * and the shapes third-party agents asked for in their own refusals (V4-04 diagnosis).
 */

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'a 0x address of 40 hex characters')
const positive = z.number().finite().positive()

export const TASK_CATEGORIES = ['health_factor', 'yield', 'grid', 'rebalancing', 'security'] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]
export const YIELD_ASSETS = ['USDT', 'USDC', 'FDUSD', 'U'] as const
export const GRID_PAIRS = ['BNB', 'BTCB', 'ETH', 'CAKE'] as const

export const TASK_SCHEMAS = {
  health_factor: z.object({
    address: addr,
    targetHf: z.number().finite().gt(1).lte(10).default(1.5),
    block: z.number().int().positive().optional(),
  }).strict(),
  yield: z.object({
    amount: positive,
    asset: z.enum(YIELD_ASSETS),
    holdingDays: z.number().int().positive().max(3650),
    currentAprPct: z.number().finite().min(0).max(1000).optional(),
    thresholdPp: z.number().finite().min(0).max(100).optional(),
  }).strict(),
  grid: z.object({
    pair: z.enum(GRID_PAIRS).optional(),
    pool: addr.optional(),
    capitalUsd: positive,
    lower: positive,
    upper: positive,
    levels: z.number().int().min(2).max(50).optional(),
    spacing: z.enum(['arithmetic', 'geometric']).optional(),
    stop: positive.optional(),
  }).strict()
    .refine((g) => Boolean(g.pair || g.pool), { message: 'a pair or a pool', path: ['pair'] })
    .refine((g) => g.upper > g.lower, { message: 'an upper price above the lower price', path: ['upper'] })
    .refine((g) => g.stop === undefined || g.stop < g.lower, { message: 'a stop below the lower price', path: ['stop'] }),
  rebalancing: z.object({
    positionId: z.string().regex(/^\d{1,12}$/).optional(),
    pool: addr.optional(),
    address: addr,
    targetRangePct: z.number().finite().gt(0).lte(50).optional(),
    policy: z.string().max(200).optional(),
  }).strict()
    .refine((r) => Boolean(r.positionId || r.pool), { message: 'a position number or a pool', path: ['positionId'] }),
  security: z.object({ token: addr }).strict(),
} as const

export type TaskFields<C extends TaskCategory> = z.infer<(typeof TASK_SCHEMAS)[C]>

/** Plain words for a missing or invalid field, as a buyer reads them. */
const FIELD_WORDS: Record<string, string> = {
  address: 'the wallet address', targetHf: 'a target health factor above 1', block: 'a block number',
  amount: 'the amount', asset: 'the stablecoin (USDT, USDC, FDUSD or U)', holdingDays: 'how many days you will hold it',
  currentAprPct: 'your current yield', thresholdPp: 'the minimum improvement',
  pair: 'a pair or a pool', pool: 'a pool address', capitalUsd: 'the capital in USD', lower: 'a lower price', upper: 'an upper price above the lower price',
  levels: 'between 2 and 50 levels', spacing: 'the spacing', stop: 'a stop below the lower price',
  positionId: 'a position number or a pool', targetRangePct: 'a range width between 0 and 50%', policy: 'a shorter policy',
  token: 'the token contract address',
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))))

/** The sentence the agent receives, composed from validated fields only. */
export function taskSentence(category: TaskCategory, f: Record<string, unknown>): string {
  switch (category) {
    case 'health_factor':
      return `What is the health factor of Venus account ${f['address']} and what repay restores it to ${fmt(Number(f['targetHf'] ?? 1.5))}?${f['block'] ? ` Read at block ${f['block']}.` : ''}`
    case 'yield': {
      const extra = [
        `Holding period: ${f['holdingDays']} days.`,
        f['currentAprPct'] !== undefined ? `Currently earning ${fmt(Number(f['currentAprPct']))}%.` : null,
        f['thresholdPp'] !== undefined ? `Recommend a move only if it beats that by at least ${fmt(Number(f['thresholdPp']))} percentage points after costs.` : null,
      ].filter(Boolean).join(' ')
      return `Where should ${fmt(Number(f['amount']))} ${f['asset']} earn the most on BNB Chain right now, after switching costs? ${extra}`
    }
    case 'grid': {
      const market = f['pair'] ? `${f['pair']}/USDT` : `the PancakeSwap pool ${f['pool']}`
      return `Plan a ${f['levels'] ?? 10}-level grid for ${market} between ${fmt(Number(f['lower']))} and ${fmt(Number(f['upper']))} with ${fmt(Number(f['capitalUsd']))} USDT${f['stop'] !== undefined ? `, stop below ${fmt(Number(f['stop']))}` : ''}${f['spacing'] ? `, ${f['spacing']} spacing` : ''}.`
    }
    case 'rebalancing': {
      const what = f['positionId'] ? `My PancakeSwap V3 position #${f['positionId']}` : `My liquidity in the PancakeSwap V3 pool ${f['pool']}`
      return `${what}, owned by ${f['address']}, may have drifted. Re-centre it at ±${fmt(Number(f['targetRangePct'] ?? 5))}% around the current price.${f['policy'] ? ` Policy: ${String(f['policy'])}` : ''}`
    }
    case 'security':
      return `Review token ${f['token']} for risky approvals and privileged functions.`
  }
}

export type TaskCheck = { ok: true; category: TaskCategory; fields: Record<string, unknown>; sentence: string } | { ok: false; missing: string[] }

/** Validate one category's fields. `missing` names every problem in plain words, never a schema path. */
export function validateTask(category: string, input: unknown): TaskCheck {
  if (!(TASK_CATEGORIES as readonly string[]).includes(category)) return { ok: false, missing: ['a supported category'] }
  const c = category as TaskCategory
  const r = (TASK_SCHEMAS[c] as z.ZodTypeAny).safeParse(input ?? {})
  if (!r.success) {
    const words = [...new Set(r.error.issues.map((i) => FIELD_WORDS[String(i.path[0] ?? '')] ?? (i.code === 'unrecognized_keys' ? 'only the fields this category uses' : i.message)))]
    return { ok: false, missing: words }
  }
  const fields = r.data as Record<string, unknown>
  return { ok: true, category: c, fields, sentence: taskSentence(c, fields) }
}

/**
 * A complete, public example per category, for quote probes: no user data, nothing private.
 * The account is the Standard's MCS-HF-1 subject; the position is Marque's own proof-run LP.
 */
export const EXAMPLE_ACCOUNT = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
export const EXAMPLE_TASKS: Record<TaskCategory, Record<string, unknown>> = {
  health_factor: { address: EXAMPLE_ACCOUNT, targetHf: 1.5 },
  yield: { amount: 1000, asset: 'USDT', holdingDays: 30, currentAprPct: 0 },
  grid: { pair: 'BNB', lower: 560, upper: 680, capitalUsd: 500, levels: 10 },
  rebalancing: { positionId: '7367728', address: '0x2e010AaDFdFEbC2AdFCAFA5F83e9687ffA47C573', targetRangePct: 10 },
  security: { token: '0x55d398326f99059fF775485246999027B3197955' },
}

export function exampleSentence(category: string): string | null {
  const c = category as TaskCategory
  return (TASK_CATEGORIES as readonly string[]).includes(category) ? taskSentence(c, (TASK_SCHEMAS[c] as z.ZodTypeAny).parse(EXAMPLE_TASKS[c]) as Record<string, unknown>) : null
}
