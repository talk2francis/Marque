/**
 * Marque database schema.
 *
 * TWO DATA TIERS (AGENTS.md invariant 12) — do not confuse them:
 *
 *  DERIVED STATE      rebuildable by re-running ingest from cursor zero.
 *                     agent, agentService, agentCategory, ingestCursor.
 *
 *  FIRST-PARTY OBS.   measurements we made and can never recreate.
 *                     probe, funnelSnapshot.
 *                     Never included in a rebuild drill. Never dropped.
 *
 * Tables in the first-party tier are marked FIRST-PARTY below.
 */
import {
  pgTable, text, integer, bigint, boolean, timestamp, jsonb, doublePrecision,
  uniqueIndex, index, primaryKey, serial,
} from 'drizzle-orm/pg-core'

/** How a number came to be known. Never widen without updating the UI legend. */
export const PROVENANCE = ['ONCHAIN', 'MEASURED', 'TESTED', 'CLAIMED'] as const
export type Provenance = (typeof PROVENANCE)[number]

/** The four hackathon categories, plus the honest escape hatch. */
export const CATEGORIES = [
  'rebalancing', 'grid', 'yield', 'health_factor', 'security', 'unclassified',
] as const
export type Category = (typeof CATEGORIES)[number]

/** Service transport kinds we know how to speak. */
export const SERVICE_KINDS = ['a2a', 'mcp', 'x402', 'erc8183', 'termix', 'rest', 'web'] as const
export type ServiceKind = (typeof SERVICE_KINDS)[number]

/** Which parse source produced a service row. They disagree; we record the winner. */
export const SERVICE_SOURCES = ['top_level', 'offchain_array', 'onchain_key'] as const
export type ServiceSource = (typeof SERVICE_SOURCES)[number]

/**
 * Probe failure taxonomy. Anything unclassified is a bug in the classifier,
 * not a new class.
 *
 * `unbound` and `empty_tools` are NOT transport failures — the endpoint
 * answered correctly and quickly. They mean the agent behind it has never been
 * bound to a runtime and exposes nothing callable, which docs/FINDINGS.md F-01
 * shows is how the overwhelming majority of BSC agents actually fail. They are
 * kept distinct so the graveyard can say *why* rather than just "dead".
 */
export const FAILURE_CLASSES = [
  'dns', 'tls', 'timeout', 'refused', 'http_4xx', 'http_5xx',
  'bad_schema', 'blocked_ssrf', 'template_unresolved', 'rate_limited',
  'unbound', 'empty_tools', 'unknown',
] as const
export type FailureClass = (typeof FAILURE_CLASSES)[number]

// ---------------------------------------------------------------------------
// DERIVED STATE
// ---------------------------------------------------------------------------

export const agent = pgTable('agent', {
  /** 8004scan's canonical "chainId:registry:tokenId" string. Our primary key. */
  id: text('id').primaryKey(),
  chainId: integer('chain_id').notNull(),
  tokenId: text('token_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  ownerAddress: text('owner_address'),
  name: text('name'),
  description: text('description'),
  imageUrl: text('image_url'),
  agentWallet: text('agent_wallet'),
  supportedProtocols: jsonb('supported_protocols').$type<string[]>().notNull().default([]),
  x402Supported: boolean('x402_supported').notNull().default(false),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),

  /** Full upstream record, so a reparse never needs a refetch. */
  rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>(),

  /**
   * 8004scan's own health verdict. NEVER displayed as current health
   * (AGENTS.md gotcha 6 — their health_checked_at can be months stale).
   * Our own probe table is the only source for displayed liveness.
   */
  scanHealthStatus: text('scan_health_status'),
  scanHealthCheckedAt: timestamp('scan_health_checked_at', { withTimezone: true }),
  scanTotalScore: doublePrecision('scan_total_score'),
  scanParseStatus: text('scan_parse_status'),
  /** Their parse error codes, e.g. IA002 — powers the honest graveyard view. */
  scanParseCodes: jsonb('scan_parse_codes').$type<string[]>().notNull().default([]),
  isEndpointVerified: boolean('is_endpoint_verified').notNull().default(false),

  /** True once we have fetched the detail record (services only exist there). */
  detailFetched: boolean('detail_fetched').notNull().default(false),
  detailFetchedAt: timestamp('detail_fetched_at', { withTimezone: true }),

  registryCreatedAt: timestamp('registry_created_at', { withTimezone: true }),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  chainTokenUq: uniqueIndex('agent_chain_token_uq').on(t.chainId, t.tokenId),
  chainIdx: index('agent_chain_idx').on(t.chainId),
  ownerIdx: index('agent_owner_idx').on(t.ownerAddress),
  detailIdx: index('agent_detail_idx').on(t.chainId, t.detailFetched),
}))

