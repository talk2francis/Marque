import 'server-only'
import { keccak256, toBytes } from 'viem'
import { safeFetch } from '@marque/probe'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { deliveryContent, deliveryDigest, type DeliveryHashAlgorithm } from './delivery-bytes'
import { readSubmissionManifest } from './submission-manifest'

/**
 * Read an ERC-8183 deliverable manifest and check it against the hash on chain.
 *
 * The URL is whatever the provider published, so it is untrusted: it goes through
 * the SSRF guard like every other call to an agent (AGENTS.md, Security). The
 * answer is `response.content`, parsed when it is JSON.
 */
export interface Manifest {
  raw: string
  hash: `0x${string}`
  /** True or false against the on-chain hash; null when there is no hash to compare. */
  matches: boolean | null
  content: Record<string, unknown> | null
  pretty: string
  hashAlgorithm?: DeliveryHashAlgorithm
  url?: string
  source?: 'submission_calldata'
  /** A disclosure supplied by the provider, not independent re-hashing of the original. */
  withheld?: { originalContentHash: string }
}

export async function readManifest(url: string, onchainHash: string | null): Promise<Manifest | null> {
  const m = await readOne(url, onchainHash)
  // Practice jobs from before a reference agent had its own testnet seller were answered by its
  // mainnet process, so the file lives without /testnet. Accepted only when it matches the chain hash.
  if (m === MISSING && onchainHash && /^https:\/\/marque\.trade\/agents\/[a-z0-9-]+\/testnet\//.test(url)) {
    const alt = await readOne(url.replace('/testnet/', '/'), onchainHash)
    return alt !== MISSING && alt?.matches ? alt : null
  }
  return m === MISSING ? null : m
}

const MISSING = Symbol('missing')
async function readOne(url: string, onchainHash: string | null): Promise<Manifest | null | typeof MISSING> {
  try {
    const r = await safeFetch(url, { timeoutMs: 8_000, maxBytes: 512 * 1024 })
    if (r.ok && r.status === 404) return MISSING
    if (r.ok && r.status === 409) {
      const disclosure = JSON.parse(r.body) as Record<string, unknown>
      if (disclosure['schema'] !== 'marque.withheld-error-deliverable.v1' || disclosure['originalPreserved'] !== true
        || typeof disclosure['originalContentHash'] !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(disclosure['originalContentHash'])) return null
      return { raw: '', hash: keccak256(toBytes(r.body)), matches: null, pretty: '',
        content: { error: 'The stored response reports an error. Raw diagnostics are withheld.' },
        withheld: { originalContentHash: disclosure['originalContentHash'] } }
    }
    if (!r.ok) return null
    const raw = r.body
    const doc: unknown = JSON.parse(raw)
    return { raw, ...deliveryDigest(raw,onchainHash), content:deliveryContent(doc), pretty:JSON.stringify(doc,null,2), url }
  } catch {
    return null
  }
}

/**
 * The answer for any job (25 Oct): the published URL when the chain record names one, otherwise found from the on-chain
 * hash alone. Candidates, on each host the provider registered: the content-addressed path that BNB Agent Studio sellers
 * serve (`/deliverables/<hash>.json`), then the per-job paths other sellers use. Every candidate goes
 * through the SSRF guard and is accepted only when its bytes hash to the deliverable hash on chain, so nothing
 * unverified is ever shown as the agent's answer. Found locations are remembered per process.
 */
export async function jobManifest(chainId: number, jobId: string, job: { deliverable?: { url?: string | null; hash?: string | null } | null; provider?: string | null; events?: Array<{name:string; tx:string}> } | null, onchainHash?: string | null): Promise<Manifest | null> {
  const hash = job?.deliverable?.hash ?? onchainHash ?? null
  if (job?.deliverable?.url) {
    const published=await readManifest(job.deliverable.url, hash)
    if(published && published.matches!==false) return published
    const submitted=job.events?.find(e=>e.name==='JobSubmitted')
    const inline=hash && job.provider && submitted ? await readSubmissionManifest(chainId,jobId,hash,job.provider,submitted.tx) : null
    return inline ?? published
  }
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash) || /^0x0+$/.test(hash)) return null
  const submitted=job?.events?.find(e=>e.name==='JobSubmitted')
  if(submitted && job?.provider) {
    const inline=await readSubmissionManifest(chainId,jobId,hash,job.provider,submitted.tx)
    if(inline) return inline
  }
  const key = `${chainId}:${jobId}:${hash.toLowerCase()}`
  const known = FOUND.get(key)
  if (known !== undefined) return known ? readManifest(known, hash) : null
  for (const url of await candidates(chainId, jobId, job?.provider ?? null, hash)) {
    const m = await readOne(url, hash)
    if (m !== MISSING && m?.matches === true) { FOUND.set(key, url); return m }
  }
  FOUND.set(key, null)
  setTimeout(() => FOUND.delete(key), 10 * 60_000).unref?.()
  return null
}

const FOUND = new Map<string, string | null>()
/**
 * Per-job answer paths sellers use beyond the content-addressed one (found 3 Nov by probing every unreadable delivery):
 * by job and network, or by job, network and hash. Tried on each host the provider registered, and accepted only when
 * the bytes hash to the deliverable on chain.
 */
const PER_JOB_PATHS: Array<(origin: string, jobId: string, chainId: number, hash: string) => string> = [
  (o, j, c) => `${o}/api/escrow/jobs/${j}/deliverable?chainId=${c}`,
  (o, j, c, h) => `${o}/api/seller/deliverables/${j}?chain=${c}&hash=${h}`,
]

async function candidates(chainId: number, jobId: string, provider: string | null, hash: string): Promise<string[]> {
  if (!provider) return []
  const res = await db().execute(sql`select distinct s.endpoint from agent_service s join agent a on a.id = s.agent_id
    where a.chain_id = ${chainId} and lower(a.agent_wallet) = ${provider.toLowerCase()} and s.endpoint like 'https://%' limit 24`).catch(() => null)
  const rows = (((res as unknown as { rows?: unknown[] })?.rows ?? (res as unknown as unknown[]) ?? []) as Array<Record<string, unknown>>)
  const out: string[] = []
  const add = (u: string) => { if (!out.includes(u)) out.push(u) }
  for (const r of rows) {
    let u: URL
    try { u = new URL(String(r['endpoint'])) } catch { continue }
    // The service's base path: everything before a well-known suffix (/a2a, /mcp, /.well-known/...).
    const base = u.pathname.replace(/\/(\.well-known\/.*|a2a|mcp|api\/.*|answer)?$/i, '').replace(/\/$/, '')
    add(`${u.origin}${base}/deliverables/${hash}.json`)
    if (base) add(`${u.origin}/deliverables/${hash}.json`)
    for (const p of PER_JOB_PATHS) add(p(u.origin, jobId, chainId, hash))
  }
  return out.slice(0, 8)
}
