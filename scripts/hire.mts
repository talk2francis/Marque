/**
 * The hire path, exercised end to end.
 *
 *   pnpm tsx scripts/hire.mts
 *
 * Runs the pipeline against every distinct live third-party supplier we have
 * indexed, one adapter at a time, and reports which adapters found a real
 * counterparty and which had none. Nothing here signs anything.
 */
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import {
  executorFor, runHire, preflight, structuredTask,
  type StructuredTask, type ExecutorKind,
} from '@marque/execution'
import { publicClient } from '@marque/chain'

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
const LP_OWNER = '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD'

interface Supplier { agentId: string; name: string; kind: string; endpoint: string; host: string }

/** One agent per distinct host — the same endpoint twice is one counterparty. */
async function suppliers(): Promise<Supplier[]> {
  const rows = await db().execute(sql`
    with latest as (
      select distinct on (service_id) service_id, agent_id, liveness
      from probe where service_id is not null order by service_id, checked_at desc
    )
    select distinct on (host) a.id as agent_id, coalesce(a.name, 'unnamed') as name, s.kind,
           coalesce(s.resolved_endpoint, s.endpoint) as endpoint,
           regexp_replace(coalesce(s.resolved_endpoint, s.endpoint), '^(https?://[^/]+).*', '\\1') as host
    from latest l
    join agent_service s on s.id = l.service_id
    join agent a on a.id = l.agent_id
    where l.liveness = 'live' and a.id <> 'canary:ssrf'
    order by host, a.id
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  return list.map((r) => ({
    agentId: String(r['agent_id']), name: String(r['name']),
    kind: String(r['kind']), endpoint: String(r['endpoint']), host: String(r['host']),
  }))
}

async function buildTasks(blockNumber: string): Promise<StructuredTask[]> {
  return [
    structuredTask.parse({
      kind: 'health_factor', chainId: 56, blockNumber, subject: DEMO,
      maxSpendUsd: 1, policy: { targetHealthFactor: 2.5 },
    }),
    structuredTask.parse({
      kind: 'rebalance', chainId: 56, blockNumber, subject: LP_OWNER,
      maxSpendUsd: 1, positionTokenId: '7321916',
      policy: { rangePct: 6, feeTier: 2500, maxSlippageBps: 40 },
    }),
    structuredTask.parse({
      kind: 'yield', chainId: 56, blockNumber, subject: DEMO, maxSpendUsd: 1,
      policy: {
        asset: 'USDT', sizeUsd: 1000, allowedProtocols: ['venus'],
        minImprovementBps: 50, leverageAllowed: false, currentAprPct: 0,
      },
    }),
  ]
}

async function main(): Promise<void> {
  const blockNumber = (await publicClient().getBlockNumber()).toString()
  const tasks = await buildTasks(blockNumber)
  const list = await suppliers()

  console.log(`block ${blockNumber} · ${list.length} distinct live suppliers\n`)

  const byAdapter = new Map<ExecutorKind, { tried: number; reached: number; answered: number; graded: number }>()
  const note = (k: ExecutorKind, field: 'tried' | 'reached' | 'answered' | 'graded') => {
    const acc = byAdapter.get(k) ?? { tried: 0, reached: 0, answered: 0, graded: 0 }
    acc[field]++
    byAdapter.set(k, acc)
  }

  for (const s of list) {
    const executor = executorFor(s.kind, s.agentId, s.endpoint, s.name)
    if (!executor) {
      console.log(`— ${s.name} (${s.kind}) — no adapter: this transport exposes no task interface`)
      continue
    }
    note(executor.kind, 'tried')

    const manifest = await executor.inspect()
    if ('ok' in manifest) {
      console.log(`✗ ${s.name} [${executor.kind}] inspect failed — ${manifest.reason}: ${manifest.detail}`)
      continue
    }
    note(executor.kind, 'reached')
    console.log(`\n● ${manifest.name ?? s.name} [${executor.kind}] ${manifest.endpoint.slice(0, 64)}`)
    console.log(`  ${manifest.skills.length} skill(s) · reached in ${manifest.latencyMs}ms`)

    const task = tasks[0] as StructuredTask
    const pre = await preflight(executor, task)
    console.log(`  preflight: ${pre.ok ? 'answered' : `${pre.reason} — ${pre.detail}`}${pre.nothingSubmitted ? ' · no transaction has been submitted' : ''}`)
    if (pre.ok) {
      note(executor.kind, 'answered')
      if (pre.conformance) {
        note(executor.kind, 'graded')
        console.log(`  graded against ${pre.conformance.testId}: ${pre.conformance.pass ? 'PASS' : `FAIL on ${pre.conformance.failedFields.join(', ')}`}`)
      }
    }

    const outcome = await runHire({
      executor, task,
      ctx: { buyer: DEMO, maxSpendUsd: 1, deadlineMs: 45_000 },
    })
    console.log(`  run ${outcome.ok ? 'ok' : 'failed'} at stage "${outcome.stage}" in ${outcome.elapsedMs}ms`)
    if (outcome.failure) console.log(`    ${outcome.failure}`)
    if (outcome.receiptHash) {
      console.log(`    receipt ${outcome.receiptHash}`)
      console.log(`    quality: ${outcome.receipt?.quality.testId ?? 'ungraded'} ${outcome.receipt?.quality.pass === null ? '' : outcome.receipt?.quality.pass ? 'PASS' : `FAIL (${outcome.receipt?.quality.failedFields.join(', ')})`}`)
    }
  }

  console.log('\n\nADAPTER COVERAGE — which found a real counterparty')
  console.log('adapter    tried  reached  answered  graded')
  for (const kind of ['a2a', 'mcp', 'x402', 'erc8183'] as ExecutorKind[]) {
    const a = byAdapter.get(kind) ?? { tried: 0, reached: 0, answered: 0, graded: 0 }
    console.log(`${kind.padEnd(10)} ${String(a.tried).padStart(5)}  ${String(a.reached).padStart(7)}  ${String(a.answered).padStart(8)}  ${String(a.graded).padStart(6)}`)
  }

  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