export const agentService = pgTable('agent_service', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agent.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<ServiceKind>().notNull(),
  endpoint: text('endpoint').notNull(),
  version: text('version'),
  declaredPrice: text('declared_price'),
  /** Which parse source won for this row (AGENTS.md gotcha 8). */
  source: text('source').$type<ServiceSource>().notNull(),
  /** True when the endpoint contains {agentId}-style placeholders (gotcha 9). */
  isTemplate: boolean('is_template').notNull().default(false),
  /** Template resolved against the agent's own metadata, when we could. */
  resolvedEndpoint: text('resolved_endpoint'),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agentKindEndpointUq: uniqueIndex('agent_service_uq').on(t.agentId, t.kind, t.endpoint),
  agentIdx: index('agent_service_agent_idx').on(t.agentId),
  kindIdx: index('agent_service_kind_idx').on(t.kind),
}))

export const agentCategory = pgTable('agent_category', {
  agentId: text('agent_id').notNull().references(() => agent.id, { onDelete: 'cascade' }),
  category: text('category').$type<Category>().notNull(),
  confidence: doublePrecision('confidence').notNull(),
  method: text('method').$type<'keyword' | 'semantic' | 'owner_declared'>().notNull(),
  /** The evidence that produced this label, so a classification is auditable. */
  rationale: text('rationale'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.agentId, t.category] }),
  categoryIdx: index('agent_category_category_idx').on(t.category),
}))

