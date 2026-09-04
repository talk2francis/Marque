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
