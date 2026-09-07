import 'server-only'
import { randomUUID } from 'node:crypto'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db, run as runTable, runEvent as runEventTable, receipt as receiptTable } from '@marque/db'
import {
  executorFor, runHire, structuredTask,
  type RunEventInput, type StructuredTask,
} from '@marque/execution'
import { publicClient } from '@marque/chain'
import { readCharter } from './charters'
import { anchorReceipt } from './anchor'
import { referenceAgent as refAgentMeta, displayName } from './reference-agents'

/**
 * The run record.
 *
 * A hire is handed a URL before it finishes, because a buyer watching a spinner
 * with no address cannot share what they are watching, cannot reload it, and
 * cannot come back to it. So the row is written first, the pipeline runs after,
 * and every stage writes an event with the timestamp it actually happened at.
 *
 * This process is a long-lived Node server behind Caddy, not a serverless
 * function, so a promise that outlives the response is a normal background
 * task rather than a lost one. If this ever moves to a platform that freezes
 * the process after the response, the pipeline must move to the worker.
 */

export interface StartRunInput {
  agentId: string
  subject: string
  kind: StructuredTask['kind']
  policy: Record<string, unknown>
  positionTokenId?: string
  pair?: string
  maxSpendUsd: number
  charterId?: string | null
}

export interface StartRunResult {
  ok: boolean
  runId?: string
  error?: string
}

const CATEGORY_FOR_KIND: Record<StructuredTask['kind'], string> = {
  rebalance: 'rebalancing',
  grid: 'grid',
  yield: 'yield',
  health_factor: 'health_factor',
}

interface ResolvedAgent { agentId: string; name: string | null; kind: string; endpoint: string }

/**
 * Marque's own reference agents.
 *
 * They are addressable by id and are NOT rows in the agent table, because that
 * table is derived state and must be rebuildable by running ingest from cursor
 * zero (invariant 12). A first-party agent that has not been registered on
 * chain cannot be rebuilt from chain, so writing it there would quietly break
 * the rebuild guarantee to save one join.
 *
 * They exist only to keep a category callable, and every surface that shows one
 * labels it as first-party (invariant 1).
 */
function referenceAgent(agentId: string): ResolvedAgent | null {
  const meta = refAgentMeta(agentId)
  if (!meta) return null
  const base = process.env[meta.publicUrlEnv]
  if (!base) return null
  // The A2A adapter is handed the CARD url and reads the executable endpoint
  // out of the card. Handing it the base instead is the bug that once looked
  // like thirty dead agents and was a broken client.
  return {
    agentId,
    // The one name — the "reference agent" fact is a mark on the UI, never
    // baked into the name (invariant 18).
    name: displayName(agentId),
    kind: 'a2a',
    endpoint: `${base.replace(/\/$/, '')}/.well-known/agent-card.json`,
  }
}

/**
 * Where work is actually sent.
 *
 * The endpoint we call is the one the agent's own descriptor pointed at, taken
 * from the most recent probe — not the card URL. POSTing at the card instead of
 * the `url` inside it produced roughly thirty phantom dead agents once already,
 * and the bug looked exactly like the agents being broken.
 */