export const ingestCursor = pgTable('ingest_cursor', {
  source: text('source').primaryKey(),
  cursor: bigint('cursor', { mode: 'number' }).notNull().default(0),
  /** Free-form progress detail (last page hash, sweep id, totals seen). */
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// FIRST-PARTY OBSERVATIONS — never deletable, never in a rebuild drill
// ---------------------------------------------------------------------------

/** How alive an endpoint is. `ok` alone cannot express `unbound`. */
export const LIVENESS = ['live', 'unbound', 'bad_schema', 'dead'] as const
export type Liveness = (typeof LIVENESS)[number]

/** FIRST-PARTY. Every liveness measurement we have ever taken. */
export const probe = pgTable('probe', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  serviceId: integer('service_id'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  ok: boolean('ok').notNull(),
  latencyMs: integer('latency_ms'),
  statusCode: integer('status_code'),
  failureClass: text('failure_class').$type<FailureClass>(),
  detail: text('detail'),
  /** Finer-grained than `ok`: distinguishes "dead" from "answers but unbound". */
  liveness: text('liveness').$type<Liveness>(),
  /** Capabilities the endpoint advertised at probe time. */
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  /** The callable endpoint the descriptor pointed at, if any. */
  executableEndpoint: text('executable_endpoint'),
}, (t) => ({
  agentCheckedIdx: index('probe_agent_checked_idx').on(t.agentId, t.checkedAt.desc()),
  checkedIdx: index('probe_checked_idx').on(t.checkedAt.desc()),
}))

/**
 * FIRST-PARTY. A dated count of the supply funnel, straight from the source.
 * This is what the homepage funnel renders. Because every row is a real
 * measurement with a timestamp, no ratio is ever hardcoded (AGENTS.md gotcha 7).
 */
export const funnelSnapshot = pgTable('funnel_snapshot', {
  id: serial('id').primaryKey(),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  chainId: integer('chain_id').notNull(),
  /** Stage key, e.g. 'registered' | 'declares_service' | 'reachable' | 'classified' | 'warranted'. */
  stage: text('stage').notNull(),
  count: integer('count').notNull(),
  /** Where the number came from, so it can be re-derived. */
  method: text('method').notNull(),
}, (t) => ({
  takenIdx: index('funnel_taken_idx').on(t.takenAt.desc()),
  stageIdx: index('funnel_stage_idx').on(t.chainId, t.stage, t.takenAt.desc()),
}))

/**
 * FIRST-PARTY. A materialised conformance case.
 *
 * BSC public RPC retains only ~64 blocks of state (about 30 seconds at 0.45s
 * blocks), so a case cannot be graded by re-reading a pinned block later. The
 * ground truth is therefore CAPTURED once, frozen here with its block number
 * and a hash, and every agent is graded against that identical snapshot.
 *
 * This is stronger than re-fetching, not weaker: every agent sees byte-identical
 * inputs, and the snapshot is published so anyone with an archive node can
 * verify it against the chain. Never regenerated — a changed snapshot would
 * silently invalidate every result taken against it.
 */
export const conformanceCase = pgTable('conformance_case', {
  id: text('id').primaryKey(),
  testId: text('test_id').notNull(),
  category: text('category').$type<Category>().notNull(),
  chainId: integer('chain_id').notNull(),
  blockNumber: text('block_number').notNull(),
  /** The subject of the case: an address, a position id. */
  subject: jsonb('subject').$type<Record<string, string>>().notNull(),
  /** The policy the agent must comply with. Supplied, never inferred. */
  policy: jsonb('policy').notNull(),
  /** Frozen ground truth, computed by us from chain state at capture. */
  groundTruth: jsonb('ground_truth').notNull(),
  /** keccak-style hash of the frozen ground truth, published with results. */
  groundTruthHash: text('ground_truth_hash').notNull(),
  /** The exact question put to every agent. */
  prompt: text('prompt').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  /** False when superseded by a fresher case for the same subject. */
  active: boolean('active').notNull().default(true),
}, (t) => ({
  testActiveIdx: index('conformance_case_test_idx').on(t.testId, t.active),
}))

export type ConformanceCase = typeof conformanceCase.$inferSelect
export type NewConformanceCase = typeof conformanceCase.$inferInsert

/**
 * FIRST-PARTY. Every conformance run we have ever made.
 *
 * Includes the raw request and response, hashed, because a published pass or
 * fail is only credible if the evidence behind it can be re-read. Never
 * dropped, never recomputed (AGENTS.md invariant 12).
 */
export const conformanceResult = pgTable('conformance_result', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  testId: text('test_id').notNull(),
  testVersion: text('test_version').notNull(),
  toleranceRevision: integer('tolerance_revision').notNull(),
  category: text('category').$type<Category>().notNull(),
  /** The pinned case, so a result is reproducible. */
  caseId: text('case_id').notNull(),
  chainId: integer('chain_id').notNull(),
  blockNumber: text('block_number').notNull(),
  pass: boolean('pass').notNull(),
  /** Per-field diffs, each naming what was expected and what arrived. */
  diffs: jsonb('diffs').$type<unknown[]>().notNull().default([]),
  failedFields: jsonb('failed_fields').$type<string[]>().notNull().default([]),
  latencyMs: integer('latency_ms'),
  costUsd: doublePrecision('cost_usd'),
  request: jsonb('request'),
  response: jsonb('response'),
  requestHash: text('request_hash').notNull(),
  responseHash: text('response_hash').notNull(),
  error: text('error'),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agentRanIdx: index('conformance_agent_ran_idx').on(t.agentId, t.ranAt.desc()),
  testRanIdx: index('conformance_test_ran_idx').on(t.testId, t.ranAt.desc()),
  passIdx: index('conformance_pass_idx').on(t.pass),
}))

export type ConformanceResult = typeof conformanceResult.$inferSelect
export type NewConformanceResult = typeof conformanceResult.$inferInsert

export type Agent = typeof agent.$inferSelect
export type NewAgent = typeof agent.$inferInsert
export type AgentService = typeof agentService.$inferSelect
export type NewAgentService = typeof agentService.$inferInsert
export type Probe = typeof probe.$inferSelect
export type FunnelSnapshot = typeof funnelSnapshot.$inferSelect

// ---------------------------------------------------------------------------
// FIRST-PARTY OBSERVATIONS — the charter, run and receipt record (P7)
//
// These are measurements, not derived state. A charter that was granted and
// revoked on chain, the run that executed under it, and the receipt issued for
// that run are things that HAPPENED. They cannot be rebuilt by re-running
// ingest, and invariant 12 forbids dropping them.
//
// Note what is deliberately NOT here: session key material. Altana's session
// signer stays in process memory for the life of the process and is never
// written to our database. The durable, publicly verifiable record is the
// on-chain anchor plus the policy hash, both of which are stored below.
// ---------------------------------------------------------------------------

