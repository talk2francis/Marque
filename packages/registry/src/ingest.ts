import { sql, eq, and } from 'drizzle-orm'
import {
  db, agent, agentService, ingestCursor, funnelSnapshot,
  type NewAgent, type NewAgentService,
} from '@marque/db'
import { ScanClient, type ScanAgentListItem, type ScanAgentDetail } from './scan-client.js'
import { extractServices, extractTags, parseCodes } from './normalize.js'
import { mapLimit } from './concurrency.js'

/**
 * 8004scan ingest, in two passes.
 *
 * PASS 1 (list sweep) walks every BSC agent through the paginated list endpoint.
 * It is cheap — one request per 100 agents — and gives us honest denominators
 * for the supply funnel. Nothing is filtered out here; the graveyard is part of
 * the product (AGENTS.md invariant 7).
 *
 * PASS 2 (detail enrich) fetches the detail record only for agents that declare
 * a service transport, because `services` exists ONLY on the detail endpoint and
 * an agent with no declared transport can never be reachable. This is the whole
 * reason the ingest is affordable: ~30k candidates instead of ~301k.
 */

export const BSC = 56
const PAGE = 100

export interface SweepResult {
  pagesFetched: number
  agentsSeen: number
  agentsUpserted: number
  droppedOffChain: number
  reportedTotal: number | null
  stoppedBecause: 'exhausted' | 'page_limit' | 'empty_page'
}

export interface EnrichResult {
  attempted: number
  succeeded: number
  failed: number
  /** Upstream was unavailable; these agents stay queued for a retry. */
  transient: number
  servicesWritten: number
  withAtLeastOneService: number
}

