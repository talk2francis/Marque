import { comparisonMissing } from './completion.js'
import { performance } from 'node:perf_hooks'
import { eq, and, inArray } from 'drizzle-orm'
import { db, benchmark as benchmarkTable, benchmarkRun, benchmarkRunProvenance as benchmarkRunProvenanceTable } from '@marque/db'
import { publicClient, archiveClient } from '@marque/chain'
import { BENCHMARKS, type BenchmarkSpec } from './benchmarks.js'
import { buildRubric, rubricHash } from './rubric.js'
import { hashContent, manifestHash, totalCost, type BenchmarkManifest, type CostBreakdown } from './manifest.js'

/**
 * The immutable context one comparison SITTING resolves ONCE.
 *
 * Every repetition of that sitting runs against exactly this — the same frozen
 * task, the same pinned block, the same batch. The old runner fetched a fresh
 * head inside each repetition and re-registered the benchmark per rep, so rep 1
 * and rep 2 could read different blocks and the "frozen" task could be rewritten
 * mid-sitting. A sitting is one chain-state reference or it is not a sitting.
 */
export interface BenchmarkContext {
  benchmarkId: string
  /** The block every repetition answers for. Decimal string. */
  block: string
  blockHash: string | null
  batch: string
  batchKind: 'original' | 'comparison_replay' | 'reproduction'
  /** The exact frozen task text handed to the agent — never re-derived per rep. */
  task: string
  taskHash: string
  inputHash: string
  rubricVersion: string
  rubricHash: string
  /**
   * When true (historical replay), a repetition whose engine reports a block
   * other than `block` is INVALID and is recorded with a note, not as a result.
   */
  assertObservedBlock: boolean
}

/** The single pinned block encoded in a frozen benchmark task, or null. */
export function pinnedBlockOf(task: string): string | null {
  const all = [...task.matchAll(/Block:\s*(\d+)/gi)].map((m) => m[1])
  const uniq = [...new Set(all)]
  return uniq.length === 1 ? uniq[0]! : null
}

/**
 * The benchmark runner.
 *
 * It does exactly two things and refuses to do a third: it REGISTERS a
 * benchmark (task, inputs, rubric — all hashed, before any answer exists), and
 * it RUNS the agent arm twice, recording a manifest for each repetition.
 *
 * It does not score. Scoring is blind and happens after both arms exist, from
 * outputs with their source labels stripped — a runner that scored the agent
 * arm at the moment it produced it would be scoring with the label in plain
 * sight, which is the failure mode this whole design exists to avoid.
 *
 * It also does not run the manual arm. A human with a stopwatch does that, and
 * the intake page hashes what they paste. Simulating the manual arm would make
 * the entire comparison worthless, and it would be so easy to do that saying so
 * out loud is worth the line.
 */

export interface RunArmResult {
  ok: boolean
  rep: number
  elapsedMs: number
  outputHash: string
  manifestHash: string
  detail?: string
}

/**
 * Register a benchmark: freeze the task, the inputs and the rubric.
 *
 * Idempotent on id. A benchmark whose task or rubric has changed gets a NEW
 * hash, which is the point — the row records what was actually promised before
 * the first answer arrived.
 */
export async function registerBenchmark(spec: BenchmarkSpec, block: string): Promise<{ id: string; rubricHash: string; taskHash: string }> {
  const task = spec.task({ block })
  const rubric = buildRubric(spec.category)
  const rHash = rubricHash(rubric)
  const tHash = hashContent(task)
  const iHash = hashContent(spec.input)

  const row = {
    id: spec.id,
    title: spec.title,
    category: spec.category as 'security',
    agentId: spec.agentId,
    agentName: spec.agentName,
    task,
    taskHash: tHash,
    input: spec.input,
    inputHash: iHash,
    rubricVersion: rubric.version,
    rubricHash: rHash,
    rubric: rubric as unknown as Record<string, unknown>,
    method: spec.method,
    published: false,
  }
  await db().insert(benchmarkTable).values(row).onConflictDoUpdate({
    target: benchmarkTable.id,
    // The rubric is re-registered only if it has genuinely changed; the
    // registration timestamp is NOT touched, so the record of when the
    // standard was fixed survives a re-run.
    set: {
      title: row.title, task: row.task, taskHash: row.taskHash,
      input: row.input, inputHash: row.inputHash,
      rubricVersion: row.rubricVersion, rubricHash: row.rubricHash, rubric: row.rubric,
      method: row.method,
    },
  })
  return { id: spec.id, rubricHash: rHash, taskHash: tHash }
}