/** Terminal states are terminal: nothing moves a charter out of them. */
export const CHARTER_STATUS = ['active', 'revoked', 'expired', 'exhausted', 'failed'] as const
export type CharterStatusValue = (typeof CHARTER_STATUS)[number]

/** FIRST-PARTY. Every charter Marque has ever granted. */
export const charter = pgTable('charter', {
  id: text('id').primaryKey(),
  /** 'altana' or 'registry'. The UI states which, because they differ in kind. */
  provider: text('provider').notNull(),
  chainId: integer('chain_id').notNull(),
  /** The wallet whose assets are at stake. */
  ownerAddress: text('owner_address').notNull(),
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name'),
  /** Which of the four categories this charter was drawn for. */
  category: text('category').$type<Category>().notNull().default('unclassified'),
  status: text('status').$type<CharterStatusValue>().notNull(),

  /**
   * The grant, canonically serialised. Spend limits are stored as DECIMAL
   * STRINGS, never as JSON numbers — an 18-decimal cap exceeds 2^53 and would
   * be silently rounded, which is exactly the class of bug that produces a
   * charter that can never execute.
   */
  policy: jsonb('policy').$type<Record<string, unknown>>().notNull(),
  /** keccak of the canonical policy. What was anchored, and what is verified. */
  policyHash: text('policy_hash').notNull(),
  /** The revocation leaf, once revoked. */
  revokeHash: text('revoke_hash'),

  sessionKeyAddress: text('session_key_address'),
  grantTxHash: text('grant_tx_hash'),
  revokeTxHash: text('revoke_tx_hash'),
  verifyUrl: text('verify_url'),

  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),

  callsUsed: integer('calls_used').notNull().default(0),
  /** symbol -> cumulative spend in the token's smallest unit, as a string. */
  spent: jsonb('spent').$type<Record<string, string>>().notNull().default({}),

  /** Who asked for it: 'visitor' for the public desk, 'operator' for scripts. */
  grantedBy: text('granted_by').notNull().default('visitor'),
  label: text('label'),
}, (t) => ({
  statusIdx: index('charter_status_idx').on(t.status, t.grantedAt.desc()),
  ownerIdx: index('charter_owner_idx').on(t.ownerAddress),
  grantedIdx: index('charter_granted_idx').on(t.grantedAt.desc()),
}))

/** A run's lifecycle. `running` is the only non-terminal value. */
export const RUN_STATUS = ['running', 'complete', 'failed'] as const
export type RunStatusValue = (typeof RUN_STATUS)[number]

/** FIRST-PARTY. Every hire, whether it worked or not. */
export const run = pgTable('run', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name'),
  kind: text('kind').notNull(),
  category: text('category').$type<Category>().notNull(),
  charterId: text('charter_id'),
  /** The address the work was done for. */
  subject: text('subject').notNull(),
  chainId: integer('chain_id').notNull(),
  blockNumber: text('block_number').notNull(),
  task: jsonb('task').$type<Record<string, unknown>>().notNull(),

  status: text('status').$type<RunStatusValue>().notNull().default('running'),
  /** Which pipeline stage the run reached. */
  stage: text('stage').notNull().default('quote'),
  ok: boolean('ok'),
  /** Plain-English statement of what stopped the run. */
  failure: text('failure'),
  failureReason: text('failure_reason'),

  feeUsd: doublePrecision('fee_usd'),
  maxSpendUsd: doublePrecision('max_spend_usd').notNull(),
  latencyMs: integer('latency_ms'),
  txHashes: jsonb('tx_hashes').$type<string[]>().notNull().default([]),

  /** The agent's answer, whole. The receipt hash covers it. */
  result: jsonb('result'),

  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => ({
  startedIdx: index('run_started_idx').on(t.startedAt.desc()),
  agentIdx: index('run_agent_idx').on(t.agentId, t.startedAt.desc()),
  charterIdx: index('run_charter_idx').on(t.charterId),
}))

/**
 * FIRST-PARTY. The Run Room timeline.
 *
 * Every event carries a REAL timestamp taken when it happened. The Run Room
 * renders these and nothing else: a timeline with invented intermediate steps
 * would be a fabricated metric wearing a clock (invariant 4).
 */
