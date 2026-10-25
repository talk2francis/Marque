import 'server-only'
import { keccak256, toBytes } from 'viem'
import { safeFetch } from '@marque/probe'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'

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
    const hash = keccak256(toBytes(raw))
    const doc = JSON.parse(raw) as { response?: { content?: unknown }; answer?: unknown; subject?: unknown }
    const asObject = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
    let content: Record<string, unknown> | null = null
    try {
      // The Studio manifest carries the answer as JSON text in response.content; some sellers put the object there
      // directly, and others publish { job, agent, subject, answer } with no wrapper (Mandate Range-1).
      const inner = doc.response?.content
      const parsed: unknown = typeof inner === 'string' ? JSON.parse(inner) : inner ?? null
      content = asObject(parsed)
      if (content && asObject(content['answer']) && !('healthFactor' in content)) content = { ...asObject(content['answer'])!, subject: content['subject'] ?? null }
      if (!content && asObject(doc.answer)) content = { ...asObject(doc.answer)!, subject: doc.subject ?? null }
    } catch { content = null }
    return { raw, hash, matches: onchainHash ? hash.toLowerCase() === onchainHash.toLowerCase() : null, content, pretty: JSON.stringify(doc, null, 2) }
  } catch {
    return null
  }
}

/**
 * The answer for any job (25 Oct): the published URL when the chain record names one, otherwise found from the on-chain
 * hash alone. Candidates, in order: an operator's known per-job path (Mandate), then the content-addressed path that BNB
 * Agent Studio sellers serve (`/deliverables/<hash>.json`) on each host the provider registered. Every candidate goes
 * through the SSRF guard and is accepted only when its bytes hash to the deliverable hash on chain, so nothing
 * unverified is ever shown as the agent's answer. Found locations are remembered per process.
 */
export async function jobManifest(chainId: number, jobId: string, job: { deliverable?: { url?: string | null; hash?: string | null } | null; provider?: string | null } | null, onchainHash?: string | null): Promise<Manifest | null> {
  const hash = job?.deliverable?.hash ?? onchainHash ?? null
  if (job?.deliverable?.url) return readManifest(job.deliverable.url, hash)
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash) || /^0x0+$/.test(hash)) return null
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
/** Operators that publish each job's answer at their own fixed path. */
const OPERATOR_PATHS: Array<{ host: RegExp; path: (jobId: string) => string }> = [
  { host: /(^|\.)mandatemarkets\.com$/i, path: (j) => `https://www.mandatemarkets.com/api/escrow/jobs/${j}/deliverable` },
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
    for (const o of OPERATOR_PATHS) if (o.host.test(u.hostname)) add(o.path(jobId))
    // The service's base path: everything before a well-known suffix (/a2a, /mcp, /.well-known/...).
    const base = u.pathname.replace(/\/(\.well-known\/.*|a2a|mcp|api\/.*|answer)?$/i, '').replace(/\/$/, '')
    add(`${u.origin}${base}/deliverables/${hash}.json`)
    if (base) add(`${u.origin}/deliverables/${hash}.json`)
  }
  return out.slice(0, 6)
}