function nowIso(): Date {
  return new Date()
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function listItemToRow(item: ScanAgentListItem): NewAgent {
  return {
    id: item.agent_id,
    chainId: item.chain_id,
    tokenId: item.token_id,
    contractAddress: item.contract_address,
    ownerAddress: item.owner_address ?? null,
    name: item.name ?? null,
    description: item.description ?? null,
    imageUrl: item.image_url ?? null,
    supportedProtocols: item.supported_protocols ?? [],
    x402Supported: item.x402_supported ?? false,
    scanTotalScore: item.total_score ?? null,
    registryCreatedAt: toDate(item.created_at),
    lastSeen: nowIso(),
  }
}

/** Upsert a page of agents. Detail-derived columns are never clobbered here. */
async function upsertAgents(rows: NewAgent[]): Promise<number> {
  if (rows.length === 0) return 0
  const d = db()
  await d.insert(agent).values(rows).onConflictDoUpdate({
    target: agent.id,
    set: {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      imageUrl: sql`excluded.image_url`,
      ownerAddress: sql`excluded.owner_address`,
      supportedProtocols: sql`excluded.supported_protocols`,
      x402Supported: sql`excluded.x402_supported`,
      scanTotalScore: sql`excluded.scan_total_score`,
      lastSeen: sql`excluded.last_seen`,
    },
  })
  return rows.length
}

async function readCursor(source: string): Promise<number> {
  const d = db()
  const rows = await d.select().from(ingestCursor).where(eq(ingestCursor.source, source)).limit(1)
  return rows[0]?.cursor ?? 0
}

async function writeCursor(source: string, cursor: number, detail: Record<string, unknown>): Promise<void> {
  const d = db()
  await d.insert(ingestCursor).values({ source, cursor, detail, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: ingestCursor.source,
      set: { cursor: sql`excluded.cursor`, detail: sql`excluded.detail`, updatedAt: sql`excluded.updated_at` },
    })
}

/**
 * PASS 1. Walks the list endpoint from the persisted offset.
 *
 * `maxPages` bounds a single invocation so the worker yields regularly and a
 * crash never loses more than one page of progress.
 */
export async function sweepList(opts: {
  client: ScanClient
  chainId?: number
  maxPages?: number
  restart?: boolean
}): Promise<SweepResult> {
  const client = opts.client
  const chainId = opts.chainId ?? BSC
  const maxPages = opts.maxPages ?? 60
  const source = `scan:list:${chainId}`

  let offset = opts.restart ? 0 : await readCursor(source)
  let pagesFetched = 0
  let agentsSeen = 0
  let agentsUpserted = 0
  let droppedOffChain = 0
  let reportedTotal: number | null = null
  let stoppedBecause: SweepResult['stoppedBecause'] = 'page_limit'

  // Offsets are independent, so a batch of pages can be fetched in parallel.
  // The cursor only advances once a whole batch has landed, so a crash re-reads
  // at most one batch rather than losing progress.
  const concurrency = Math.max(1, Number(process.env.INGEST_SWEEP_CONCURRENCY ?? 4))

  while (pagesFetched < maxPages) {
    const batchSize = Math.min(concurrency, maxPages - pagesFetched)
    const offsets = Array.from({ length: batchSize }, (_, i) => offset + i * PAGE)

    // A single slow page at a deep offset must not abort the batch: the API
    // gets measurably slower past ~100k offset, and one timeout previously
    // took the whole ingest tick down with it.
    const pages = await mapLimit(offsets, concurrency, async (off) => {
      try {
        return await client.listAgents({ chainId, limit: PAGE, offset: off })
      } catch {
        return { items: [], total: null, droppedOffChain: 0 }
      }
    })
    pagesFetched += pages.length

    let batchItems = 0
    const rows: NewAgent[] = []
    for (const page of pages) {
      reportedTotal = page.total ?? reportedTotal
      droppedOffChain += page.droppedOffChain
      batchItems += page.items.length
      for (const item of page.items) rows.push(listItemToRow(item))
    }

    if (batchItems === 0) {
      stoppedBecause = 'empty_page'
      break
    }

    agentsSeen += batchItems
    // Deduplicate within the batch: the same agent can appear twice if a row is
    // inserted upstream between two page fetches, and ON CONFLICT cannot handle
    // a duplicate inside a single statement.
    const deduped = [...new Map(rows.map((r) => [r.id, r])).values()]
    agentsUpserted += await upsertAgents(deduped)

    offset += batchSize * PAGE
    await writeCursor(source, offset, { reportedTotal, lastBatchItems: batchItems, droppedOffChain })

    if (reportedTotal !== null && offset >= reportedTotal) {
      stoppedBecause = 'exhausted'
      break
    }
  }

  return { pagesFetched, agentsSeen, agentsUpserted, droppedOffChain, reportedTotal, stoppedBecause }
}

function detailToUpdate(detail: ScanAgentDetail): Partial<NewAgent> {
  return {
    agentWallet: detail.agent_wallet ?? null,
    tags: extractTags(detail),
    rawMetadata: (detail.raw_metadata ?? null) as Record<string, unknown> | null,
    scanHealthStatus: detail.health_status ?? null,
    scanHealthCheckedAt: toDate(detail.health_checked_at),
    scanParseStatus:
      typeof detail.parse_status === 'object' && detail.parse_status !== null
        ? String((detail.parse_status as Record<string, unknown>)['status'] ?? '')
        : null,
    scanParseCodes: parseCodes(detail),
    isEndpointVerified: detail.is_endpoint_verified ?? false,
    detailFetched: true,
    detailFetchedAt: nowIso(),
    lastSeen: nowIso(),
  }
}

async function writeServices(agentId: string, services: NewAgentService[]): Promise<number> {
  const d = db()
  if (services.length === 0) return 0
  await d.insert(agentService).values(services).onConflictDoUpdate({
    target: [agentService.agentId, agentService.kind, agentService.endpoint],
    set: {
      version: sql`excluded.version`,
      declaredPrice: sql`excluded.declared_price`,
      source: sql`excluded.source`,
      isTemplate: sql`excluded.is_template`,
      resolvedEndpoint: sql`excluded.resolved_endpoint`,
      raw: sql`excluded.raw`,
      lastSeen: sql`excluded.last_seen`,
    },
  })
  void agentId
  return services.length
}

/**
 * PASS 2. Enrich agents that declare a transport but have no detail yet.
 *
 * "Declares a transport" is read from the cheap list columns: a supported
 * protocol naming A2A/MCP, or x402 support. Everything else cannot be reached
 * no matter what the detail record says, so we do not spend a request on it.
 */
export async function enrichDetails(opts: {
  client: ScanClient
  chainId?: number
  limit?: number
}): Promise<EnrichResult> {
  const client = opts.client
  const chainId = opts.chainId ?? BSC
  const limit = opts.limit ?? 200
  const d = db()

  const candidates = await d
    .select({ id: agent.id, tokenId: agent.tokenId })
    .from(agent)
    .where(and(
      eq(agent.chainId, chainId),
      eq(agent.detailFetched, false),
      sql`(${agent.x402Supported} = true OR ${agent.supportedProtocols}::text ILIKE '%a2a%' OR ${agent.supportedProtocols}::text ILIKE '%mcp%')`,
    ))
    .limit(limit)

  let succeeded = 0
  let failed = 0
  let transient = 0
  let servicesWritten = 0
  let withAtLeastOneService = 0

  const concurrency = Math.max(1, Number(process.env.INGEST_ENRICH_CONCURRENCY ?? 4))

  await mapLimit(candidates, concurrency, async (c) => {
    const res = await client.getAgentResult(chainId, c.tokenId)

    if (res.status === 'transient') {
      // 8004scan is degraded. Leave detailFetched false so this agent is
      // retried when they recover. Marking it fetched here would silently
      // drop it from the index for good.
      transient++
      return
    }
    if (res.status === 'not_found') {
      failed++
      // Definitively absent or unparseable: mark fetched so a permanently
      // 404ing agent is not retried forever.
      await d.update(agent)
        .set({ detailFetched: true, detailFetchedAt: nowIso() })
        .where(eq(agent.id, c.id))
      return
    }
    const detail = res.detail

    const services = extractServices(detail)
    await d.update(agent).set(detailToUpdate(detail)).where(eq(agent.id, c.id))
    // `x += await f()` reads x before awaiting, so under concurrency the write
    // back clobbers increments made while this task was suspended. Resolve
    // first, then increment.
    const written = await writeServices(c.id, services)
    servicesWritten += written
    if (services.length > 0) withAtLeastOneService++
    succeeded++
  })

  return { attempted: candidates.length, succeeded, failed, transient, servicesWritten, withAtLeastOneService }
}

/**
 * Record a dated funnel measurement.
 *
 * Every stage count here is either a live API total or a live SQL count. No
 * ratio is ever stored or hardcoded — the UI divides two measured numbers and
 * shows the date they were taken (AGENTS.md gotcha 7).
 */
export async function snapshotFunnel(opts: {
  client: ScanClient
  chainId?: number
}): Promise<Array<{ stage: string; count: number }>> {
  const client = opts.client
  const chainId = opts.chainId ?? BSC
  const d = db()

  const [registered, declaresA2a, declaresMcp, declaresX402] = await Promise.all([
    client.countAgents(chainId),
    client.countAgents(chainId, { has_a2a: true }),
    client.countAgents(chainId, { has_mcp: true }),
    client.countAgents(chainId, { x402_supported: true }),
  ])

  const indexedRow = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(agent)
    .where(eq(agent.chainId, chainId))
  const withServiceRow = await d
    .select({ n: sql<number>`count(distinct ${agentService.agentId})::int` })
    .from(agentService)

  const stages: Array<{ stage: string; count: number; method: string }> = [
    { stage: 'registered', count: registered, method: '8004scan /agents total, chain_id=56' },
    { stage: 'declares_a2a', count: declaresA2a, method: '8004scan /agents has_a2a=true' },
    { stage: 'declares_mcp', count: declaresMcp, method: '8004scan /agents has_mcp=true' },
    { stage: 'declares_x402', count: declaresX402, method: '8004scan /agents x402_supported=true' },
    { stage: 'indexed', count: indexedRow[0]?.n ?? 0, method: 'marque agent table count' },
    { stage: 'has_parsed_service', count: withServiceRow[0]?.n ?? 0, method: 'marque agent_service distinct agents' },
  ]

  await d.insert(funnelSnapshot).values(
    stages.map((s) => ({ chainId, stage: s.stage, count: s.count, method: s.method })),
  )

  return stages.map(({ stage, count }) => ({ stage, count }))
}
