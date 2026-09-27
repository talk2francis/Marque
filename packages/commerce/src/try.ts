import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { HireError, sellerFor } from './hire.js'

/**
 * Try an agent free (DESIGN-SYSTEM.md 8.3 and 8.4, "Try free").
 *
 * The buyer's own task goes to the exact service Hire would pay, as a plain A2A
 * `message/send` with no payment and no signature: an agent's free face. Marque's
 * reference agents answer it with the same engine their paid jobs run, so the free
 * answer is the answer a buyer would pay for. Third parties answer however they
 * answer; the reply is shown as theirs, never graded here.
 *
 * Nothing is stored and nothing moves on chain. The call goes through safeFetch
 * (SSRF guard, timeout, size cap) like every other call to an agent.
 */
export interface FreeAnswer {
  agentId: string
  agentName: string
  category: string | null
  /** The answer as structured data when the agent returned JSON, else null. */
  content: Record<string, unknown> | null
  /** The answer as text when it was not JSON (already trimmed, capped). */
  text: string | null
  latencyMs: number
  at: string
}

export class FreeTryError extends Error {
  constructor(public code: 'no_answer' | 'agent_error' | 'unreachable', message: string) { super(message) }
}

const MAX_TEXT = 6_000

/** The first text or data part anywhere in an A2A reply (message, task, artifacts). */
export function answerFromA2A(body: unknown): { content: Record<string, unknown> | null; text: string | null } | null {
  const seen = new Set<unknown>()
  let found: { content: Record<string, unknown> | null; text: string | null } | null = null
  const visit = (v: unknown, depth: number): void => {
    if (found || depth > 8 || v === null || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const o = v as Record<string, unknown>
    if (Array.isArray(o['parts'])) {
      for (const p of o['parts'] as Array<Record<string, unknown>>) {
        if (p && typeof p === 'object' && p['data'] && typeof p['data'] === 'object' && !Array.isArray(p['data'])) {
          found = { content: p['data'] as Record<string, unknown>, text: null }
          return
        }
        if (p && typeof p['text'] === 'string' && p['text'].trim()) {
          const t = (p['text'] as string).trim()
          try {
            const j = JSON.parse(t) as unknown
            if (j && typeof j === 'object' && !Array.isArray(j)) { found = { content: j as Record<string, unknown>, text: null }; return }
          } catch { /* plain text */ }
          found = { content: null, text: t.slice(0, MAX_TEXT) }
          return
        }
      }
    }
    for (const k of Object.keys(o)) visit(o[k], depth + 1)
  }
  visit(body, 0)
  if (found) return found
  // Some agents answer a plain message with a bare JSON-RPC result object (a catalog, a
  // status). It is their reply, so it is shown as text, never rendered as a graded answer.
  const result = (body as { result?: unknown } | null)?.result
  if (result && typeof result === 'object') return { content: null, text: JSON.stringify(result, null, 2).slice(0, MAX_TEXT) }
  if (typeof result === 'string' && result.trim()) return { content: null, text: result.trim().slice(0, MAX_TEXT) }
  return null
}

/**
 * Where to send a free task: the seller's own service when it sells through ERC-8183,
 * else the agent's A2A service our probe found live in the last 24 hours.
 */
export async function freeTarget(agentId: string): Promise<{ name: string; category: string | null; endpoint: string; firstPartySlug: string | null }> {
  try {
    const seller = await sellerFor(agentId, null)
    return { name: seller.name, category: seller.category, endpoint: seller.endpoint, firstPartySlug: seller.firstParty?.slug ?? null }
  } catch (err) {
    if (!(err instanceof HireError)) throw err
  }
  const r = await db().execute(sql`
    select coalesce(a.name, 'This agent') as name,
           (select category from agent_category c where c.agent_id = a.id order by (category <> 'unclassified') desc, confidence desc, assigned_at desc limit 1) as category,
           coalesce(p.executable_endpoint, s.resolved_endpoint, s.endpoint) as endpoint
    from agent a
    join agent_service s on s.agent_id = a.id and s.kind = 'a2a' and (s.is_template = false or s.resolved_endpoint is not null)
    join probe_schedule ps on ps.service_id = s.id
    join probe p on p.id = ps.last_probe_id
    where a.id = ${agentId} and p.liveness = 'live' and p.checked_at > now() - interval '24 hours'
    order by p.checked_at desc limit 1`)
  const row = (((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as Array<Record<string, unknown>>)[0]
  if (!row || !row['endpoint']) throw new HireError('no_free_face', 'This agent has no live A2A service to try free. Its record says why.', 404)
  return { name: String(row['name']), category: row['category'] ? String(row['category']) : null, endpoint: String(row['endpoint']), firstPartySlug: null }
}

export async function tryFree(agentId: string, task: string): Promise<FreeAnswer> {
  const seller = await freeTarget(agentId)
  const messageId = `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const started = Date.now()
  const res = await safeFetch(seller.endpoint, {
    method: 'POST',
    timeoutMs: 15_000,
    maxBytes: 512 * 1024,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: messageId, method: 'message/send',
      params: { message: { kind: 'message', role: 'user', messageId, parts: [{ kind: 'text', text: task }] } },
    }),
  })
  const latencyMs = Date.now() - started
  if (!res.ok) throw new FreeTryError('unreachable', `${seller.name} did not answer the free request.`)
  let body: unknown
  try { body = JSON.parse(res.body) } catch { throw new FreeTryError('no_answer', `${seller.name} answered, but not in a form Marque can read.`) }
  const err = (body as { error?: { message?: unknown } } | null)?.error
  if (err) {
    const why = typeof err.message === 'string' ? err.message.slice(0, 240) : null
    throw new FreeTryError('agent_error', why ? `${seller.name} declined the task: ${why}` : `${seller.name} declined the task.`)
  }
  const answer = answerFromA2A(body)
  if (!answer) throw new FreeTryError('no_answer', `${seller.name} answered without a result.`)
  // An answer that is only an error is the agent saying it could not do the task this time.
  const only = answer.content ? Object.keys(answer.content) : []
  if (only.length === 1 && only[0] === 'error') {
    const why = String(answer.content!['error']).slice(0, 240)
    throw new FreeTryError('agent_error', `${seller.name} could not answer just now: ${why}. Try again in a moment.`)
  }
  return { agentId, agentName: seller.name, category: seller.category, ...answer, latencyMs, at: new Date().toISOString() }
}
