import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, canonicalAgentIdSql, db, firstPartyAgents } from '@marque/db'
import { currentTerms, disputeWindowSeconds, sellerFor, teamWallets, termsOf, type LastQuote, type ServiceCommerce, type Terms } from '@marque/commerce'
import { buyerFeedbackBinding } from '@marque/commerce/feedback'
import { agentTrack, type AgentTrack } from './agent-track'
import { readManifest, type Manifest } from './manifest'
import { referenceAgent } from './reference-agents'
import { registrationTx } from './registration'
import { registryImageUrl } from './avatar-source'

/**
 * Everything one storefront shows (DESIGN-SYSTEM.md 8.4), for a reference agent or a
 * third party alike. Registry fields are CLAIMED; probes, quotes and tests are ours
 * (MEASURED, TESTED); jobs and ratings are read from chain events (ONCHAIN). Nothing is
 * filled in: a missing fact comes back null and the page says so.
 */
const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const s = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null)

export interface StoreTest { testId: string; pass: boolean; failedFields: string[]; ranAt: string | null; block: string | null; error: string | null; latencyMs: number | null }
export interface StoreReview { stars: number; client: string; at: string | null; tx: string; verified: boolean; team: boolean; comment: string | null; jobId: string | null }
export interface StoreSample { jobId: string; chainId: number; at: string | null; manifest: Manifest; hashOnChain: string | null }

export interface Storefront {
  agentId: string
  tokenId: string
  name: string
  description: string | null
  imageUrl: string | null
  category: string | null
  isReference: boolean
  slug: string | null
  owner: string | null
  wallet: string | null
  registry: string | null
  registeredAt: string | null
  metadataReadAt: string | null
  registerTx: string | null
  testnetTokenId: number | null
  endpoint: string | null
  services: Array<{ kind: string; endpoint: string }>
  commerce: (ServiceCommerce & { priceLabel: string | null; lastQuote?: LastQuote | null }) | null
  /** Current terms, read per request from the newest quote observations (invariant 41). */
  terms: Terms
  track: AgentTrack
  tests: StoreTest[]
  lastProbe: { at: string; liveness: string; latencyMs: number | null; failure: string | null; detail: string | null } | null
  probes24h: { total: number; live: number; reachable: number }
  reviews: StoreReview[]
  sample: StoreSample | null
  disputeWindowSeconds: number | null
}

/**
 * Served from a 30 s projection (stale while it recomputes): quotes, probes and jobs
 * move on minutes, and computing a storefront reads the whole quote table.
 */
export async function storefront(agentId: string): Promise<Storefront | null> {
  // The heavy parts come from a 30 s projection; the price never does. It is read per
  // request from the agent's own newest quotes, the same reader the marketplace and the
  // terms API use, so the rail can never contradict a marketplace row (defect D2).
  const live = currentTerms(agentId).catch(() => null)
  let value: Storefront | null
  try {
    value = (await cachedProjection(`storefront:v4:${agentId}`, () => computeStorefront(agentId), { freshMs: 30_000, timeoutMs: 12_000, staleWhileRevalidate: true })).value
  } catch {
    value = await computeStorefront(agentId)
  }
  if (!value) return null
  const t = await live
  if (!t) return { ...value, terms: termsOf(value.commerce) }
  return { ...value, commerce: t.commerce ? { ...t.commerce, priceLabel: t.terms.priceLabel } : null, terms: t.terms }
}

