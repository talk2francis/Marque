/**
 * The conformance worker.
 *
 * Re-runs every test nightly so that a Warrant has a date and can go stale. An
 * agent that passed a week ago and has since regressed must not keep showing a
 * pass — the mark is a statement about now, not about then.
 *
 * Cases are re-captured before each nightly sweep, because BSC public RPC
 * retains only ~64 blocks of state and a stale case grades agents against a
 * position that may no longer resemble the chain.
 */
import { CASES, capturePublishedCase, runConformance, formatOutcome, a2aAdapter, type TestId } from '@marque/conformance'
import { randomUUID } from 'node:crypto'
import { safeFetch, firstPartyAgentIds } from '@marque/probe'
import { db, closeDb, firstPartyAgents } from '@marque/db'
import { sql } from 'drizzle-orm'

const ONCE = process.argv.includes('--once')
const CYCLE_MS = Number(process.env.CONFORM_CYCLE_MS ?? 24 * 60 * 60_000)
/** Reference agents are re-tested more often than third parties (P2-00 step 7). */
const REFERENCE_CYCLE_MS = Number(process.env.CONFORM_REFERENCE_CYCLE_MS ?? 12 * 60 * 60_000)
const PUBLIC_URL = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade'
const TEST_FOR_CATEGORY: Readonly<Record<string, TestId | undefined>> = {
  rebalancing: 'MCS-REB-1', grid: 'MCS-GRID-1', yield: 'MCS-YIELD-1', health_factor: 'MCS-HF-1',
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'conform', event, ...data }))
}
/** Third-party error text can contain RPC credentials or private endpoint URLs. */
function errorKind(error: unknown): string | null {
  if (!error) return null
  const value = error instanceof Error ? error.message : String(error)
  if (value.startsWith('unusable_response:')) return 'unusable_response'
  if (value.startsWith('no_compatible_interface:')) return 'no_compatible_interface'
  if (value.startsWith('payment required:')) return 'payment_required'
  if (/timeout|did not answer within|timed out/i.test(value)) return 'timeout'
  return error instanceof Error ? error.name : 'request_failed'
}

function liveAdapter(agentId: string, name: string, endpoint: string) {
  return {
    agentId,
    name,
    async ask(_tc: unknown, prompt: string) {
      const started = Date.now()
      const res = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'message/send',
          params: { message: { role: 'user', parts: [{ kind: 'text', text: prompt }] } },
        }),
        timeoutMs: 30_000,
      })
      const latencyMs = Date.now() - started
      if (!res.ok) return { response: null, latencyMs, error: `${res.failure}: ${res.detail}` }
      if (res.status >= 400) return { response: null, latencyMs, error: `http ${res.status}` }
      try { return { response: JSON.parse(res.body), latencyMs, costUsd: null } }
      catch { return { response: res.body, latencyMs, error: 'response was not JSON' } }
    },
  }
}

