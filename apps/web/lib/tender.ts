import 'server-only'
import { criteriaFor } from '@marque/conformance/criteria'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, tender as tenderTable, tenderQuote } from '@marque/db'
import { quoteForBuyer, sellerFor, validateTask, HireError, LANE_CHAIN, type Lane, type PublicQuote } from '@marque/commerce'
import { engineFor } from '@marque/agent-engines'
import { marketplaceAgents } from './marketplace'
import type { MarketRow } from '../app/register/market-model'
import { pickCandidates, taskShape } from './tender-rules'
export { pickCandidates, taskShape, evidenceRank, TENDER_MAX } from './tender-rules'

/**
 * Tender (SPEC-SUPPLY 5): one task, quotes from every compatible agent at once.
 *
 * Candidates are the category's live, quote-capable listings on one lane, best evidence first
 * (Warranted, then delivered jobs, then tested), at most one per operator and at most two Marque
 * reference agents, eight in all. Each is asked in parallel through the same verified quote path
 * as the hire sheet (10 s each, 12 s overall); a priced answer is a real quote the buyer can hire
 * with as is. Every tender and every answer, priced or not, is stored as a first-party observation.
 */

export const TENDER_PER_AGENT_MS = 10_000
export const TENDER_DEADLINE_MS = 12_000

export interface TenderAgent {
  agentId: string
  tokenId: string | null
  chainId: number
  name: string
  operator: string | null
  isReference: boolean
  warrant: MarketRow['warrant']
  delivered: number
  medianSeconds: number | null
  rating: { stars: number | null; count: number }
}

export type TenderEvent =
  | { type: 'start'; tenderId: string; category: string; lane: Lane; chainId: number; task: string; asked: TenderAgent[] }
  | { type: 'quote'; agentId: string; ms: number; quote: PublicQuote & { assumptions?: string[] } }
  | { type: 'declined'; agentId: string; ms: number; reason: string }
  | { type: 'failed'; agentId: string; ms: number; reason: string }
  | { type: 'done'; tenderId: string; asked: number; priced: number; declined: number; failed: number; ms: number }

const words = (e: unknown) => (e instanceof HireError ? e.message : 'The agent could not be reached for a price.')

export async function* runTender(input: { category: string; fields: unknown; lane: Lane; source?: 'web' | 'api' | 'mcp' }): AsyncGenerator<TenderEvent> {
  const started = Date.now()
  const check = validateTask(input.category, input.fields)
  if (!check.ok) throw new HireError('task_incomplete', `This task needs ${check.missing.join(' and ')}.`, 422)
  const chainId = LANE_CHAIN[input.lane]
  const { rows } = await marketplaceAgents({ category: input.category, lane: input.lane, limit: 60, sort: 'best' })
  const live = rows.filter((r) => r.commerce.serviceId !== null && r.commerce.state !== 'unavailable' && r.commerce.state !== 'preview_only' && r.liveness !== 'down' && !r.hireBlockedReason)
  const picked = pickCandidates(live)
  const asked: TenderAgent[] = picked.map((r) => ({
    agentId: r.agentId, tokenId: r.tokenId, chainId, name: r.name, operator: r.ownerLabel, isReference: r.isReference,
    warrant: r.warrant, delivered: r.track.jobs.delivered, medianSeconds: r.track.delivery.medianSeconds,
    rating: { stars: r.track.verified.averageStars, count: r.track.verified.count },
  }))
  const [row] = await db().insert(tenderTable).values({
    category: check.category, chainId, taskHash: createHash('sha256').update(check.sentence).digest('hex'),
    shape: taskShape(check.category, check.fields), asked: asked.length, source: input.source ?? 'web',
  }).returning({ id: tenderTable.id })
  const tenderId = row!.id
  yield { type: 'start', tenderId, category: check.category, lane: input.lane, chainId, task: check.sentence, asked }

  // Every agent is asked at once; answers are yielded in the order they arrive.
  const queue: TenderEvent[] = []
  let wake: (() => void) | null = null
  const push = (e: TenderEvent) => { queue.push(e); wake?.() }
  let pending = picked.length
  const counts = { priced: 0, declined: 0, failed: 0 }
  const settle = async (r: MarketRow) => {
    const t0 = Date.now()
    const record = (v: { ok: boolean; outcome: 'priced' | 'declined' | 'failed' | 'timeout'; detail?: string | null; quoteId?: number | null; priceRaw?: string | null; tokenSymbol?: string | null; signed?: boolean | null }) =>
      db().insert(tenderQuote).values({ tenderId, agentId: r.agentId, serviceId: r.commerce.serviceId, latencyMs: Date.now() - t0, ...v }).catch(() => undefined)
    try {
      const work = (async () => {
        const seller = await sellerFor(r.agentId, r.commerce.serviceId)
        const engine = seller.firstParty ? engineFor(seller.firstParty.slug) : null
        const inspected = engine?.inspect(check.sentence) ?? { missing: [], assumptions: [] }
        if (inspected.missing.length) throw new HireError('task_incomplete', `${seller.name} needs ${inspected.missing.join(' and ')} in the task.`, 422)
        const q = await quoteForBuyer(r.agentId, r.commerce.serviceId, {
          task_description: check.sentence,
          terms: {
            deliverables: 'Complete the task as described, with the result delivered on chain.', quality_standards: 'Figures read from BNB Chain at delivery time, with sources.',
            ...(process.env['MARQUE_TERMS_CRITERIA'] === '1' && criteriaFor(seller.category).length ? { success_criteria: criteriaFor(seller.category).map((c) => c.text) } : {}),
          },
        }, 2)
        return { ...q, assumptions: inspected.assumptions }
      })()
      const q = await Promise.race([work, new Promise<never>((_, rej) => setTimeout(() => rej(new HireError('timeout', `No answer in ${TENDER_PER_AGENT_MS / 1000} s.`, 504)), TENDER_PER_AGENT_MS))])
      if (q.chainId !== chainId) throw new HireError('wrong_lane', 'It priced the task on the other network.', 422)
      counts.priced++
      await record({ ok: true, outcome: 'priced', quoteId: q.quoteId, priceRaw: q.price, tokenSymbol: q.token.symbol, signed: q.signed })
      push({ type: 'quote', agentId: r.agentId, ms: Date.now() - t0, quote: q })
    } catch (e) {
      const code = e instanceof HireError ? e.code : 'unreachable'
      const declined = code === 'quote_declined' || code === 'task_incomplete'
      if (declined) counts.declined++; else counts.failed++
      await record({ ok: false, outcome: declined ? 'declined' : code === 'timeout' ? 'timeout' : 'failed', detail: words(e).slice(0, 300) })
      push({ type: declined ? 'declined' : 'failed', agentId: r.agentId, ms: Date.now() - t0, reason: words(e) })
    } finally {
      pending--
      wake?.()
    }
  }
  for (const r of picked) void settle(r as MarketRow)
  const deadline = started + TENDER_DEADLINE_MS
  while (pending > 0 || queue.length) {
    if (queue.length) { yield queue.shift()!; continue }
    const left = deadline - Date.now()
    if (left <= 0) break
    await new Promise<void>((res) => { wake = res; setTimeout(res, Math.min(left, 500)) })
    wake = null
  }
  const ms = Date.now() - started
  await db().execute(sql`update tender set priced = ${counts.priced}, declined = ${counts.declined}, failed = ${counts.failed + pending}, duration_ms = ${ms} where id = ${tenderId}`).catch(() => undefined)
  yield { type: 'done', tenderId, asked: picked.length, priced: counts.priced, declined: counts.declined, failed: counts.failed + pending, ms }
}
