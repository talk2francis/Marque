import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, canonicalAgentIdSql, db, firstPartyAgentsAllLanes } from '@marque/db'
import { agentPortraits } from './agent-portraits'
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

export interface StoreDiff { field: string; pass: boolean; expected: string; actual: string; tolerance: string; missing: boolean }
export interface StoreTest { testId: string; caseId: string | null; pass: boolean; failedFields: string[]; diffs: StoreDiff[]; ranAt: string | null; block: string | null; error: string | null; latencyMs: number | null }
export interface StoreReview { stars: number; client: string; at: string | null; tx: string; verified: boolean; team: boolean; comment: string | null; jobId: string | null; quick: { answered: string; onTime: string; hireAgain: string } | null }
export interface StoreSample { jobId: string; chainId: number; at: string | null; manifest: Manifest; hashOnChain: string | null }

export interface Storefront {
  agentId: string
  /** The agent's registry chain: its lane (56 mainnet, 97 practice). */
  chainId: 56 | 97
  tokenId: string
  name: string
  description: string | null
  imageUrl: string | null
  /** The image is a portrait the owner set on Marque (agent-portraits.ts), not the registry's. */
  portraitByOwner?: boolean
  category: string | null
  isReference: boolean
  /** Set when no published standard tests what this reference agent does (config `standard: null`): the reason, in words. */
  noStandard: string | null
  /** The reference agent's own declared standard, when it is not its category's default (Tidemark: MCS-RYIELD-1). */
  standard: string | null
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
    value = (await cachedProjection(`storefront:v5:${agentId}`, () => computeStorefront(agentId), { freshMs: 30_000, timeoutMs: 12_000, staleWhileRevalidate: true })).value
  } catch {
    value = await computeStorefront(agentId)
  }
  if (!value) return null
  // An owner-set portrait is read per request, outside the projection, so a change shows at once.
  const [t, portrait] = await Promise.all([live, agentPortraits([agentId]).then((m) => m.get(agentId) ?? null)])
  if (portrait) value = { ...value, imageUrl: portrait, portraitByOwner: true }
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
  const chainId = Number(agentId.split(':')[0]) === 97 ? 97 : 56
  const fp = firstPartyAgentsAllLanes().find((f) => f.chainId === chainId && String(f.tokenId) === tokenId) ?? null
  const ref = fp ? referenceAgent(fp.slug) : null

  const [services, tests, probe, probes24, reviewsRaw, states, track, windowS, seller] = await Promise.all([
    db().execute(sql`select kind, coalesce(resolved_endpoint, endpoint) as endpoint from agent_service where agent_id = ${agentId} order by kind`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select test_id, case_id, pass, failed_fields, diffs, ran_at, block_number, error, latency_ms from conformance_result
      where ${canonicalAgentIdSql(sql`agent_id`)} = ${agentId} order by ran_at desc limit 30`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select p.checked_at, p.liveness, p.latency_ms, p.failure_class, p.detail from probe p
      where p.agent_id = ${agentId} order by p.checked_at desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select count(*)::int as total, count(*) filter (where liveness = 'live')::int as live,
        count(*) filter (where status_code between 200 and 299)::int as reachable from probe
      where agent_id = ${agentId} and checked_at > now() - interval '24 hours'`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select r.client, r.value, r.value_decimals, r.tx_hash, r.block_time, r.feedback_hash, c.comment, c.job_id, c.canonical,
             ${buyerFeedbackBinding(sql`${s(a['agent_wallet']) ?? ''}`, sql`${agentId}`)} as verified
      from rating r left join rating_comment c on lower(c.feedback_hash) = lower(r.feedback_hash) and c.chain_id = r.chain_id and c.agent_token_id = r.agent_token_id and lower(c.client) = lower(r.client)
      where r.chain_id = ${chainId} and r.agent_token_id = ${tokenId} and not r.revoked and r.tag1 = 'starred'
      order by r.block_number desc limit 8`).then(rowsOf).catch(() => []),
    currentTerms(agentId).catch(() => null),
    agentTrack(tokenId, chainId),
    disputeWindowSeconds(chainId).catch(() => null),
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
      where j.chain_id = ${chainId} and i.agent_id = ${agentId} and j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID')
      order by j.updated_block desc nulls last limit 1`).catch(() => []))
    if (j) {
      const url = `https://marque.trade/agents/${fp.slug}/erc8183/job/${j['job_id']}/response`
      const manifest = await readManifest(url, s(j['deliverable']))
      if (manifest?.content) sample = { jobId: String(j['job_id']), chainId, at: iso(j['block_time']), manifest, hashOnChain: s(j['deliverable']) }
    }
  }

  const lp = probe[0]
  const mintTx = s(a['contract_address']) ? await registrationTx(tokenId, String(a['contract_address']), (a['raw_metadata'] as Record<string,unknown> | null)?.['scan_created_tx_hash'] ?? ref?.erc8004.registerTx) : null
  return {
    agentId,
    chainId,
    tokenId,
    name: s(a['name']) ?? `Agent #${tokenId}`,
    description: s(a['description']) ?? ref?.blurb ?? null,
    imageUrl: registryImageUrl(a['image_url']) ?? registryImageUrl((a['raw_metadata'] as Record<string, unknown> | null)?.['offchain_content'] && ((a['raw_metadata'] as Record<string, unknown>)['offchain_content'] as Record<string, unknown>)['image']),
    category: s(a['category']),
    isReference: fp !== null,
    standard: fp && typeof fp.standard === 'string' ? fp.standard : null,
    noStandard: fp && fp.standard === null ? (fp.standardNote ?? 'No published Marque test applies to what this agent does yet.') : null,
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
      testId: String(t['test_id']), caseId: s(t['case_id']), pass: t['pass'] === true, failedFields: Array.isArray(t['failed_fields']) ? (t['failed_fields'] as string[]) : [],
      diffs: Array.isArray(t['diffs']) ? (t['diffs'] as Array<Record<string, unknown>>).map((x) => ({ field: String(x['field'] ?? ''), pass: x['pass'] === true, expected: String(x['expected'] ?? ''), actual: String(x['actual'] ?? ''), tolerance: String(x['tolerance'] ?? ''), missing: x['missing'] === true })) : [],
      ranAt: iso(t['ran_at']), block: s(t['block_number']), error: s(t['error']), latencyMs: t['latency_ms'] == null ? null : Number(t['latency_ms']),
    })),
    lastProbe: lp ? { at: iso(lp['checked_at'])!, liveness: String(lp['liveness']), latencyMs: lp['latency_ms'] == null ? null : Number(lp['latency_ms']), failure: s(lp['failure_class']), detail: s(lp['detail']) } : null,
    probes24h: { total: Number(probes24[0]?.['total'] ?? 0), live: Number(probes24[0]?.['live'] ?? 0), reachable: Number(probes24[0]?.['reachable'] ?? 0) },
    reviews: reviewsRaw.map((r) => ({
      stars: Math.round(Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20),
      client: String(r['client']), at: iso(r['block_time']), tx: String(r['tx_hash']),
      verified: r['verified'] === true && !team.has(String(r['client'])), team: team.has(String(r['client'])),
      comment: s(r['comment']), jobId: r['verified'] === true ? s(r['job_id']) : null, quick: quickOf(r['canonical']),
    })),
    sample,
    disputeWindowSeconds: windowS,
  }
}

/** The storefront for an ERC-8004 token on BSC mainnet, or null when Marque has not indexed it. */
export async function storefrontByToken(tokenId: string, chainId: 56 | 97 = 56): Promise<Storefront | null> {
  if (!/^\d{1,12}$/.test(tokenId)) return null
  const [r] = rowsOf(await db().execute(sql`select id from agent where chain_id = ${chainId} and token_id = ${tokenId} order by id limit 1`).catch(() => []))
  return r ? storefront(String(r['id'])) : null
}

/** Quick answers committed in the canonical feedback JSON (SPEC-WORKSPACE 2.3), when the buyer gave any. */
function quickOf(canonical: unknown): StoreReview['quick'] {
  if (typeof canonical !== 'string') return null
  try {
    const q = (JSON.parse(canonical) as { quick?: { answered?: string; onTime?: string; hireAgain?: string } }).quick
    return q ? { answered: q.answered ?? '', onTime: q.onTime ?? '', hireAgain: q.hireAgain ?? '' } : null
  } catch { return null }
}
