import { sql } from 'drizzle-orm'
import { db, agentCategory, type Category } from '@marque/db'
import { classifyByKeyword, type ClassificationInput } from './taxonomy.js'
import { mapLimit } from './concurrency.js'

/**
 * The classifier.
 *
 * Pass 1 is deterministic, free and auditable (see taxonomy.ts). Pass 2 sends
 * only what pass 1 could not decide AND that has a live endpoint to an LLM,
 * because classifying an agent nobody can call is spend with no product value.
 *
 * Every label stores its method, confidence and rationale, so a surprising
 * classification can always be explained to the person whose money it affects.
 */

export interface ClassifyResult {
  examined: number
  classified: number
  unclassified: number
  byCategory: Record<string, number>
  llmCalls: number
  llmUsdSpent: number
}

interface Row {
  id: string
  name: string | null
  description: string | null
  tags: string[]
  skills: string[]
}

/**
 * Agents to classify: everything with metadata that has no label yet.
 * Skills come from the most recent probe, because a live endpoint's own
 * declared skills are far better classification evidence than registry copy.
 */
async function candidates(limit: number, onlyLive: boolean): Promise<Row[]> {
  const d = db()
  const liveFilter = onlyLive
    ? sql`and exists (select 1 from probe p where p.agent_id = a.id and p.liveness = 'live')`
    : sql``
  const rows = await d.execute(sql`
    select a.id, a.name, a.description, a.tags,
           coalesce((
             select p.skills from probe p
             where p.agent_id = a.id and jsonb_array_length(p.skills) > 0
             order by p.checked_at desc limit 1
           ), '[]'::jsonb) as skills
    from agent a
    where a.chain_id = 56
      and not exists (select 1 from agent_category c where c.agent_id = a.id)
      and (a.name is not null or a.description is not null or jsonb_array_length(a.tags) > 0)
      ${liveFilter}
    limit ${limit}
  `)
  const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
  return (list as Array<Record<string, unknown>>).map((r) => ({
    id: String(r['id']),
    name: (r['name'] as string | null) ?? null,
    description: (r['description'] as string | null) ?? null,
    tags: Array.isArray(r['tags']) ? (r['tags'] as string[]) : [],
    skills: Array.isArray(r['skills']) ? (r['skills'] as string[]) : [],
  }))
}

async function writeLabel(
  agentId: string,
  category: Category,
  confidence: number,
  method: 'keyword' | 'semantic' | 'owner_declared',
  rationale: string,
): Promise<void> {
  const d = db()
  await d.insert(agentCategory).values({
    agentId, category, confidence, method, rationale: rationale.slice(0, 500),
  }).onConflictDoUpdate({
    target: [agentCategory.agentId, agentCategory.category],
    set: {
      confidence: sql`excluded.confidence`,
      method: sql`excluded.method`,
      rationale: sql`excluded.rationale`,
      assignedAt: sql`now()`,
    },
  })
}

/**
 * Pass 2 candidates: live agents whose only label is `unclassified`. Pass 1
 * has already run to exhaustion, so the remaining gain is here.
 */
async function semanticCandidates(limit: number): Promise<Row[]> {
  const rows = await db().execute(sql`
    select a.id, a.name, a.description, a.tags,
           coalesce((
             select p.skills from probe p
             where p.agent_id = a.id and jsonb_array_length(p.skills) > 0
             order by p.checked_at desc limit 1
           ), '[]'::jsonb) as skills
    from agent a
    join agent_category c on c.agent_id = a.id and c.category = 'unclassified'
    where a.chain_id = 56
      and exists (select 1 from probe p where p.agent_id = a.id and p.liveness = 'live')
      and (a.name is not null or a.description is not null or jsonb_array_length(a.tags) > 0)
    limit ${limit}
  `)
  const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
  return (list as Array<Record<string, unknown>>).map((r) => ({
    id: String(r['id']),
    name: (r['name'] as string | null) ?? null,
    description: (r['description'] as string | null) ?? null,
    tags: Array.isArray(r['tags']) ? (r['tags'] as string[]) : [],
    skills: Array.isArray(r['skills']) ? (r['skills'] as string[]) : [],
  }))
}

const SEMANTIC_CATEGORIES = ['rebalancing', 'grid', 'yield', 'health_factor', 'security', 'unclassified'] as const

/**
 * DeepSeek pricing (per 1M tokens) for the running cost estimate against the
 * cap. `deepseek-chat` is currently the only funded provider — Anthropic's org
 * is disabled and OpenAI is out of credits (see docs/DEVIATIONS.md D10.5C-02).
 */
const LLM_BASE = process.env['LLM_BASE_URL'] ?? 'https://api.deepseek.com'
const LLM_MODEL = process.env['LLM_MODEL'] ?? 'deepseek-chat'
const LLM_USD_IN = Number(process.env['LLM_USD_IN'] ?? 0.28)
const LLM_USD_OUT = Number(process.env['LLM_USD_OUT'] ?? 0.42)

