/**
 * Fresh, read-only MCS retest of the public marketplace shortlist.
 *
 * Usage: node --import tsx scripts/retest-shortlist.mts [--tokens=127417,358958]
 * Each agent gets a new immutable on-chain snapshot just before it is asked.
 * Results are published, pass or fail. No wallet, key or transaction is used.
 */
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { CASES, capturePublishedCase, runConformance, a2aAdapter, mcpAdapter, extractJsonPayload, type TestId } from '@marque/conformance'

type PublicAgent = { agentId: string; tokenId: string; name: string; category: string | null; isReference: boolean }
const TEST: Record<string, TestId | undefined> = {
  rebalancing: 'MCS-REB-1', grid: 'MCS-GRID-1', yield: 'MCS-YIELD-1', health_factor: 'MCS-HF-1',
}
const wanted = process.argv.find((arg) => arg.startsWith('--tokens='))?.slice(9).split(',').filter(Boolean) ?? null
const origin = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade'
const tabs = wanted ? ['ready', 'free', 'tested'] : ['ready', 'free', 'tested']
const limits = { ready: 120, free: 20, tested: 30 } as const
const selected = new Map<string, PublicAgent>()
for (const tab of tabs) {
  const response = await fetch(`${origin}/api/v1/marketplace?tab=${tab}&limit=${limits[tab as keyof typeof limits]}`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`public marketplace ${tab} returned HTTP ${response.status}`)
  const body = await response.json() as { agents?: PublicAgent[] }
  for (const agent of body.agents ?? []) if (!agent.isReference && agent.category && TEST[agent.category] && (!wanted || wanted.includes(agent.tokenId))) selected.set(agent.agentId, agent)
}
if (wanted) for (const token of wanted) if (![...selected.values()].some((agent) => agent.tokenId === token)) console.log(JSON.stringify({ token, result: 'not_in_public_shortlist' }))

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
function directA2a(agent: PublicAgent, endpoint: string) {
  return {
    agentId: agent.agentId, name: agent.name,
    async ask(_testCase: unknown, prompt: string) {
      const start = Date.now()
      const res = await safeFetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', messageId: `marque-mcs-${Date.now()}`, parts: [{ kind: 'text', text: prompt }] } } }),
        timeoutMs: 45_000,
      })
      const latencyMs = Date.now() - start
      if (!res.ok || res.status >= 400) return { response: null, latencyMs, error: 'endpoint_unavailable' }
      let parsed: unknown
      try { parsed = JSON.parse(res.body) } catch { return { response: null, latencyMs, error: 'no_structured_answer' } }
      if (parsed && typeof parsed === 'object' && 'error' in parsed && !('result' in parsed)) return { response: null, latencyMs, error: 'agent_error' }
      const payload = extractJsonPayload(parsed)
      if (!payload || typeof payload !== 'object' || ('error' in payload && Object.keys(payload).every((key) => key === 'error' || key === 'need'))) return { response: null, latencyMs, error: 'no_structured_answer' }
      return { response: payload, latencyMs, costUsd: null }
    },
  }
}

let pass = 0
let fail = 0
let skipped = 0
for (const agent of selected.values()) {
  const testId = TEST[agent.category!]!
  const [service] = rowsOf(await db().execute(sql`
    select kind, coalesce(resolved_endpoint, endpoint) as endpoint
    from agent_service where agent_id = ${agent.agentId} and kind in ('a2a', 'mcp', 'termix')
    order by case kind when 'a2a' then 0 when 'termix' then 1 else 2 end limit 1`))
  if (!service) { skipped++; console.log(JSON.stringify({ token: agent.tokenId, test: testId, result: 'no_testable_service' })); continue }
  const spec = CASES.find((c) => c.testId === testId)!
  let caseId: string
  try {
    const captured = await capturePublishedCase({ id: `${spec.id}-shortlist-${agent.tokenId}-${Date.now()}-${randomUUID().slice(0, 6)}`, testId, subject: spec.subject, policy: spec.policy })
    caseId = captured.testCase.id
  } catch (error) {
    skipped++
    console.log(JSON.stringify({ token: agent.tokenId, test: testId, result: 'case_capture_failed', errorClass: error instanceof Error ? error.name : 'Error' }))
    continue
  }
  const kind = String(service['kind'])
  const endpoint = String(service['endpoint'])
  const adapter = kind === 'mcp' ? mcpAdapter(agent.agentId, agent.name, endpoint)
    : /agent-card|\.well-known|\/card(?:\/|$)/i.test(endpoint) ? a2aAdapter(agent.agentId, agent.name, endpoint)
      : directA2a(agent, endpoint)
  try {
    const outcome = await runConformance({ adapter, testId, caseId })
    if (outcome.pass) pass++; else fail++
    console.log(JSON.stringify({ token: agent.tokenId, name: agent.name, test: testId, pass: outcome.pass, failedFields: outcome.failedFields, noAnswer: Boolean(outcome.error), latencyMs: outcome.latencyMs }))
  } catch (error) {
    skipped++
    console.log(JSON.stringify({ token: agent.tokenId, test: testId, result: 'runner_error', errorClass: error instanceof Error ? error.name : 'Error' }))
  }
}
await closeDb()
console.log(JSON.stringify({ summary: true, selected: selected.size, pass, fail, skipped }))
