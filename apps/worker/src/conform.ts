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
import { CASES, capturePublishedCase, runConformance, a2aAdapter, adapterFor, type TestId } from '@marque/conformance'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { randomUUID } from 'node:crypto'
import { firstPartyAgentIds, safeFetch } from '@marque/probe'
import { closeDb, firstPartyAgents } from '@marque/db'
import { declaredReferenceTest } from './reference-standard.js'
import { checkDeliveredJobs, checkSweep } from './checks.js'

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
  if (value.startsWith('case_stale:')) return 'case_stale'
  if (/timeout|did not answer within|timed out/i.test(value)) return 'timeout'
  return error instanceof Error ? error.name : 'request_failed'
}

/**
 * Outside agents are not sent the Standard's test tasks without their operator (the builder test flow). They are asked one
 * read-only check question a day instead (checks.ts), which never grades layout and never counts as a hire.
 */
async function sweep(): Promise<void> {
  log('outside_sweep_skipped', { reason: 'Outside Standard runs go through the builder test flow; the daily read-only check call covers every hireable agent.' })
  if (ONCE) throw new Error('outside_conformance_requires_provider_consent')
}

/** The next 02:00 UTC after `from`. */
function nextCheckAt(from = Date.now()): number {
  const d = new Date(from)
  d.setUTCHours(2, 0, 0, 0)
  if (d.getTime() <= from) d.setUTCDate(d.getUTCDate() + 1)
  return d.getTime()
}

async function checksNow(force: boolean): Promise<void> {
  const only = process.argv.filter((a) => /^\d+:0x[0-9a-fA-F]{40}:\d+$/.test(a))
  if (!only.length) await checkDeliveredJobs(log).catch((err) => log('delivered_jobs_error', { error: errorKind(err) }))
  if (!only.length) await renewSweep().catch((err) => log('renew_sweep_error', { error: errorKind(err) }))
  const rows = await checkSweep({ force, only, log })
  const tally: Record<string, number> = {}
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1
  log('check_sweep_done', { asked: rows.length, ...tally })
}

