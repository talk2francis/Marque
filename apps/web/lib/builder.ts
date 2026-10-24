import 'server-only'
import { builderCallability } from './builder-callability'
import { sql } from 'drizzle-orm'
import { db, builderCheck } from '@marque/db'
import { chainClient, isSupportedChain, network, type ChainId } from '@marque/commerce'
import { probeService, probeA2ACall, readRegistrationMetadata } from '@marque/probe'
import { classifyByKeyword, qualityVerdict, effectiveCategory, declaredServices, type DeclaredService, type QualityFacts, type QualityVerdict } from '@marque/registry'

/**
 * The builder checklist's facts (DESIGN-SYSTEM.md 8.8, SPEC-TRACKING 10), for an
 * ERC-8004 identity on BSC mainnet or testnet, whether or not Marque's ingest has
 * indexed it: ownership is read from the chain now, the metadata from its tokenURI,
 * the rest from Marque's own records. `qualityVerdict` in @marque/registry decides.
 */
const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null)

const ERC721 = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] },
] as const

export function identityRegistry(chainId: ChainId): `0x${string}` {
  return network(chainId).identityRegistry
}
export function agentKeyOf(chainId: ChainId, tokenId: string): string {
  return `${chainId}:${identityRegistry(chainId).toLowerCase()}:${tokenId}`
}

export interface IdentityRead {
  chainId: ChainId
  tokenId: string
  agentKey: string
  registry: string
  owner: string | null
  readFailed: boolean
  name: string | null
  description: string | null
  /** Service endpoints the identity's own record declares, A2A and MCP first. */
  services: DeclaredService[]
}

export const readMetadata = readRegistrationMetadata

export async function readIdentity(chainId: ChainId, tokenId: string): Promise<IdentityRead> {
  const registry = identityRegistry(chainId)
  const base = { chainId, tokenId, agentKey: agentKeyOf(chainId, tokenId), registry, name: null, description: null, services: [] as IdentityRead['services'] }
  let owner: string | null = null
  try {
    owner = String(await chainClient(chainId).readContract({ address: registry, abi: ERC721, functionName: 'ownerOf', args: [BigInt(tokenId)] })).toLowerCase()
  } catch (err) {
    // A revert means the token does not exist; anything else is the RPC failing.
    const reverted = err instanceof Error && /revert/i.test(err.message)
    return { ...base, owner: null, readFailed: !reverted }
  }
  const uri = await chainClient(chainId).readContract({ address: registry, abi: ERC721, functionName: 'tokenURI', args: [BigInt(tokenId)] }).catch(() => null)
  const meta = uri ? await readMetadata(String(uri)) : null
  const services = declaredServices(meta)
  return {
    ...base, owner, readFailed: false,
    name: typeof meta?.['name'] === 'string' ? (meta['name'] as string).slice(0, 200) : null,
    description: typeof meta?.['description'] === 'string' ? (meta['description'] as string).slice(0, 2000) : null,
    services,
  }
}

export interface BuilderView {
  identity: IdentityRead
  verdict: QualityVerdict
  category: string | null
  declared: string | null
  classified: QualityFacts['classified']
  endpoint: string | null
  listed: boolean
  listingEvidence: { version: 1; ownerListed: boolean; qualityListed: boolean; localChecksPassed: boolean; warrant: 'separate_service_test'; hireability: 'requires_current_quote'; officialCampaign: 'not_determined' }
  availability: { windowHours: number; attempts: number; successes: number; firstAt: string | null; lastAt: string | null; scope: string }
}

