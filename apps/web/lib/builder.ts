import 'server-only'
import { sql } from 'drizzle-orm'
import { db, builderCheck, builderListing, builderProof } from '@marque/db'
import { chainClient, isSupportedChain, network, type ChainId } from '@marque/commerce'
import { safeFetch, probeService } from '@marque/probe'
import { classifyByKeyword, qualityVerdict, effectiveCategory, type QualityFacts, type QualityVerdict } from '@marque/registry'

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
  services: Array<{ kind: 'a2a' | 'mcp' | 'other'; endpoint: string }>
}

/** Registration metadata: data: URIs decoded in place, https fetched through safeFetch. */
async function readMetadata(uri: string): Promise<Record<string, unknown> | null> {
  try {
    if (uri.startsWith('data:')) {
      const [head, body = ''] = uri.split(',', 2)
      const text = head!.includes(';base64') ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body)
      return JSON.parse(text) as Record<string, unknown>
    }
    if (/^https:\/\//i.test(uri)) {
      const r = await safeFetch(uri, { timeoutMs: 6_000, maxBytes: 256 * 1024 })
      return r.ok ? (JSON.parse(r.body) as Record<string, unknown>) : null
    }
  } catch { /* unreadable metadata is reported as such */ }
  return null
}

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
  const list = [...((meta?.['services'] as unknown[]) ?? []), ...((meta?.['endpoints'] as unknown[]) ?? [])]
  const services = list
    .map((x) => x as { name?: unknown; endpoint?: unknown; type?: unknown })
    .filter((x) => typeof x.endpoint === 'string' && /^https:\/\//i.test(x.endpoint as string))
    .map((x) => {
      const n = String(x.name ?? x.type ?? '').toLowerCase()
      return { kind: (n.includes('a2a') ? 'a2a' : n.includes('mcp') ? 'mcp' : 'other') as 'a2a' | 'mcp' | 'other', endpoint: String(x.endpoint) }
    })
    .sort((a, b) => (a.kind === 'other' ? 1 : 0) - (b.kind === 'other' ? 1 : 0))
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
      s.endpoint as declared_endpoint, s.resolved_endpoint
      from probe_schedule q join probe p on p.id = q.last_probe_id
      join agent_service s on s.id = q.service_id
      where q.agent_id = ${key} order by p.checked_at desc`).then(rowsOf).catch(() => []),
    db().execute(sql`select category, confidence, rationale from agent_category where agent_id = ${key} and method <> 'owner_declared' order by (category <> 'unclassified') desc, confidence desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`select test_id, pass, error, ran_at from conformance_result where agent_id = ${key} order by ran_at desc limit 1`).then(rowsOf),
    db().execute(sql`select status from builder_listing where agent_id = ${key} and withdrawn_at is null limit 1`).then(rowsOf),
  ])

  // Proof: the newest signature by whoever owns it now (a previous owner's never counts).
  const allProofs = [...proofs, ...legacyProof].map((p) => ({ owner: String(p['owner_address']).toLowerCase(), at: iso(p['verified_at'])! }))
  const proof = allProofs.find((p) => p.owner === id.owner) ?? allProofs[0] ?? null

  const declaredEndpoints = new Set(id.services.map(s => s.endpoint))
  const probeRows = checks.filter((c) => c['kind'] === 'probe' && declaredEndpoints.has(String(c['endpoint'])))
  const lastOk = probeRows.find((c) => c['ok'] === true) ?? null
  // A templated endpoint ({agentId}) is declared raw and probed resolved: either form is the current service.
  const currentProbes = probes.filter(p => declaredEndpoints.has(String(p['declared_endpoint'])) || declaredEndpoints.has(String(p['resolved_endpoint'])))
  const scheduled = currentProbes.find(p => p['liveness'] === 'live') ?? null
  const okAt = [lastOk ? { at: iso(lastOk['checked_at'])!, endpoint: String(lastOk['endpoint'] ?? ''), via: 'builder' as const } : null,
    scheduled ? { at: iso(scheduled['checked_at'])!, endpoint: scheduled['executable_endpoint'] ? String(scheduled['executable_endpoint']) : null, via: 'probe' as const } : null]
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null
  const manualFailure = probeRows[0] && probeRows[0]['ok'] !== true
    ? { at: iso(probeRows[0]['checked_at'])!, reason: String((probeRows[0]['result'] as Record<string, unknown>)?.['detail'] ?? 'no callable service') } : null
  const scheduledFailure = currentProbes.find(p => p['liveness'] === 'dead' || p['liveness'] === 'bad_schema')
  const lastFail = [manualFailure, scheduledFailure ? {at:iso(scheduledFailure['checked_at'])!,reason:String(scheduledFailure['detail'] ?? 'scheduled check failed')} : null]
    .filter((x): x is NonNullable<typeof x> => x !== null).sort((a,b) => Date.parse(b.at)-Date.parse(a.at))[0] ?? null

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
    proof, callable: okAt, lastProbeFailure: lastFail && (!okAt || Date.parse(lastFail.at) >= Date.parse(okAt.at)) ? lastFail : null,
    classified, declared,
    test: t ? { at: iso(t['ran_at'])!, testId: String(t['test_id']), wellFormed: t['error'] == null, pass: t['pass'] === true, error: t['error'] ? String(t['error']) : null } : null,
  }
  const verdict = qualityVerdict(facts)
  const endpoint = lastOk ? String(lastOk['endpoint']) : id.services[0]?.endpoint ?? null
  const [availability] = rowsOf(await db().execute(sql`
    select count(*)::int as attempts, count(*) filter (where ok)::int as successes,
      min(checked_at) as first_at, max(checked_at) as last_at
    from builder_check where agent_key = ${key} and kind = 'probe'
      and endpoint = ${endpoint} and checked_at > now() - interval '24 hours'`))
  return {
    identity: id, verdict, category: effectiveCategory(facts).category, declared, classified,
    endpoint,
    availability: {windowHours:24, attempts:Number(availability?.['attempts'] ?? 0), successes:Number(availability?.['successes'] ?? 0), firstAt:iso(availability?.['first_at']), lastAt:iso(availability?.['last_at']), scope:'Builder-initiated task probes at the current declared endpoint. Irregular samples, not a continuous uptime measurement.'},
    listed: listing[0]?.['status'] === 'published',
  }
}