export const runEvent = pgTable('run_event', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull().references(() => run.id, { onDelete: 'cascade' }),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** 'quote' | 'authority' | 'execute' | 'tx' | 'grade' | 'receipt' | 'refused' | 'error' */
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  detail: text('detail'),
  txHash: text('tx_hash'),
  data: jsonb('data').$type<Record<string, unknown>>(),
}, (t) => ({
  runAtIdx: index('run_event_run_idx').on(t.runId, t.at),
}))

/** FIRST-PARTY. The four-proof receipt, and its anchor. */
export const receipt = pgTable('receipt', {
  /** Same id as the run. One run, one receipt. */
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  agentId: text('agent_id').notNull(),
  /** Content hash of the canonically serialised receipt. */
  hash: text('hash').notNull(),
  body: jsonb('body').$type<Record<string, unknown>>().notNull(),
  /** Transaction that anchored the hash on MarqueRegistry, when anchored. */
  anchorTxHash: text('anchor_tx_hash'),
  anchorBlock: text('anchor_block'),
  anchoredAt: timestamp('anchored_at', { withTimezone: true }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  hashIdx: index('receipt_hash_idx').on(t.hash),
  issuedIdx: index('receipt_issued_idx').on(t.issuedAt.desc()),
}))

export type Charter = typeof charter.$inferSelect
export type NewCharter = typeof charter.$inferInsert
export type Run = typeof run.$inferSelect
export type NewRun = typeof run.$inferInsert
export type RunEvent = typeof runEvent.$inferSelect
export type NewRunEvent = typeof runEvent.$inferInsert
export type ReceiptRow = typeof receipt.$inferSelect
export type NewReceiptRow = typeof receipt.$inferInsert

// ---------------------------------------------------------------------------
// FIRST-PARTY OBSERVATIONS — the Ledger (P8b)
//
// MCS tests facts; the Ledger tests judgement. These rows are measurements —
// a benchmark run, a stopwatch reading, a sealed recommendation and how it
// resolved. None of them can be rebuilt from chain, and invariant 12 forbids
// dropping them. The Ledger is the single most deletable-looking and least
// deletable thing in this database.
// ---------------------------------------------------------------------------

/** Which arm produced an output. Stripped before blind scoring. */
export const BENCHMARK_ARMS = ['agent', 'manual'] as const
export type BenchmarkArm = (typeof BENCHMARK_ARMS)[number]

/** FIRST-PARTY. One benchmark: a task, a rubric, and the arms that answered it. */
export const benchmark = pgTable('benchmark', {
  /** e.g. ADV-01. Stable and published. */
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').$type<Category>().notNull(),
  /** The agent arm's identity. */
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name'),
  /** The exact task text both arms were given. */
  task: text('task').notNull(),
  taskHash: text('task_hash').notNull(),
  /** Pinned inputs: subject, block, policy. */
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  inputHash: text('input_hash').notNull(),

  /**
   * The rubric, PRE-REGISTERED. Written before any arm runs, and hashed, so a
   * later result cannot be graded by a quietly different standard.
   */
  rubricVersion: text('rubric_version').notNull(),
  rubricHash: text('rubric_hash').notNull(),
  rubric: jsonb('rubric').$type<Record<string, unknown>>().notNull(),
  rubricRegisteredAt: timestamp('rubric_registered_at', { withTimezone: true }).notNull().defaultNow(),

  /** Why this benchmark exists and what it would take to falsify the result. */
  method: text('method').notNull(),
  /** False for the stretch benchmark until it is actually run. */
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  categoryIdx: index('benchmark_category_idx').on(t.category),
}))