/** Everything the checklist shows for one identity, from the view of one wallet. */
export async function builderView(wallet: string, chainId: ChainId, tokenId: string): Promise<BuilderView> {
  const id = await readIdentity(chainId, tokenId)
  const key = id.agentKey
  const w = wallet.toLowerCase()
  const [proofs, legacyProof, checks, probes, cats, tests, listing] = await Promise.all([
    db().execute(sql`select owner_address, verified_at from builder_proof where agent_key = ${key} order by verified_at desc limit 5`).then(rowsOf),
    db().execute(sql`select owner_address, verified_at from builder_listing where agent_id = ${key} and withdrawn_at is null order by id desc limit 1`).then(rowsOf),
    db().execute(sql`select kind, ok, endpoint, result, checked_at from builder_check where agent_key = ${key} order by checked_at desc limit 40`).then(rowsOf),
    db().execute(sql`select p.liveness, p.checked_at, p.executable_endpoint, p.detail,
      s.kind, s.endpoint as declared_endpoint, s.resolved_endpoint
      from probe_schedule q join probe p on p.id = q.last_probe_id
      join agent_service s on s.id = q.service_id
      where q.agent_id = ${key} order by p.checked_at desc`).then(rowsOf).catch(() => []),
    db().execute(sql`select category, confidence, rationale from agent_category where agent_id = ${key} and method <> 'owner_declared' order by (category <> 'unclassified') desc, confidence desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`select test_id, pass, error, ran_at from conformance_result where agent_id = ${key} order by ran_at desc limit 1`).then(rowsOf),
    db().execute(sql`select status, category, service_kind, endpoint, owner_address, chain_id, token_id, contract_address from builder_listing where agent_id = ${key} and withdrawn_at is null limit 1`).then(rowsOf),
  ])

  // Proof: the newest signature by whoever owns it now (a previous owner's never counts).
  const allProofs = [...proofs, ...legacyProof].map((p) => ({ owner: String(p['owner_address']).toLowerCase(), at: iso(p['verified_at'])! }))
  const proof = allProofs.find((p) => p.owner === id.owner) ?? allProofs[0] ?? null

  const { callable: okAt, lastFailure: lastFail, callabilityUnknown } = builderCallability(id.services, checks, probes)
  const currentEndpoints = new Set(id.services.filter(s => s.kind === 'a2a' || s.kind === 'mcp').map(s => s.endpoint))
  const lastOk = checks.find(c => c.kind === 'probe' && c.ok === true && currentEndpoints.has(String(c.endpoint))) ?? null

  // Classified: Marque's classifier (ingest) if it ran, else the keyword pass over the record now.
  const kw = classifyByKeyword({ name: id.name, description: id.description })
  const c = cats[0]
  const classified = c && c['category'] !== 'unclassified'
    ? { category: String(c['category']), confidence: Number(c['confidence']), rationale: c['rationale'] ? String(c['rationale']) : null }
    : { category: kw.category === 'unclassified' ? null : kw.category, confidence: kw.category === 'unclassified' ? null : kw.confidence, rationale: kw.rationale }
  const declareRow = checks.find((x) => x['kind'] === 'declare')
  const declared = declareRow ? String((declareRow['result'] as Record<string, unknown>)?.['category'] ?? '') || null : null

  const t = tests[0]
  const facts: QualityFacts = {
    chainId, tokenId, wallet: w, owner: id.owner, ownerReadFailed: id.readFailed,
    proof, callable: okAt, callabilityUnknown, lastProbeFailure: lastFail && (!okAt || Date.parse(lastFail.at) >= Date.parse(okAt.at)) ? lastFail : null,
    classified, declared,
    test: t ? { at: iso(t['ran_at'])!, testId: String(t['test_id']), wellFormed: t['error'] == null, pass: t['pass'] === true, error: t['error'] ? String(t['error']) : null } : null,
  }
  const verdict = qualityVerdict(facts)
  const endpoint = lastOk ? String(lastOk['endpoint']) : id.services[0]?.endpoint ?? null
  const published = listing[0]?.['status'] === 'published'
  const ownerListed = published && listing[0]?.['owner_address'] != null && String(listing[0]['owner_address']).toLowerCase() === id.owner
    && Number(listing[0]['chain_id']) === chainId && String(listing[0]['token_id']) === tokenId && String(listing[0]['contract_address']).toLowerCase() === id.registry.toLowerCase()
  const category = effectiveCategory(facts).category
  const listingMatches = listing[0]?.['category'] === category && listing[0]?.['endpoint'] === endpoint && id.services.some(s => s.endpoint === endpoint && s.kind === listing[0]?.['service_kind'])
  const [availability] = rowsOf(await db().execute(sql`
    select count(*)::int as attempts, count(*) filter (where ok)::int as successes,
      min(checked_at) as first_at, max(checked_at) as last_at
    from builder_check where agent_key = ${key} and kind = 'probe'
      and endpoint = ${endpoint} and checked_at > now() - interval '24 hours'`))
  return {
    identity: id, verdict, category, declared, classified,
    endpoint,
    availability: {windowHours:24, attempts:Number(availability?.['attempts'] ?? 0), successes:Number(availability?.['successes'] ?? 0), firstAt:iso(availability?.['first_at']), lastAt:iso(availability?.['last_at']), scope:'Builder-initiated discovery or task-probe observations at the current declared endpoint. Irregular samples, not a continuous uptime measurement.'},
    listed: listing[0]?.['status'] === 'published',
    listingEvidence: { version: 1, ownerListed, qualityListed: ownerListed && listingMatches && verdict.qualityListing, localChecksPassed: verdict.qualityListing, warrant: 'separate_service_test', hireability: 'requires_current_quote', officialCampaign: 'not_determined' },
  }
}

/** Identities a wallet can work on: indexed mainnet agents it owns, plus any it has proved. */
export async function builderIdentities(wallet: string): Promise<Array<{ chainId: ChainId; tokenId: string }>> {
  const w = wallet.toLowerCase()
  const rows = rowsOf(await db().execute(sql`
    select chain_id, token_id from (
      select chain_id, token_id, 0 as src from agent where owner_address = ${w} and chain_id in (56, 97)
      union select chain_id, token_id, 1 as src from builder_proof where owner_address = ${w}
      union select chain_id, token_id, 1 as src from builder_listing where owner_address = ${w} and withdrawn_at is null
    ) x group by chain_id, token_id order by max(src) desc, token_id::numeric desc limit 20`))
  return rows.map((r) => ({ chainId: Number(r['chain_id']) as ChainId, tokenId: String(r['token_id']) })).filter((r) => isSupportedChain(r.chainId))
}

/** "Probe now": one safeFetch probe of the declared endpoint, stored as a first-party observation. */
export async function probeNow(chainId: ChainId, tokenId: string, endpoint: string, taskConsent = false): Promise<{ discoveryOnly: boolean; ok: boolean; liveness: string; latencyMs: number; detail: string; executableEndpoint: string | null }> {
  const identity = await readIdentity(chainId, tokenId)
  if (identity.readFailed) throw new Error('Current identity could not be read.')
  const service = identity.services.find(s => s.endpoint === endpoint && (s.kind === 'a2a' || s.kind === 'mcp'))
  if (!service || service.kind === 'other') throw new Error('Choose a current declared A2A or MCP endpoint.')
  const kind = service.kind
  // Background/default discovery sends no task. An explicit consent flag permits
  // only the fixed A2A capability question, without payment or follow-up calls.
  const out = kind === 'a2a' && taskConsent ? await probeA2ACall(endpoint) : await probeService(kind, endpoint)
  const discoveryOnly = !(kind === 'a2a' && taskConsent)
  const notTested = kind === 'a2a' && discoveryOnly && out.executableEndpoint !== null && out.manifest?.capabilityEvidence != null
  const callable = out.liveness === 'live'
  const detail = out.detail
  await db().insert(builderCheck).values({
    agentKey: agentKeyOf(chainId, tokenId), kind: 'probe', chainId, tokenId, endpoint, ok: callable,
    result: { liveness: callable ? 'callable' : notTested ? 'discovered' : out.liveness, latencyMs: out.latencyMs, discoveryOnly, callability: notTested ? 'NOT_TESTED' : callable ? 'ACCEPTED' : 'FAILED', statusCode: out.statusCode, failureClass: callable ? null : out.failureClass, detail: detail.slice(0, 300), executableEndpoint: out.executableEndpoint, skills: out.skills.slice(0, 20), kind, callEvidence: out.callEvidence ?? null },
  })
  return { discoveryOnly, ok: callable, liveness: callable ? 'callable' : notTested ? 'discovered' : out.liveness, latencyMs: out.latencyMs, detail: detail.slice(0, 300), executableEndpoint: out.executableEndpoint }
}

/** The owner's declared category, stored with who declared it. */
export async function declareCategory(chainId: ChainId, tokenId: string, category: string, owner: string): Promise<void> {
  await db().insert(builderCheck).values({ agentKey: agentKeyOf(chainId, tokenId), kind: 'declare', chainId, tokenId, endpoint: null, ok: true, result: { category, owner: owner.toLowerCase() } })
}

export async function recordProof(p: { chainId: ChainId; tokenId: string; owner: string; message: string; signature: string; nonce: string }): Promise<void> {
  const key = agentKeyOf(p.chainId, p.tokenId)
  await db().transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '5000ms'`)
    await tx.execute(sql`set local lock_timeout = '1000ms'`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
    await tx.execute(sql`insert into builder_proof (agent_key, chain_id, token_id, registry, owner_address, message, signature, nonce)
      select ${key}, ${p.chainId}, ${p.tokenId}, ${identityRegistry(p.chainId).toLowerCase()}, ${p.owner.toLowerCase()}, ${p.message}, ${p.signature}, ${p.nonce}
      where not exists (select 1 from builder_proof where agent_key = ${key} and signature = ${p.signature} and message = ${p.message})`)
  })
}
