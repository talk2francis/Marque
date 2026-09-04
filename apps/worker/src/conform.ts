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
import { CASES, captureCase, runConformance, formatOutcome, type TestId } from '@marque/conformance'
import { safeFetch } from '@marque/probe'
import { db, closeDb } from '@marque/db'
import { sql } from 'drizzle-orm'

const ONCE = process.argv.includes('--once')
const CYCLE_MS = Number(process.env.CONFORM_CYCLE_MS ?? 24 * 60 * 60_000)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'conform', event, ...data }))
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
      select distinct on (service_id) service_id, agent_id, liveness
      from probe where service_id is not null order by service_id, checked_at desc
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
  for (const c of CASES) {
    try {
      const { testCase, groundTruthHash } = await captureCase({
        id: c.id, testId: c.testId, subject: c.subject, policy: c.policy,
      })
      log('case_captured', { case: c.id, block: testCase.blockNumber.toString(), hash: groundTruthHash })
    } catch (err) {
      log('case_capture_failed', { case: c.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const agents = await liveAgents()
  log('agents', { live: agents.length })

  let pass = 0
  let fail = 0
  for (const a of agents) {
    for (const c of CASES) {
      try {
        const outcome = await runConformance({
          adapter: liveAdapter(a.id, a.name, a.endpoint), testId: c.testId as TestId,
        })
        if (outcome.pass) pass++
        else fail++
        log('result', {
          agent: a.name, test: c.testId, pass: outcome.pass,
          failed: outcome.failedFields, latencyMs: outcome.latencyMs, error: outcome.error,
        })
      } catch (err) {
        log('run_error', { agent: a.name, test: c.testId, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  log('sweep_done', { pass, fail })
  void formatOutcome
}

async function main(): Promise<void> {
  log('start', { once: ONCE, cycleMs: CYCLE_MS })
  do {
    try { await sweep() } catch (err) {
      log('sweep_error', { error: err instanceof Error ? err.message : String(err) })
      if (ONCE) throw err
    }
    if (!ONCE && !stopping) await sleep(CYCLE_MS)
  } while (!ONCE && !stopping)
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