/**
 * Re-test first-party engines that declare a compatible published standard through
 * their public free A2A face, exactly as a third party is tested. Results are stored under
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
    // An agent's own standard (config/first-party.json `standard`) when set; null means none applies; else its category's.
    const expectedTest = a.standard === null ? undefined : (a.standard as TestId | undefined) ?? TEST_FOR_CATEGORY[a.category]
    const agentId = ids.get(a.slug)
    if (!expectedTest || !agentId) {
      log('reference_skip', { agent: a.slug, reason: !expectedTest ? 'no published test for this category' : 'registry row not ingested' })
      continue
    }
    // Realised yield and quoted-rate routing share a category, not a task.
    // Check the engine's public declaration before capturing a grading case.
    const cardUrl = `${PUBLIC_URL}/agents/${a.slug}/.well-known/agent-card.json`
    const card = await safeFetch(cardUrl, { timeoutMs: 15_000 })
    let declaration: unknown = null
    if (card.ok && card.status < 400) {
      try { declaration = JSON.parse(card.body) } catch { /* unavailable declaration stays untestable */ }
    }
    const testId = declaredReferenceTest(declaration, a.category, expectedTest)
    if (!testId) {
      log('reference_skip', { agent: a.slug, reason: card.ok && card.status < 400 ? 'no compatible declared published standard' : 'agent card unavailable', attempted: false })
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
    const adapter = a2aAdapter(agentId, a.slug, cardUrl)
    try {
      const outcome = await runConformance({ adapter, testId, caseId, selectionSource: 'first_party_config' })
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

/**
 * Warrant renewal (3 Nov): an outside agent that passed a published test keeps its Warrant only by passing again. Its
 * pass is older than 72 hours: ask the same test again, on a freshly captured case, through the exact service it passed
 * through (recorded with the pass). The same read-only question it already answered; under Francis's 2 Nov decision every
 * listed agent may be asked one a day, and an operator opts out the same way as for the check call. A failed or
 * unanswered renewal is stored as it is, so the Warrant lapses honestly instead of silently.
 */
async function renewSweep(): Promise<void> {
  const optOut = new Set((process.env.CHECK_OPTOUT ?? '').split(',').map((x) => x.trim()).filter(Boolean))
  const fp = new Set(await firstPartyAgentIds())
  const due = ((await db().execute(sql`
    with latest as (
      select distinct on (agent_id, test_id) agent_id, test_id, pass, ran_at, request
      from conformance_result where agent_id like '56:%' or agent_id like '97:%'
      order by agent_id, test_id, ran_at desc
    )
    -- Older passes did not record their service: fall back to the agent's declared A2A card.
    select agent_id, test_id, coalesce(request #>> '{evidence,service,kind}', 'a2a') as kind,
           coalesce(request #>> '{evidence,service,discoveryEndpoint}', (
             select coalesce(s.resolved_endpoint, s.endpoint) from agent_service s
             where s.agent_id = latest.agent_id and s.kind = 'a2a' and s.currently_declared is distinct from false order by s.id limit 1)) as endpoint
    from latest where pass and ran_at < now() - interval '72 hours' and ran_at > now() - interval '30 days'`)) as unknown as Array<Record<string, unknown>>)
  let pass = 0, fail = 0
  for (const r of due) {
    const agentId = String(r['agent_id']), testId = String(r['test_id']) as TestId
    if (fp.has(agentId) || optOut.has(agentId) || !r['endpoint']) continue
    const adapter = adapterFor(String(r['kind'] ?? 'a2a'), agentId, agentId, String(r['endpoint']))
    const spec = CASES.find((c) => c.testId === testId)
    if (!adapter || !spec) continue
    try {
      const captured = await capturePublishedCase({ id: `${spec.id}-renew-${agentId.split(':').pop()}-${Date.now()}`, testId, subject: spec.subject, policy: spec.policy })
      const outcome = await runConformance({ adapter, testId, caseId: captured.testCase.id, selectionSource: 'indexed_service' })
      if (outcome.pass) pass++; else fail++
      log('renew_result', { agentId, test: testId, pass: outcome.pass, failed: outcome.failedFields, error: errorKind(outcome.error) })
    } catch (err) {
      fail++
      log('renew_error', { agentId, test: testId, error: errorKind(err) })
    }
  }
  log('renew_sweep_done', { due: due.length, pass, fail })
}

async function main(): Promise<void> {
  const referenceOnly = process.argv.includes('--reference')
  const checksOnly = process.argv.includes('--checks')
  log('start', { once: ONCE, cycleMs: CYCLE_MS, referenceCycleMs: REFERENCE_CYCLE_MS, referenceOnly, checksOnly })
  if (ONCE) {
    if (process.argv.includes('--renew')) await renewSweep()
    else if (checksOnly) await checksNow(process.argv.includes('--force'))
    else if (referenceOnly) await referenceSweep()
    else await sweep()
    await closeDb()
    log('stop', {})
    return
  }
  // A rolling release must not duplicate a whole task sweep immediately on boot.
  const defer = process.env.CONFORM_DEFER_ON_START === '1'
  let nextFull = Date.now() + (defer ? CYCLE_MS : 0)
  let nextReference = Date.now() + (defer ? REFERENCE_CYCLE_MS : 0)
  let nextChecks = nextCheckAt()
  log('next_sweeps', { nextFull: new Date(nextFull).toISOString(), nextReference: new Date(nextReference).toISOString(), deferred: defer })
  while (!stopping) {
    if (Date.now() >= nextReference) {
      try { await referenceSweep() } catch (err) {
        log('reference_sweep_error', { error: errorKind(err) })
      }
      nextReference = Date.now() + REFERENCE_CYCLE_MS
    }
    if (Date.now() >= nextChecks) {
      try { await checksNow(false) } catch (err) {
        log('check_sweep_error', { error: errorKind(err) })
      }
      nextChecks = nextCheckAt()
    }
    if (Date.now() >= nextFull) {
      try { await sweep() } catch (err) {
        log('sweep_error', { error: errorKind(err) })
      }
      nextFull = Date.now() + CYCLE_MS
    }
    await sleep(Math.max(60_000, Math.min(nextReference, nextFull, nextChecks) - Date.now()))
  }
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