/**
 * When all five checks pass, the identity is listed on Marque: a published
 * builder_listing row carrying the owner's stored proof, the category that
 * counted and the test that answered. The quest's fifth row reads it.
 */
export async function listIfQualified(v: BuilderView): Promise<boolean> {
  if (!v.verdict.qualityListing) return false
  if (v.listed) return true
  const key = v.identity.agentKey
  const [p] = rowsOf(await db().execute(sql`
    select message, signature, nonce from builder_proof where agent_key = ${key} and owner_address = ${v.identity.owner} order by verified_at desc limit 1`))
  const [t] = rowsOf(await db().execute(sql`select id from conformance_result where agent_id = ${key} and error is null order by ran_at desc limit 1`))
  if (!p || !v.category) return false
  const now = new Date()
  await db().insert(builderListing).values({
    agentId: key, chainId: v.identity.chainId, tokenId: v.identity.tokenId, contractAddress: v.identity.registry.toLowerCase(),
    ownerAddress: v.identity.owner!, proofMessage: String(p['message']), proofSignature: String(p['signature']), proofNonce: String(p['nonce']),
    verifiedAt: now, category: v.category as never, serviceKind: 'a2a', endpoint: v.endpoint ?? '', conformanceResultId: t ? Number(t['id']) : null,
    status: 'published', publishedAt: now, withdrawnAt: null,
  }).onConflictDoUpdate({
    target: builderListing.agentId,
    set: { ownerAddress: v.identity.owner!, category: v.category as never, endpoint: v.endpoint ?? '', conformanceResultId: t ? Number(t['id']) : null, status: 'published', publishedAt: now, withdrawnAt: null },
  })
  return true
}

