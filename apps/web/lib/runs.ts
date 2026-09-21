import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import { db, run as runTable, runEvent as runEventTable, runRejection as runRejectionTable, receipt as receiptTable } from '@marque/db'
import { verifyCharterCapability } from './charter-capability'
import {
  checkCharterBinding, executorFor, runHire, structuredTask,
  buildReceipt, type Receipt, type RunEventInput, type StructuredTask,
} from '@marque/execution'
import { publicClient } from '@marque/chain'
import { readCharter } from './charters'
import { anchorReceipt } from './anchor'
import { referenceAgent as refAgentMeta, displayName } from './reference-agents'
import { agentState } from './agent-state'

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
  charterToken?: string | null
}

export interface StartRunResult {
  ok: boolean
  runId?: string
  rejectionId?: string
  error?: string
}

const CATEGORY_FOR_KIND: Record<StructuredTask['kind'], string> = {
  rebalance: 'rebalancing',
  grid: 'grid',
  yield: 'yield',
  health_factor: 'health_factor',
}

interface ResolvedAgent {
  agentId: string
  name: string | null
  kind: string
  endpoint: string
  serviceId: number | null
  executableEndpoint: string | null
  probeId: number | null
}

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
    serviceId: null,
    executableEndpoint: null,
    probeId: null,
  }
}

/** Resolve one service without changing the selected ERC-8004 identity. */
async function resolveAgent(agentId: string, taskKind: StructuredTask['kind']): Promise<ResolvedAgent | null> {
  const reference = referenceAgent(agentId)
  if (reference) return reference
  const state = await agentState(agentId, taskKind)
  const service = state?.selectedService
  if (!state?.hireable || !service) return null
  const endpoint = service.protocol === 'a2a' || service.protocol === 'termix'
    ? service.discoveryEndpoint
    : service.executableEndpoint
  if (!endpoint) return null
  return {
    agentId: state.agentId,
    name: state.name,
    kind: service.protocol,
    endpoint,
    serviceId: service.serviceId,
    executableEndpoint: service.executableEndpoint,
    probeId: service.probeId,
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

async function rejectBeforeAcceptance(input: StartRunInput, agent: ResolvedAgent, reason: string, detail: string): Promise<StartRunResult> {
  const id = randomUUID()
  await db().insert(runRejectionTable).values({
    id,
    charterId: input.charterId!,
    agentId: agent.agentId,
    serviceId: agent.serviceId,
    protocol: agent.kind,
    taskKind: input.kind,
    subject: input.subject,
    reason,
    detail,
  })
  return { ok: false, rejectionId: id, error: `${detail} Rejected before run acceptance; evidence ${id}.` }
}

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
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
    const detail = err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err)
    return { ok: false, error: `that task is not well formed: ${detail}` }
  }

  const agent = await resolveAgent(input.agentId, task.kind)
  if (!agent) {
    return { ok: false, error: 'that exact agent has no fresh service proven compatible with this task' }
  }
  const executor = executorFor(agent.kind, agent.agentId, agent.endpoint, agent.name)
  if (!executor) {
    return { ok: false, error: `a ${agent.kind} endpoint exposes no task interface we can address` }
  }

  // Authority comes from the charter, read at start. An allowlist copied from a
  // form field would let the caller widen their own authority.
  const charter = input.charterId ? await readCharter(input.charterId) : null
  if (input.charterId && !charter) {
    return rejectBeforeAcceptance(input, agent, 'CHARTER_NOT_FOUND', 'that charter does not exist')
  }
  if (charter) {
    if (!verifyCharterCapability(input.charterToken, charter.id, charter.agentId)) {
      return rejectBeforeAcceptance(input, agent, 'AUTHORIZATION_FAILED', 'control of that charter was not proven')
    }
    const binding = checkCharterBinding({
      selectedAgentId: input.agentId, charterAgentId: charter.agentId,
      requestedCategory: CATEGORY_FOR_KIND[input.kind], charterCategory: charter.category,
      charterStatus: charter.status, expiresAt: charter.expiresAt,
    })
    if (!binding.ok) {
      const reason = charter.status === 'revoked' ? 'CHARTER_REVOKED'
        : charter.status === 'expired' || new Date(charter.expiresAt).getTime() <= Date.now() ? 'CHARTER_EXPIRED'
          : 'CHARTER_BINDING_REJECTED'
      return rejectBeforeAcceptance(input, agent, reason, binding.detail)
    }
  }

  const runId = randomUUID()
  const inputHash = `0x${createHash('sha256').update(JSON.stringify(task)).digest('hex')}`
  await db().insert(runTable).values({
    id: runId,
    agentId: agent.agentId,
    agentName: agent.name,
    serviceId: agent.serviceId,
    protocol: agent.kind,
    discoveryEndpoint: agent.endpoint,
    executableEndpoint: agent.executableEndpoint,
    probeId: agent.probeId,
    capability: input.kind,
    inputHash,
    correlationId: runId,
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
    data: { serviceId: agent.serviceId, protocol: agent.kind, probeId: agent.probeId, capability: input.kind, inputHash },
  })

  // Deliberately not awaited: the buyer gets the run URL now and watches the
  // timeline fill in. Failures are recorded on the run, never thrown into the
  // void — an unhandled rejection here would leave a run "running" forever.
  const serviceEvidence: NonNullable<Receipt['service']> = {
    serviceId: agent.serviceId, protocol: executor.kind,
    discoveryEndpoint: agent.endpoint, executableEndpoint: agent.executableEndpoint,
    probeId: agent.probeId,
  }
  void execute(runId, executor, task, charter, input.maxSpendUsd, serviceEvidence).catch(async (err: unknown) => {
    const detail = err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err)
    await recordEvent(runId, { kind: 'error', label: 'The run stopped unexpectedly', detail })
    const at = new Date().toISOString()
    const evidence = buildReceipt({
      runId, task,
      run: {
        ok: false, agentId: agent.agentId, kind: executor.kind, result: null,
        txHashes: [], feeUsd: null, latencyMs: 0, startedAt: at, finishedAt: at,
        reason: 'blocked', detail,
      },
      commercial: {
        declaredPrice: null, quoteStatus: 'failed', quoteProvenance: 'none',
        paidAmount: null, paidAsset: null, maxSpendUsd: input.maxSpendUsd,
        settled: false, settlementNote: 'no settlement: internal failure',
      },
      authority: {
        charterId: charter?.id ?? null,
        allowlist: charter?.contracts.map((c) => c.to) ?? [],
        spendCapUsd: input.maxSpendUsd, expiresAt: charter?.expiresAt ?? null,
        withinAuthority: false,
      },
      quality: { testId: null, pass: null, failedFields: [], caseId: null, groundTruthHash: null },
      artifactType: 'failure',
      failure: { stage: 'internal', class: 'INTERNAL_FAILURE', detail },
      service: {
        serviceId: agent.serviceId,
        protocol: executor.kind,
        discoveryEndpoint: agent.endpoint,
        executableEndpoint: agent.executableEndpoint,
        probeId: agent.probeId,
      },
    })
    await db().update(runTable).set({
      status: 'failed', stage: 'internal', ok: false, failure: detail,
      failureReason: 'blocked', terminalReason: 'INTERNAL_FAILURE', finishedAt: new Date(),
    }).where(eq(runTable.id, runId))
    await persistReceipt(runId, evidence.receipt, evidence.hash)
  })

  return { ok: true, runId }
}