interface SemanticVerdict { category: Category; confidence: number; reason: string }

async function askModel(row: Row, apiKey: string): Promise<{ verdict: SemanticVerdict | null; usd: number }> {
  const meta = JSON.stringify({
    name: row.name, description: row.description,
    tags: row.tags.slice(0, 12), skills: row.skills.slice(0, 12),
  }).slice(0, 1800)
  const system =
    'You classify a BNB Chain agent into exactly one category from: '
    + 'rebalancing (manages a concentrated-liquidity / LP range), '
    + 'grid (plans a grid-trading strategy), '
    + 'yield (routes idle capital between lending/farming venues), '
    + 'health_factor (monitors a lending position\'s liquidation risk), '
    + 'security (contract / approval risk triage), '
    + 'or unclassified if none clearly fits. '
    + 'Reply ONLY with minified JSON: {"category":"...","confidence":0-1,"reason":"<12 words"}. '
    + 'Prefer unclassified over a weak guess — a wrong category recommends the wrong agent for someone\'s money.'

  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 120,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: meta },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const body = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const usd =
    ((body.usage?.prompt_tokens ?? 0) / 1e6) * LLM_USD_IN
    + ((body.usage?.completion_tokens ?? 0) / 1e6) * LLM_USD_OUT
  const text = body.choices?.[0]?.message?.content ?? ''
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return { verdict: null, usd }
  try {
    const parsed = JSON.parse(m[0]) as Record<string, unknown>
    const category = String(parsed['category'] ?? '')
    if (!SEMANTIC_CATEGORIES.includes(category as (typeof SEMANTIC_CATEGORIES)[number])) return { verdict: null, usd }
    const confidence = Math.max(0, Math.min(1, Number(parsed['confidence'] ?? 0)))
    return { verdict: { category: category as Category, confidence, reason: String(parsed['reason'] ?? '').slice(0, 200) }, usd }
  } catch {
    return { verdict: null, usd }
  }
}

/**
 * Pass 2 — one Haiku call per live, still-unclassified agent, batched, stopped
 * at `usdCap` (default DAILY_LLM_USD_CAP). A confident real category replaces
 * the `unclassified` label; anything else is left as it was.
 */
export async function classifySemanticPass(opts: {
  limit?: number
  usdCap?: number
  minConfidence?: number
} = {}): Promise<ClassifyResult> {
  const limit = opts.limit ?? 3000
  const usdCap = opts.usdCap ?? Number(process.env['DAILY_LLM_USD_CAP'] ?? 5)
  const minConfidence = opts.minConfidence ?? 0.6
  const apiKey = process.env['LLM_API_KEY'] ?? process.env['DEEPSEEK_API_KEY']
  if (!apiKey) throw new Error('LLM_API_KEY / DEEPSEEK_API_KEY is not set')

  const rows = await semanticCandidates(limit)
  const result: ClassifyResult = {
    examined: 0, classified: 0, unclassified: 0, byCategory: {}, llmCalls: 0, llmUsdSpent: 0,
  }
  let stop = false

  await mapLimit(rows, 4, async (row) => {
    if (stop) return
    result.examined++
    let out
    try {
      out = await askModel(row, apiKey)
    } catch {
      return
    }
    result.llmCalls++
    result.llmUsdSpent += out.usd
    if (result.llmUsdSpent >= usdCap) stop = true

    const v = out.verdict
    if (!v || v.category === 'unclassified' || v.confidence < minConfidence) {
      result.unclassified++
      return
    }
    // Replace the escape-hatch label with the real one.
    await db().execute(sql`delete from agent_category where agent_id = ${row.id} and category = 'unclassified'`)
    await writeLabel(row.id, v.category, v.confidence, 'semantic', v.reason)
    result.classified++
    result.byCategory[v.category] = (result.byCategory[v.category] ?? 0) + 1
  })

  return result
}

/** Pass 1 across every unlabelled agent with metadata. */
export async function classifyKeywordPass(limit = 5000): Promise<ClassifyResult> {
  const rows = await candidates(limit, false)
  const result: ClassifyResult = {
    examined: rows.length, classified: 0, unclassified: 0, byCategory: {}, llmCalls: 0, llmUsdSpent: 0,
  }

  await mapLimit(rows, 8, async (row) => {
    const input: ClassificationInput = {
      name: row.name, description: row.description, tags: row.tags, skills: row.skills,
    }
    const c = classifyByKeyword(input)
    await writeLabel(row.id, c.category, c.confidence, 'keyword', c.rationale)
    if (c.category === 'unclassified') result.unclassified++
    else result.classified++
    result.byCategory[c.category] = (result.byCategory[c.category] ?? 0) + 1
  })

  return result
}
