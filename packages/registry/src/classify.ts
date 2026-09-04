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