/** FIRST-PARTY. One arm, one repetition. Every arm runs at least twice. */
export const benchmarkRun = pgTable('benchmark_run', {
  id: serial('id').primaryKey(),
  benchmarkId: text('benchmark_id').notNull().references(() => benchmark.id, { onDelete: 'restrict' }),
  arm: text('arm').$type<BenchmarkArm>().notNull(),
  /** 1 or 2. A single run is an anecdote. */
  rep: integer('rep').notNull(),

  /** The answer, whole. Hashed, so the output shown is the output graded. */
  output: jsonb('output'),
  outputText: text('output_text'),
  outputHash: text('output_hash').notNull(),

  /** Wall clock. Measured, never estimated (escalation gate 4). */
  elapsedMs: integer('elapsed_ms').notNull(),
  /** How the elapsed figure was obtained, in words. Published. */
  timingMethod: text('timing_method').notNull(),

  blockNumber: text('block_number').notNull(),
  /** ERC-8183 job id, when the arm was hired through the commerce rail. */
  jobId: text('job_id'),
  txHashes: jsonb('tx_hashes').$type<string[]>().notNull().default([]),

  /** Itemized: gas, LLM, agent fee and human time are separate lines. */
  costBreakdown: jsonb('cost_breakdown').$type<Record<string, unknown>>().notNull(),

  /** Filled after blind scoring. Null until then, never a placeholder zero. */
  scoreBreakdown: jsonb('score_breakdown').$type<Record<string, number>>(),
  scoreTotal: doublePrecision('score_total'),
  scoreOutOf: doublePrecision('score_out_of'),
  scoreReasons: jsonb('score_reasons').$type<Record<string, string>>(),
  scoredAt: timestamp('scored_at', { withTimezone: true }),
  /** True when the scorer could not see which arm this was. */
  scoredBlind: boolean('scored_blind').notNull().default(false),

  /** The full manifest, and its hash. */
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
  manifestHash: text('manifest_hash').notNull(),

  /** Screen recording or other evidence for a manual arm. */
  evidenceUrl: text('evidence_url'),
  note: text('note'),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  benchArmIdx: index('benchmark_run_bench_idx').on(t.benchmarkId, t.arm, t.rep),
  hashIdx: index('benchmark_run_hash_idx').on(t.manifestHash),
}))

/** How a sealed call turned out. `unresolved` is honest, not a placeholder. */
export const SEAL_OUTCOMES = ['correct', 'incorrect', 'unresolved', 'void'] as const
export type SealOutcomeValue = (typeof SEAL_OUTCOMES)[number]

/**
 * FIRST-PARTY. Every recommendation, hashed and anchored BEFORE its outcome.
 *
 * This table is what makes a track record falsifiable. Without it any win rate
 * is assembled after the fact from a set chosen once the answers were known.
 */
export const sealedCall = pgTable('sealed_call', {
  id: serial('id').primaryKey(),
  /** keccak(recommendation ‖ block ‖ agentId ‖ timestamp). */
  hash: text('hash').notNull().unique(),
  agentId: text('agent_id').notNull(),
  category: text('category').$type<Category>().notNull(),

  /** The recommendation exactly as issued. */
  recommendation: jsonb('recommendation').$type<Record<string, unknown>>().notNull(),
  /** The subject it was about, so a scorer knows what to re-read. */
  subject: text('subject').notNull(),
  /** Block at issue. The seal precedes the outcome by construction. */
  blockNumber: text('block_number').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),

  /** What must be true later for this to count as correct. Written at issue. */
  resolutionRule: text('resolution_rule').notNull(),
  resolveAfter: timestamp('resolve_after', { withTimezone: true }).notNull(),

  /** The on-chain seal. Null means the anchor did not land, and we say so. */
  sealTxHash: text('seal_tx_hash'),
  sealBlock: text('seal_block'),
  sealedAt: timestamp('sealed_at', { withTimezone: true }),
  /** 97 while charters and seals live on testnet. */
  chainId: integer('chain_id').notNull().default(97),

  outcome: text('outcome').$type<SealOutcomeValue>().notNull().default('unresolved'),
  /** What the chain said when the call was resolved. */
  resolutionEvidence: jsonb('resolution_evidence').$type<Record<string, unknown>>(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedAtBlock: text('resolved_at_block'),
}, (t) => ({
  agentIdx: index('sealed_call_agent_idx').on(t.agentId, t.issuedAt.desc()),
  outcomeIdx: index('sealed_call_outcome_idx').on(t.outcome),
  resolveIdx: index('sealed_call_resolve_idx').on(t.resolveAfter),
}))

export type Benchmark = typeof benchmark.$inferSelect
export type NewBenchmark = typeof benchmark.$inferInsert
export type BenchmarkRun = typeof benchmarkRun.$inferSelect
export type NewBenchmarkRun = typeof benchmarkRun.$inferInsert
export type SealedCall = typeof sealedCall.$inferSelect
export type NewSealedCall = typeof sealedCall.$inferInsert