async function computeStorefront(agentId: string): Promise<Storefront | null> {
  const [a] = rowsOf(await db().execute(sql`
    select a.*, (select category from agent_category c where c.agent_id = a.id
                 order by (category <> 'unclassified') desc, confidence desc, assigned_at desc limit 1) as category
    from agent a where a.id = ${agentId} limit 1`))
  if (!a) return null
  const tokenId = String(a['token_id'])
  const fp = firstPartyAgents().find((f) => f.chainId === 56 && String(f.tokenId) === tokenId) ?? null
  const ref = fp ? referenceAgent(fp.slug) : null

  const [services, tests, probe, probes24, reviewsRaw, states, track, windowS, seller] = await Promise.all([
    db().execute(sql`select kind, coalesce(resolved_endpoint, endpoint) as endpoint from agent_service where agent_id = ${agentId} order by kind`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select test_id, pass, failed_fields, ran_at, block_number, error, latency_ms from conformance_result
      where ${canonicalAgentIdSql(sql`agent_id`)} = ${agentId} order by ran_at desc limit 8`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select p.checked_at, p.liveness, p.latency_ms, p.failure_class, p.detail from probe p
      where p.agent_id = ${agentId} order by p.checked_at desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select count(*)::int as total, count(*) filter (where liveness = 'live')::int as live,
        count(*) filter (where status_code between 200 and 299)::int as reachable from probe
      where agent_id = ${agentId} and checked_at > now() - interval '24 hours'`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select r.client, r.value, r.value_decimals, r.tx_hash, r.block_time, r.feedback_hash, c.comment, c.job_id,
             ${buyerFeedbackBinding(sql`${s(a['agent_wallet']) ?? ''}`, sql`${agentId}`)} as verified
      from rating r left join rating_comment c on lower(c.feedback_hash) = lower(r.feedback_hash) and c.chain_id = r.chain_id and c.agent_token_id = r.agent_token_id and lower(c.client) = lower(r.client)
      where r.chain_id = 56 and r.agent_token_id = ${tokenId} and not r.revoked and r.tag1 = 'starred'
      order by r.block_number desc limit 8`).then(rowsOf).catch(() => []),
    currentTerms(agentId).catch(() => null),
    agentTrack(tokenId),
    disputeWindowSeconds(56).catch(() => null),
    sellerFor(agentId, null).catch(() => null),
  ])

  const best = states?.commerce ?? null
  const team = new Set(teamWallets())

  // The sample: the newest delivered Marque job, read from the deliverable the agent published.
  let sample: StoreSample | null = null
  if (fp && s(a['agent_wallet'])) {
    const [j] = rowsOf(await db().execute(sql`
      select j.job_id, j.deliverable, e.block_time from commerce_job j
      join hire_intent i on i.id = j.intent_id
      left join commerce_event e on e.chain_id = j.chain_id and e.job_id = j.job_id and e.name = 'JobSubmitted'
      where j.chain_id = 56 and i.agent_id = ${agentId} and j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID')
      order by j.updated_block desc nulls last limit 1`).catch(() => []))
    if (j) {
      const url = `https://marque.trade/agents/${fp.slug}/erc8183/job/${j['job_id']}/response`
      const manifest = await readManifest(url, s(j['deliverable']))
      if (manifest?.content) sample = { jobId: String(j['job_id']), chainId: 56, at: iso(j['block_time']), manifest, hashOnChain: s(j['deliverable']) }
    }
  }

  const lp = probe[0]
  const mintTx = s(a['contract_address']) ? await registrationTx(tokenId, String(a['contract_address']), (a['raw_metadata'] as Record<string,unknown> | null)?.['scan_created_tx_hash'] ?? ref?.erc8004.registerTx) : null
  return {
    agentId,
    tokenId,
    name: s(a['name']) ?? `Agent #${tokenId}`,
    description: s(a['description']) ?? ref?.blurb ?? null,
    imageUrl: registryImageUrl(a['image_url']) ?? registryImageUrl((a['raw_metadata'] as Record<string, unknown> | null)?.['offchain_content'] && ((a['raw_metadata'] as Record<string, unknown>)['offchain_content'] as Record<string, unknown>)['image']),
    category: s(a['category']),
    isReference: fp !== null,
    slug: fp?.slug ?? null,
    owner: s(a['owner_address']),
    wallet: s(a['agent_wallet']),
    registry: s(a['contract_address']),
    registeredAt: iso(a['registry_created_at']),
    metadataReadAt: iso(a['detail_fetched_at']),
    registerTx: mintTx,
    testnetTokenId: fp?.testnet?.tokenId ?? null,
    endpoint: seller?.endpoint ?? null,
    services: services.map((x) => ({ kind: String(x['kind']), endpoint: String(x['endpoint']) })),
    commerce: best ? { ...best, priceLabel: states?.terms.priceLabel ?? null } : null,
    terms: states?.terms ?? termsOf(null),
    track,
    tests: tests.map((t) => ({
      testId: String(t['test_id']), pass: t['pass'] === true, failedFields: Array.isArray(t['failed_fields']) ? (t['failed_fields'] as string[]) : [],
      ranAt: iso(t['ran_at']), block: s(t['block_number']), error: s(t['error']), latencyMs: t['latency_ms'] == null ? null : Number(t['latency_ms']),
    })),
    lastProbe: lp ? { at: iso(lp['checked_at'])!, liveness: String(lp['liveness']), latencyMs: lp['latency_ms'] == null ? null : Number(lp['latency_ms']), failure: s(lp['failure_class']), detail: s(lp['detail']) } : null,
    probes24h: { total: Number(probes24[0]?.['total'] ?? 0), live: Number(probes24[0]?.['live'] ?? 0), reachable: Number(probes24[0]?.['reachable'] ?? 0) },
    reviews: reviewsRaw.map((r) => ({
      stars: Math.round(Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20),
      client: String(r['client']), at: iso(r['block_time']), tx: String(r['tx_hash']),
      verified: r['verified'] === true && !team.has(String(r['client'])), team: team.has(String(r['client'])),
      comment: s(r['comment']), jobId: r['verified'] === true ? s(r['job_id']) : null,
    })),
    sample,
    disputeWindowSeconds: windowS,
  }
}

/** The storefront for an ERC-8004 token on BSC mainnet, or null when Marque has not indexed it. */
export async function storefrontByToken(tokenId: string): Promise<Storefront | null> {
  if (!/^\d{1,12}$/.test(tokenId)) return null
  const [r] = rowsOf(await db().execute(sql`select id from agent where chain_id = 56 and token_id = ${tokenId} order by id limit 1`).catch(() => []))
  return r ? storefront(String(r['id'])) : null
}