/**
 * Load the ALREADY-FROZEN benchmark for a historical replay.
 *
 * Unlike `registerBenchmark`, this never writes: a replay reproduces what was
 * promised before either arm ran, so it must READ the frozen record, not
 * re-register it into a new state. It refuses if the row is missing or if the
 * caller's expected hash does not match what is stored.
 */
export async function loadFrozenBenchmark(
  id: string,
  expect?: { taskHash?: string },
): Promise<{ id: string; task: string; taskHash: string; inputHash: string; rubricVersion: string; rubricHash: string; block: string | null }> {
  const [row] = await db().select().from(benchmarkTable).where(eq(benchmarkTable.id, id)).limit(1)
  if (!row) throw new Error(`benchmark ${id} is not registered`)
  if (expect?.taskHash && expect.taskHash !== row.taskHash) {
    throw new Error(`benchmark ${id} frozen task hash ${row.taskHash} does not match expected ${expect.taskHash}`)
  }
  return {
    id: row.id,
    task: row.task,
    taskHash: row.taskHash,
    inputHash: row.inputHash,
    rubricVersion: row.rubricVersion,
    rubricHash: row.rubricHash,
    block: pinnedBlockOf(row.task),
  }
}

/** How the agent arm is reached: the same public A2A face any buyer uses. */
async function askAgent(baseUrl: string, agentSlug: string, task: string): Promise<{ answer: unknown; elapsedMs: number; error?: string }> {
  const started = performance.now()
  try {
    const res = await fetch(`${baseUrl}/agents/${agentSlug}/a2a`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'message/send',
        params: { message: { role: 'user', parts: [{ kind: 'text', text: task }] } },
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const elapsedMs = performance.now() - started
    if (!res.ok) return { answer: null, elapsedMs, error: `http ${res.status}` }
    const body = (await res.json()) as {
      result?: { artifacts?: Array<{ parts?: Array<{ text?: string }> }> }
      error?: { message?: string }
    }
    if (body.error) return { answer: null, elapsedMs, error: body.error.message ?? 'agent error' }
    const text = body.result?.artifacts?.[0]?.parts?.[0]?.text
    if (!text) return { answer: null, elapsedMs, error: 'no artifact text' }
    return { answer: JSON.parse(text), elapsedMs }
  } catch (err) {
    return { answer: null, elapsedMs: performance.now() - started, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Resolve the sitting context ONCE.
 *
 * For a fresh benchmark: pick the current head, register the task at it, return
 * the frozen row. For a historical replay: load the already-frozen row, take
 * the block from its immutable task, do NOT re-register.
 */
async function resolveContext(
  spec: BenchmarkSpec,
  opts: { batch: string; batchKind: BenchmarkContext['batchKind']; replay?: boolean },
): Promise<BenchmarkContext> {
  if (opts.replay) {
    const frozen = await loadFrozenBenchmark(spec.id)
    if (!frozen.block) {
      throw new Error(`benchmark ${spec.id} frozen task does not pin exactly one block; cannot replay`)
    }
    const client = archiveClient()
    const blockHash = client
      ? await client.getBlock({ blockNumber: BigInt(frozen.block) }).then((b) => b.hash).catch(() => null)
      : null
    return {
      benchmarkId: spec.id,
      block: frozen.block,
      blockHash,
      batch: opts.batch,
      batchKind: opts.batchKind,
      task: frozen.task,
      taskHash: frozen.taskHash,
      inputHash: frozen.inputHash,
      rubricVersion: frozen.rubricVersion,
      rubricHash: frozen.rubricHash,
      assertObservedBlock: true,
    }
  }

  const block = (await publicClient().getBlockNumber()).toString()
  await registerBenchmark(spec, block)
  const [row] = await db().select().from(benchmarkTable).where(eq(benchmarkTable.id, spec.id)).limit(1)
  if (!row) throw new Error(`benchmark ${spec.id} was not registered`)
  const blockHash = await publicClient().getBlock({ blockNumber: BigInt(block) }).then((b) => b.hash).catch(() => null)
  return {
    benchmarkId: spec.id,
    block,
    blockHash,
    batch: opts.batch,
    batchKind: opts.batchKind,
    task: row.task,
    taskHash: row.taskHash,
    inputHash: row.inputHash,
    rubricVersion: row.rubricVersion,
    rubricHash: row.rubricHash,
    assertObservedBlock: false,
  }
}

/** The block an engine says it read, dug out of its answer shape. */
function observedBlock(answer: unknown): string | null {
  if (!answer || typeof answer !== 'object') return null
  const a = answer as Record<string, unknown>
  const b = a['blockNumber'] ?? a['block'] ?? (a['readAt'] as Record<string, unknown> | undefined)
  return typeof b === 'string' || typeof b === 'number' ? String(b) : null
}

/**
 * Run the agent arm once and record its manifest.
 *
 * The elapsed figure is wall clock around the HTTP call a buyer would make —
 * including TLS, the reverse proxy and the SSRF guard, because those are part
 * of what a buyer waits for and excluding them would flatter the agent.
 *
 * `opts.context` is passed by `runAgentArms` / `runComparisonReplay` so every
 * repetition of a sitting shares one block and one frozen task. Without it (the
 * public "reproduce" button) the run registers at the current head, as a
 * single-repetition reproduction.
 */
export async function runAgentArm(
  spec: BenchmarkSpec,
  rep: number,
  opts: { baseUrl: string; batch: string; context?: BenchmarkContext },
): Promise<RunArmResult> {
  const ctx = opts.context ?? await resolveContext(spec, { batch: opts.batch, batchKind: 'reproduction' })
  const block = ctx.block

  const slug = spec.agentId.replace(/^marque:/, '')
  const { answer, elapsedMs, error: askError } = await askAgent(opts.baseUrl, slug, ctx.task)

  // A historical replay that answered a DIFFERENT block than the one asked for
  // has not produced a comparable result. Record it, note why, do not treat it
  // as a valid repetition (it stays ungraded — a wrong-block answer is not the
  // agent's quality, it is a state-access failure).
  const seen = observedBlock(answer)
  const blockMismatch = ctx.assertObservedBlock && seen !== null && seen !== block
  const error = askError ?? (blockMismatch ? `observed block ${seen} != pinned block ${block}` : undefined)

  const outputHash = hashContent(answer ?? { error })
  const cost: CostBreakdown = totalCost({
    // The agent arm spent no gas: every engine is read-only.
    gasUsd: 0,
    // And no LLM. The engines are deterministic arithmetic over chain reads,
    // which is why this figure is zero rather than unknown.
    llmUsd: 0,
    // The free A2A face is free. The paid rails charge the listed price; this
    // arm did not use them, and reporting the list price as if it had been
    // paid would be a fabricated cost.
    agentFeeUsd: 0,
    humanUsd: null,
    humanRateUsdPerHour: null,
  })

  const manifest: BenchmarkManifest = {
    version: '1',
    benchmark_id: spec.id,
    arm: 'agent',
    rep,
    task_hash: ctx.taskHash,
    input_hash: ctx.inputHash,
    manual_output_hash: null,
    agent_output_hash: outputHash,
    agent_id: spec.agentId,
    block,
    block_hash: ctx.blockHash,
    observed_block: seen,
    state_source: ctx.assertObservedBlock ? 'archive' : 'public',
    job_id: null,
    tx_hashes: [],
    cost_breakdown: cost,
    elapsed_ms: Math.round(elapsedMs),
    rubric_version: ctx.rubricVersion,
    rubric_hash: ctx.rubricHash,
    // Empty until blind scoring. NOT zero — an unscored arm and an arm that
    // scored zero are different facts.
    score_breakdown: {},
    score_total: 0,
    score_out_of: 0,
    ran_at: new Date().toISOString(),
  }

  const mHash = manifestHash(manifest)
  const note = askError
    ? `the agent did not answer: ${askError}`
    : blockMismatch
      ? `INVALID: the agent answered for block ${seen}, not the pinned block ${block}`
      : undefined
  await db().insert(benchmarkRun).values({
    benchmarkId: spec.id,
    arm: 'agent',
    rep,
    batch: ctx.batch,
    output: (answer ?? { error }) as Record<string, unknown>,
    outputText: JSON.stringify(answer ?? { error }),
    outputHash,
    elapsedMs: Math.round(elapsedMs),
    timingMethod: 'wall clock around the public HTTPS request, measured with performance.now(); includes TLS, the reverse proxy and the SSRF guard because a buyer waits for those too',
    blockNumber: block,
    txHashes: [],
    costBreakdown: cost as unknown as Record<string, unknown>,
    manifest: manifest as unknown as Record<string, unknown>,
    manifestHash: mHash,
    ...(note ? { note } : {}),
  })

  return {
    ok: !error,
    rep,
    elapsedMs: Math.round(elapsedMs),
    outputHash,
    manifestHash: mHash,
    ...(error ? { detail: error } : {}),
  }
}

/**
 * Both repetitions of the agent arm, as ONE sitting.
 *
 * The sitting resolves its context — block, block hash, frozen task — ONCE, up
 * front, and every repetition runs against exactly that. Re-running later adds
 * a new sitting rather than replacing this one, because a run is a first-party
 * observation and those are never overwritten (invariant 12). Two sittings read
 * different chain state, so their repetitions are not interchangeable and must
 * never be pooled or picked between.
 */
export async function runAgentArms(spec: BenchmarkSpec, opts: { baseUrl: string; reps?: number }): Promise<RunArmResult[]> {
  const reps = opts.reps ?? 2
  const batch = `b${(await publicClient().getBlockNumber()).toString()}`
  const context = await resolveContext(spec, { batch, batchKind: 'original' })
  const out: RunArmResult[] = []
  for (let rep = 1; rep <= reps; rep++) {
    out.push(await runAgentArm(spec, rep, { baseUrl: opts.baseUrl, batch, context }))
  }
  return out
}

/**
 * A HISTORICAL comparison replay: run the agent arm against the block the frozen
 * benchmark task already pins, using the archive endpoint.
 *
 * This is not a reproduction. A reproduction happens at today's head, on a
 * visitor's click, and never becomes the published sitting. A comparison replay
 * answers the SAME frozen task at the SAME immutable block as the human arm,
 * because the human's evidence pinned that block and only the agent side is
 * being executed later. It IS eligible to become the published agent sitting —
 * gated on every repetition actually reading the pinned block (`assertObserved`
 * in the context).
 *
 * The frozen benchmark is never re-registered. Each replay gets its own batch;
 * running it twice does not silently create a competing set — the caller passes
 * an explicit batch id and this asserts it does not already exist.
 */
export async function runComparisonReplay(
  id: string,
  opts: { baseUrl: string; reps?: number; batch?: string },
): Promise<{ batch: string; block: string; blockHash: string | null; results: RunArmResult[] }> {
  const spec = BENCHMARKS.find((b) => b.id === id)
  if (!spec) throw new Error(`no benchmark ${id}`)
  const reps = opts.reps ?? 2
  const batch = opts.batch ?? `${REPLAY_PREFIX}${Date.now()}`

  const existing = await db().select().from(benchmarkRun)
    .where(and(eq(benchmarkRun.benchmarkId, id), eq(benchmarkRun.batch, batch))).limit(1)
  if (existing.length > 0) throw new Error(`replay batch ${batch} already has runs for ${id}; refusing to add more`)

  const context = await resolveContext(spec, { batch, batchKind: 'comparison_replay', replay: true })
  const results: RunArmResult[] = []
  for (let rep = 1; rep <= reps; rep++) {
    results.push(await runAgentArm(spec, rep, { baseUrl: opts.baseUrl, batch, context }))
  }
  return { batch, block: context.block, blockHash: context.blockHash, results }
}

/**
 * Batches produced by the public "reproduce" button.
 *
 * A reproduction is a real run and is kept like any other, but it is NOT part
 * of the registered comparison: it happens at a later block, on demand, as
 * many times as a visitor likes. If it counted as the latest sitting, anyone
 * could quietly replace the published result by clicking a button.
 */
export const REPRO_PREFIX = 'repro-'
/**
 * A comparison replay: the agent arm run later against the block the frozen task
 * already pins. Unlike a reproduction it CAN become the published sitting —
 * `latestBatch` includes it — because it answers the same frozen task at the
 * same immutable block as the human arm.
 */
export const REPLAY_PREFIX = 'replay-'

export function isReproduction(batch: string): boolean {
  return batch.startsWith(REPRO_PREFIX)
}

export function isComparisonReplay(batch: string): boolean {
  return batch.startsWith(REPLAY_PREFIX)
}

/**
 * The most recent PUBLISHED sitting of an arm, or null if it has never run.
 *
 * Ordered by the highest run id in the batch, so "latest" is the sitting that
 * finished last rather than whichever row the database happened to return.
 * Reproductions are excluded — see REPRO_PREFIX.
 */
export async function latestBatch(id: string, arm: 'agent' | 'manual'): Promise<string | null> {
  const runs = (await db().select().from(benchmarkRun)
    .where(and(eq(benchmarkRun.benchmarkId, id), eq(benchmarkRun.arm, arm))))
    .filter((r) => !isReproduction(r.batch))
  if (runs.length === 0) return null
  let best = runs[0] as typeof runs[number]
  for (const r of runs) if (r.id > best.id) best = r
  return best.batch
}

/** Mint a batch id for a one-off reproduction at the current block. */
export async function reproductionBatch(): Promise<string> {
  return `${REPRO_PREFIX}${(await publicClient().getBlockNumber()).toString()}`
}

export function mandatoryBenchmarks(): BenchmarkSpec[] {
  return BENCHMARKS.filter((b) => b.mandatory)
}

/**
 * What is still missing before a benchmark can be published as complete.
 *
 * Counts repetitions WITHIN the latest sitting of each arm, never across
 * sittings. Four runs from two sittings is not "four repetitions"; it is two
 * sittings of two, read at different blocks, and pooling them would overstate
 * the evidence.
 */
export async function benchmarkStatus(id: string): Promise<{
  id: string
  agentReps: number
  manualReps: number
  agentBatch: string | null
  manualBatch: string | null
  earlierSittings: number
  scored: number
  complete: boolean
  missing: string[]
}> {
  const runs = await db().select().from(benchmarkRun).where(eq(benchmarkRun.benchmarkId, id))
  const agentBatch = await latestBatch(id, 'agent')
  const manualBatch = await latestBatch(id, 'manual')
  const current = runs.filter(
    (r) => (r.arm === 'agent' && r.batch === agentBatch) || (r.arm === 'manual' && r.batch === manualBatch),
  )
  const agentReps = current.filter((r) => r.arm === 'agent').length
  const manualReps = current.filter((r) => r.arm === 'manual').length
  const scored = current.filter((r) => r.scoreTotal !== null).length
  const earlierSittings = new Set(
    runs.filter((r) => r.batch !== agentBatch && r.batch !== manualBatch).map((r) => `${r.arm}:${r.batch}`),
  ).size

  // Provenance supplements: recovered blocks for runs that recorded none.
  const prov = current.length
    ? await db().select().from(benchmarkRunProvenanceTable)
        .where(inArray(benchmarkRunProvenanceTable.runId, current.map((r) => r.id)))
    : []
  const isBlk = (s: string | null | undefined) => typeof s === 'string' && /^[1-9]\d*$/.test(s)
  const withProv = current.map((r) => {
    const fix = prov.find((p) => p.runId === r.id && p.field === 'block_number')
    const effectiveBlock = isBlk(r.blockNumber) ? r.blockNumber
      : fix && isBlk(fix.effectiveValue) ? fix.effectiveValue : r.blockNumber
    return { ...r, effectiveBlock, blockRecovered: Boolean(fix) && !isBlk(r.blockNumber) }
  })

  const [registered] = await db().select().from(benchmarkTable).where(eq(benchmarkTable.id, id)).limit(1)
  const missing = registered ? comparisonMissing(registered, withProv) : ['registered benchmark evidence']
  return {
    id, agentReps, manualReps, agentBatch, manualBatch, earlierSittings, scored,
    complete: missing.length === 0, missing,
  }
}

export async function runsFor(id: string) {
  return db().select().from(benchmarkRun).where(eq(benchmarkRun.benchmarkId, id))
    .orderBy(benchmarkRun.arm, benchmarkRun.batch, benchmarkRun.rep)
}

/** Only the runs the Ledger publishes: the latest sitting of each arm. */
export async function currentRunsFor(id: string) {
  const all = await runsFor(id)
  const agentBatch = await latestBatch(id, 'agent')
  const manualBatch = await latestBatch(id, 'manual')
  return all.filter(
    (r) => (r.arm === 'agent' && r.batch === agentBatch) || (r.arm === 'manual' && r.batch === manualBatch),
  )
}

/**
 * One repetition of one arm.
 *
 * Resolves within a single sitting. `batch` defaults to the latest, and is
 * never left to the database to choose: before batches existed this query
 * ended in `.limit(1)` over four matching rows and returned an arbitrary one,
 * which is exactly the class of silent guess that has cost this project five
 * bugs.
 */
export async function armRun(id: string, arm: 'agent' | 'manual', rep: number, batch?: string) {
  const b = batch ?? (await latestBatch(id, arm))
  if (b === null) return null
  const [row] = await db().select().from(benchmarkRun)
    .where(and(
      eq(benchmarkRun.benchmarkId, id),
      eq(benchmarkRun.arm, arm),
      eq(benchmarkRun.rep, rep),
      eq(benchmarkRun.batch, b),
    ))
    .limit(1)
  return row ?? null
}