async function resolveAgent(agentId: string): Promise<ResolvedAgent | null> {
  const reference = referenceAgent(agentId)
  if (reference) return reference

  const rows = await db().execute(sql`
    with latest as (
      select distinct on (service_id) service_id, agent_id, liveness, executable_endpoint
      from probe
      where agent_id = ${agentId} and service_id is not null
      order by service_id, checked_at desc
    )
    select a.id as agent_id, a.name, s.kind,
           coalesce(l.executable_endpoint, s.resolved_endpoint, s.endpoint) as endpoint,
           l.liveness
    from latest l
    join agent_service s on s.id = l.service_id
    join agent a on a.id = l.agent_id
    order by (l.liveness = 'live') desc
    limit 1
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  const r = list[0]
  if (!r) return null
  return {
    agentId: String(r['agent_id']),
    name: r['name'] === null ? null : String(r['name']),
    kind: String(r['kind']),
    endpoint: String(r['endpoint']),
  }
}

async function recordEvent(runId: string, event: RunEventInput): Promise<void> {
  await db().insert(runEventTable).values({
    runId,
    kind: event.kind,
    label: event.label,
    detail: event.detail ?? null,
    txHash: event.txHash ?? null,
    data: event.data ?? null,
  })
}

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const agent = await resolveAgent(input.agentId)
  if (!agent) {
    return { ok: false, error: 'we have no reachable endpoint on record for this agent' }
  }
  const executor = executorFor(agent.kind, agent.agentId, agent.endpoint, agent.name)
  if (!executor) {
    return { ok: false, error: `a ${agent.kind} endpoint exposes no task interface we can address` }
  }

  let blockNumber: string
  try {
    blockNumber = (await publicClient().getBlockNumber()).toString()
  } catch {
    return { ok: false, error: 'BNB Smart Chain could not be read, so a task cannot be pinned to a block' }
  }

  let task: StructuredTask
  try {
    task = structuredTask.parse({
      kind: input.kind,
      chainId: 56,
      blockNumber,
      subject: input.subject,
      maxSpendUsd: input.maxSpendUsd,
      policy: input.policy,
      ...(input.positionTokenId ? { positionTokenId: input.positionTokenId } : {}),
      ...(input.pair ? { pair: input.pair } : {}),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err)
    return { ok: false, error: `that task is not well formed: ${detail}` }
  }

  // Authority comes from the charter, read at start. An allowlist copied from a
  // form field would let the caller widen their own authority.
  const charter = input.charterId ? await readCharter(input.charterId) : null
  if (input.charterId && !charter) {
    return { ok: false, error: 'that charter does not exist' }
  }
  if (charter && charter.status !== 'active') {
    return { ok: false, error: `that charter is ${charter.status}, so nothing may run under it` }
  }

  const runId = randomUUID()
  await db().insert(runTable).values({
    id: runId,
    agentId: agent.agentId,
    agentName: agent.name,
    kind: input.kind,
    category: CATEGORY_FOR_KIND[input.kind] as 'rebalancing',
    charterId: charter?.id ?? null,
    subject: input.subject,
    chainId: 56,
    blockNumber,
    task: task as unknown as Record<string, unknown>,
    status: 'running',
    stage: 'quote',
    maxSpendUsd: input.maxSpendUsd,
  })
  await recordEvent(runId, {
    kind: 'quote',
    label: `Hired ${agent.name ?? agent.agentId} over ${executor.kind}`,
    detail: `pinned to block ${blockNumber}`,
    data: { endpoint: agent.endpoint },
  })

  // Deliberately not awaited: the buyer gets the run URL now and watches the
  // timeline fill in. Failures are recorded on the run, never thrown into the
  // void — an unhandled rejection here would leave a run "running" forever.
  void execute(runId, executor, task, charter, input.maxSpendUsd).catch(async (err: unknown) => {
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err)
    await recordEvent(runId, { kind: 'error', label: 'The run stopped unexpectedly', detail })
    await db().update(runTable).set({
      status: 'failed', ok: false, failure: detail, finishedAt: new Date(),
    }).where(eq(runTable.id, runId))
  })

  return { ok: true, runId }
}

async function execute(
  runId: string,
  executor: ReturnType<typeof executorFor> & object,
  task: StructuredTask,
  charter: Awaited<ReturnType<typeof readCharter>>,
  maxSpendUsd: number,
): Promise<void> {
  const outcome = await runHire({
    executor,
    task,
    runId,
    ctx: {
      buyer: task.subject,
      maxSpendUsd,
      charterId: charter?.id ?? null,
      allowlist: charter?.contracts.map((c) => c.to) ?? [],
      deadlineMs: 60_000,
    },
    onEvent: (event) => recordEvent(runId, event),
  })

  await db().update(runTable).set({
    status: outcome.ok ? 'complete' : 'failed',
    stage: outcome.stage,
    ok: outcome.ok,
    failure: outcome.failure,
    failureReason: outcome.run?.reason ?? null,
    feeUsd: outcome.quote?.feeUsd ?? null,
    latencyMs: outcome.elapsedMs,
    txHashes: outcome.run?.txHashes ?? [],
    result: (outcome.run?.result ?? null) as Record<string, unknown> | null,
    finishedAt: new Date(),
  }).where(eq(runTable.id, runId))

  if (outcome.receipt && outcome.receiptHash) {
    // The receipt is issued for failures too. A failed run with a legible
    // reason is evidence the system is real, and publishing failures is the
    // most credible thing this marketplace does.
    await db().insert(receiptTable).values({
      id: runId,
      runId,
      agentId: outcome.receipt.commercial.agentId,
      hash: outcome.receiptHash,
      body: outcome.receipt as unknown as Record<string, unknown>,
    }).onConflictDoNothing()

    // Anchor the hash so the receipt page can offer a transaction anyone can
    // open. Best effort: a receipt that could not be anchored is still real,
    // and the page shows it as unanchored rather than pretending.
    const anchored = await anchorReceipt(outcome.receiptHash)
    if (anchored.ok) {
      await db().update(receiptTable).set({
        anchorTxHash: anchored.txHash,
        anchorBlock: anchored.blockNumber,
        anchoredAt: new Date(),
      }).where(eq(receiptTable.id, runId))
      await recordEvent(runId, {
        kind: 'receipt',
        label: 'Receipt anchored on BNB Smart Chain testnet',
        detail: outcome.receiptHash,
        txHash: anchored.txHash,
      })
    } else {
      await recordEvent(runId, {
        kind: 'receipt',
        label: 'Receipt issued but not anchored',
        detail: anchored.detail ?? 'the anchor transaction did not land',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface RunView {
  run: typeof runTable.$inferSelect
  events: Array<typeof runEventTable.$inferSelect>
  receipt: typeof receiptTable.$inferSelect | null
}

export async function readRun(id: string): Promise<RunView | null> {
  const [row] = await db().select().from(runTable).where(eq(runTable.id, id)).limit(1)
  if (!row) return null
  const [events, receipts] = await Promise.all([
    db().select().from(runEventTable).where(eq(runEventTable.runId, id)).orderBy(asc(runEventTable.at)),
    db().select().from(receiptTable).where(eq(receiptTable.runId, id)).limit(1),
  ])
  return { run: row, events, receipt: receipts[0] ?? null }
}

export async function readReceipt(id: string) {
  const [row] = await db().select().from(receiptTable).where(eq(receiptTable.id, id)).limit(1)
  return row ?? null
}

export async function recentRuns(limit = 20) {
  return db().select().from(runTable).orderBy(desc(runTable.startedAt)).limit(limit)
}