/** Identities a wallet can work on: indexed mainnet agents it owns, plus any it has proved. */
export async function builderIdentities(wallet: string): Promise<Array<{ chainId: ChainId; tokenId: string }>> {
  const w = wallet.toLowerCase()
  const rows = rowsOf(await db().execute(sql`
    select chain_id, token_id from (
      select 56 as chain_id, token_id, 0 as src from agent where owner_address = ${w} and chain_id = 56
      union select chain_id, token_id, 1 as src from builder_proof where owner_address = ${w}
      union select chain_id, token_id, 1 as src from builder_listing where owner_address = ${w} and withdrawn_at is null
    ) x group by chain_id, token_id order by max(src) desc, token_id::numeric desc limit 20`))
  return rows.map((r) => ({ chainId: Number(r['chain_id']) as ChainId, tokenId: String(r['token_id']) })).filter((r) => isSupportedChain(r.chainId))
}

/** "Probe now": one safeFetch probe of the declared endpoint, stored as a first-party observation. */
export async function probeNow(chainId: ChainId, tokenId: string, endpoint: string): Promise<{ ok: boolean; liveness: string; latencyMs: number; detail: string; executableEndpoint: string | null }> {
  const kind = /\/mcp\b/i.test(endpoint) ? 'mcp' : 'a2a'
  const out = await probeService(kind, endpoint)
  let callable = out.liveness === 'live'
  let detail = out.detail
  // A2A discovery only reads the card (it cannot prove message/send takes work), so for
  // this owner-requested probe Marque makes one real, read-only call: a message/send
  // asking the agent to describe itself. Any JSON-RPC result counts as callable.
  let sendMs: number | null = null
  if (!callable && kind === 'a2a' && out.executableEndpoint && /^card readable/.test(out.detail)) {
    const id = `marque-callable-${Date.now().toString(36)}`
    const t0 = Date.now()
    const r = await safeFetch(out.executableEndpoint, {
      method: 'POST', timeoutMs: 12_000, maxBytes: 256 * 1024,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'message/send', params: { message: { kind: 'message', role: 'user', messageId: id, parts: [{ kind: 'text', text: 'Marque callable check: in one sentence, what task do you take?' }] } } }),
    })
    sendMs = Date.now() - t0
    // A result, or a processed JSON-RPC error (the agent read the task and declined it),
    // proves message/send takes work; "method not found" or "invalid request" does not.
    let result = false
    try {
      const j = (r.ok ? JSON.parse(r.body) : {}) as { id?: unknown; result?: unknown; error?: { code?: unknown } }
      result = r.ok && r.status === 200 && j.id === id && (j.result !== undefined || (j.error !== undefined && ![-32601, -32600, -32700].includes(Number(j.error.code))))
    } catch { result = false }
    callable = result
    detail = result ? `card readable; message/send answered in ${sendMs} ms` : `card readable, but message/send did not return a result (${r.ok ? `http ${r.status}` : r.detail})`
  }
  await db().insert(builderCheck).values({
    agentKey: agentKeyOf(chainId, tokenId), kind: 'probe', chainId, tokenId, endpoint, ok: callable,
    result: { liveness: callable ? 'callable' : out.liveness, latencyMs: out.latencyMs, messageSendMs: sendMs, statusCode: out.statusCode, failureClass: callable ? null : out.failureClass, detail: detail.slice(0, 300), executableEndpoint: out.executableEndpoint, skills: out.skills.slice(0, 20), kind },
  })
  return { ok: callable, liveness: callable ? 'callable' : out.liveness, latencyMs: sendMs ?? out.latencyMs, detail: detail.slice(0, 300), executableEndpoint: out.executableEndpoint }
}

/** The owner's declared category, stored with who declared it. */
export async function declareCategory(chainId: ChainId, tokenId: string, category: string, owner: string): Promise<void> {
  await db().insert(builderCheck).values({ agentKey: agentKeyOf(chainId, tokenId), kind: 'declare', chainId, tokenId, endpoint: null, ok: true, result: { category, owner: owner.toLowerCase() } })
}

export async function recordProof(p: { chainId: ChainId; tokenId: string; owner: string; message: string; signature: string; nonce: string }): Promise<void> {
  await db().insert(builderProof).values({
    agentKey: agentKeyOf(p.chainId, p.tokenId), chainId: p.chainId, tokenId: p.tokenId, registry: identityRegistry(p.chainId).toLowerCase(),
    ownerAddress: p.owner.toLowerCase(), message: p.message, signature: p.signature, nonce: p.nonce,
  })
}