async function execute(
  runId: string,
  executor: ReturnType<typeof executorFor> & object,
  task: StructuredTask,
  charter: Awaited<ReturnType<typeof readCharter>>,
  maxSpendUsd: number,
  service: NonNullable<Receipt['service']>,
): Promise<void> {
  // Re-read immediately before the external call. A Charter can be revoked or
  // expire after run acceptance; the accepted run must then terminate as an
  // authorization failure, never execute under the stale earlier read.
  const currentCharter = charter ? await readCharter(charter.id) : null
  const authorityCharter = currentCharter?.status === 'active' ? currentCharter : null
  const outcome = await runHire({
    executor,
    task,
    runId,
    service,
    ctx: {
      buyer: task.subject,
      maxSpendUsd,
      charterId: charter?.id ?? null,
      allowlist: authorityCharter?.contracts.map((c) => c.to) ?? [],
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
    terminalReason: outcome.receipt?.failure?.class ?? (outcome.ok ? 'SUCCEEDED' : 'EXECUTION_FAILED'),
    feeUsd: outcome.quote?.feeUsd ?? null,
    quote: outcome.quote as unknown as Record<string, unknown> | null,
    latencyMs: outcome.elapsedMs,
    txHashes: outcome.run?.txHashes ?? [],
    result: (outcome.run?.result ?? null) as Record<string, unknown> | null,
    finishedAt: new Date(),
  }).where(eq(runTable.id, runId))

  if (outcome.receipt && outcome.receiptHash) await persistReceipt(runId, outcome.receipt, outcome.receiptHash)
}

async function persistReceipt(runId: string, receipt: Receipt, hash: string): Promise<void> {
  const inserted = await db().insert(receiptTable).values({
    id: runId, runId, agentId: receipt.commercial.agentId,
    artifactType: receipt.artifactType ?? (receipt.execution.ok ? 'execution' : 'failure'),
    hash, body: receipt as unknown as Record<string, unknown>,
  }).onConflictDoNothing().returning({ id: receiptTable.id })
  // Evidence is immutable. A retry may observe the existing row but must never
  // anchor a newly generated hash for a body it did not insert.
  if (inserted.length === 0) return

  const anchored = await anchorReceipt(hash)
  if (anchored.ok) {
    await db().update(receiptTable).set({
      anchorTxHash: anchored.txHash, anchorBlock: anchored.blockNumber, anchoredAt: new Date(),
    }).where(eq(receiptTable.id, runId))
    await recordEvent(runId, {
      kind: 'receipt', label: 'Receipt anchored on BNB Smart Chain testnet',
      detail: hash, txHash: anchored.txHash,
    })
  } else {
    await recordEvent(runId, {
      kind: 'receipt', label: 'Receipt issued but not anchored',
      detail: anchored.detail ?? 'the anchor transaction did not land',
    })
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
