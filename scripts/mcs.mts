/**
 * MCS command line.
 *
 *   pnpm mcs capture              re-capture every case from live chain state
 *   pnpm mcs run                  run all four tests against both stubs
 *   pnpm mcs run --agents         run against every reachable third-party agent
 *
 * Cases are materialised because BSC public RPC keeps only ~64 blocks of state.
 * Capture freezes ground truth with its block number and a hash; every agent is
 * then graded against that identical snapshot.
 */
import {
  CASES, captureCase, loadCase, runConformance, formatOutcome,
  CORRECT_STUB, WRONG_STUB, SILENT_STUB, adapterFor, type TestId,
} from '@marque/conformance'
import { db, closeDb, agent, agentService, probe } from '@marque/db'

import { sql } from 'drizzle-orm'

const cmd = process.argv[2] ?? 'run'
const withAgents = process.argv.includes('--agents')

async function capture(): Promise<void> {
  for (const c of CASES) {
    process.stdout.write(`capturing ${c.id} (${c.testId})… `)
    try {
      const { groundTruthHash, testCase } = await captureCase({
        id: c.id, testId: c.testId, subject: c.subject, policy: c.policy,
      })
      console.log(`ok  block ${testCase.blockNumber}  hash ${groundTruthHash.slice(0, 18)}…`)
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/** Every third-party agent whose latest probe found it live and callable. */
async function liveAgents(): Promise<Array<{ id: string; name: string; endpoint: string; kind: string }>> {
  const rows = await db().execute(sql`
    with latest as (
      select distinct on (service_id) service_id, agent_id, liveness
      from probe where service_id is not null order by service_id, checked_at desc
    )
    select distinct on (host) a.id, a.name, s.kind,
           coalesce(s.resolved_endpoint, s.endpoint) as endpoint,
           regexp_replace(coalesce(s.resolved_endpoint, s.endpoint), '^(https?://[^/]+).*', '\\1') as host
    from latest l
    join agent_service s on s.id = l.service_id
    join agent a on a.id = l.agent_id
    where l.liveness = 'live' and a.id <> 'canary:ssrf'
      and s.kind in ('a2a', 'mcp', 'termix')
    order by host, a.id
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  void agent; void agentService; void probe
  return list.map((r) => ({
    id: String(r['id']), name: String(r['name'] ?? 'unnamed'),
    endpoint: String(r['endpoint']), kind: String(r['kind']),
  }))
}

async function run(): Promise<void> {
  const testIds = CASES.map((c) => c.testId) as TestId[]

  for (const testId of testIds) {
    const loaded = await loadCase(testId)
    if (!loaded) {
      console.log(`\n${testId}: no captured case — run \`pnpm mcs capture\` first`)
      continue
    }
    console.log(`\n${'='.repeat(78)}\n${testId}  ·  case ${loaded.testCase.id}  ·  block ${loaded.testCase.blockNumber}`)
    console.log(`ground truth hash ${loaded.groundTruthHash}`)
    console.log('='.repeat(78))

    for (const adapter of [CORRECT_STUB, WRONG_STUB, SILENT_STUB]) {
      const outcome = await runConformance({ adapter, testId })
      console.log(formatOutcome(outcome))
      console.log('')
    }
  }

  if (!withAgents) return

  const agents = await liveAgents()
  console.log(`\n${'#'.repeat(78)}\nREAL THIRD-PARTY AGENTS (${agents.length} distinct live hosts)\n${'#'.repeat(78)}`)
  for (const a of agents) {
    const adapter = adapterFor(a.kind, a.id, a.name, a.endpoint)
    if (!adapter) {
      console.log(`\n[${a.name}] ${a.endpoint.slice(0, 70)}`)
      console.log(`  skipped: '${a.kind}' exposes no task interface we can address generically`)
      continue
    }
    console.log(`\n[${a.name}] ${a.kind} ${a.endpoint.slice(0, 70)}`)
    for (const testId of testIds) {
      const outcome = await runConformance({ adapter, testId })
      console.log(formatOutcome(outcome))
    }
  }
}

async function main(): Promise<void> {
  if (cmd === 'capture') await capture()
  else if (cmd === 'run') await run()
  else if (cmd === 'all') { await capture(); await run() }
  else { console.error(`unknown command: ${cmd}`); process.exit(1) }
  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