/** One live, callable agent per distinct host — the only agents worth testing. */
async function liveAgents(): Promise<Array<{ id: string; name: string; endpoint: string }>> {
  const rows = await db().execute(sql`
    with latest as (
      select ps.service_id, ps.agent_id, p.liveness
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    )
    select distinct on (host) a.id, a.name,
           coalesce(s.resolved_endpoint, s.endpoint) as endpoint,
           regexp_replace(coalesce(s.resolved_endpoint, s.endpoint), '^(https?://[^/]+).*', '\\1') as host
    from latest l
    join agent_service s on s.id = l.service_id
    join agent a on a.id = l.agent_id
    where l.liveness = 'live' and a.id <> 'canary:ssrf'
    order by host, a.id
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  return list.map((r) => ({ id: String(r['id']), name: String(r['name'] ?? 'unnamed'), endpoint: String(r['endpoint']) }))
}

async function sweep(): Promise<void> {
  const captured = await captureAll()

  const agents = await liveAgents()
  log('agents', { live: agents.length })

  let pass = 0
  let fail = 0
  for (const a of agents) {
    for (const c of CASES) {
      const caseId = captured.get(c.testId as TestId)
      if (!caseId) continue
      try {
        const outcome = await runConformance({
          adapter: liveAdapter(a.id, a.name, a.endpoint), testId: c.testId as TestId, caseId,
        })
        if (outcome.pass) pass++
        else fail++
        log('result', {
          agent: a.name, test: c.testId, pass: outcome.pass,
          failed: outcome.failedFields, latencyMs: outcome.latencyMs, error: errorKind(outcome.error),
        })
      } catch (err) {
        log('run_error', { agent: a.name, test: c.testId, error: errorKind(err) })
      }
    }
  }
  log('sweep_done', { pass, fail })
  void formatOutcome
}

async function captureAll(): Promise<Map<TestId, string>> {
  const captured = new Map<TestId, string>()
  // A frozen case cannot be overwritten. Give each sweep its own immutable id.
  const runId = `${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`
  for (const c of CASES) {
    try {
      const caseId = `${c.id}-${runId}`
      const { testCase, groundTruthHash } = await capturePublishedCase({ id: caseId, testId: c.testId, subject: c.subject, policy: c.policy })
      captured.set(c.testId as TestId, testCase.id)
      log('case_captured', { case: caseId, block: testCase.blockNumber.toString(), subjectTokenId: testCase.subject['tokenId'] ?? null, hash: groundTruthHash })
    } catch (err) {
      log('case_capture_failed', { case: c.id, error: errorKind(err) })
    }
  }
  return captured
}

/**
 * Re-test every first-party agent against its own category's published test, through
 * its public free A2A face, exactly as a third party is tested. Results are stored under
 * the agent's canonical ERC-8004 row id. The latest result controls the badge;
 * "retest due" applies only when the latest pass is older than 72 h.
 */
async function referenceSweep(): Promise<void> {
  const ids = new Map<string, string>()
  const fp = firstPartyAgents()
  for (const id of await firstPartyAgentIds()) {
    const tokenId = id.split(':').pop()
    const a = fp.find((x) => String(x.tokenId) === tokenId)
    if (a) ids.set(a.slug, id)
  }
  let pass = 0
  let fail = 0
  const runId = `${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`
  for (const a of fp) {
    const testId = TEST_FOR_CATEGORY[a.category]
    const agentId = ids.get(a.slug)
    if (!testId || !agentId) {
      log('reference_skip', { agent: a.slug, reason: !testId ? 'no published test for this category' : 'registry row not ingested' })
      continue
    }
    // Public BSC RPCs prune historical state after about 60 blocks. Capturing
    // every category first made later agents read an already-pruned block,
    // especially when the optional archive provider was down. Freeze a fresh,
    // immutable case immediately before asking this agent; never reuse a stale
    // case or substitute the latest head for its pinned block.
    const spec = CASES.find((c) => c.testId === testId)!
    let caseId: string
    try {
      const captured = await capturePublishedCase({ id: `${spec.id}-${a.slug}-${runId}`, testId, subject: spec.subject, policy: spec.policy })
      caseId = captured.testCase.id
      log('reference_case_captured', { agent: a.slug, block: captured.testCase.blockNumber.toString(), subjectTokenId: captured.testCase.subject['tokenId'] ?? null, hash: captured.groundTruthHash })
    } catch (err) {
      log('reference_skip', { agent: a.slug, reason: 'fresh case capture failed', error: errorKind(err) })
      continue
    }
    const adapter = a2aAdapter(agentId, a.slug, `${PUBLIC_URL}/agents/${a.slug}/.well-known/agent-card.json`)
    try {
      const outcome = await runConformance({ adapter, testId, caseId })
      if (outcome.pass) pass++
      else fail++
      log('reference_result', { agent: a.slug, agentId, test: testId, pass: outcome.pass, failed: outcome.failedFields, latencyMs: outcome.latencyMs, error: errorKind(outcome.error) })
    } catch (err) {
      fail++
      log('reference_error', { agent: a.slug, test: testId, error: errorKind(err) })
    }
  }
  log('reference_sweep_done', { pass, fail })
}

async function main(): Promise<void> {
  const referenceOnly = process.argv.includes('--reference')
  log('start', { once: ONCE, cycleMs: CYCLE_MS, referenceCycleMs: REFERENCE_CYCLE_MS, referenceOnly })
  if (ONCE) {
    if (referenceOnly) await referenceSweep()
    else await sweep()
    await closeDb()
    log('stop', {})
    return
  }
  let nextFull = Date.now()
  let nextReference = Date.now()
  while (!stopping) {
    if (Date.now() >= nextReference) {
      try { await referenceSweep() } catch (err) {
        log('reference_sweep_error', { error: errorKind(err) })
      }
      nextReference = Date.now() + REFERENCE_CYCLE_MS
    }
    if (Date.now() >= nextFull) {
      try { await sweep() } catch (err) {
        log('sweep_error', { error: errorKind(err) })
      }
      nextFull = Date.now() + CYCLE_MS
    }
    await sleep(Math.max(60_000, Math.min(nextReference, nextFull) - Date.now()))
  }
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
