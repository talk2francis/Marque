import 'server-only'
import { keccak256, toBytes } from 'viem'
import { safeFetch } from '@marque/probe'
import { sql } from 'drizzle-orm'
import { db, peekProjection } from '@marque/db'
import { isSupportedChain, network } from '@marque/commerce'
import { deliveryContent, deliveryDigest, type DeliveryHashAlgorithm } from './delivery-bytes'
import { readSubmissionManifest } from './submission-manifest'
import { originalAnswerCache } from './recheck-original'
import { manifestFromStored } from './stored-manifest'

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

/**
 * Where a published answer can be read (4 Nov): ipfs://CID/path and ar://ID through public gateways, and an https
 * gateway link (any host serving /ipfs/<CID>) also through the others, because a single gateway refusing or rate
 * limiting server reads (ipfs.io now answers 429) must not hide an answer. Every gateway goes through the SSRF guard
 * and the bytes still have to hash to the deliverable on chain, so no gateway is trusted for content.
 */
const IPFS_GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/']
export function gatewayUrls(url: string): string[] {
  if (/^ar:\/\//i.test(url)) return [`https://arweave.net/${url.replace(/^ar:\/\//i, '')}`]
  const path = /^ipfs:\/\//i.test(url) ? url.replace(/^ipfs:\/\/(ipfs\/)?/i, '')
    : /^https:\/\/[^/]+\/ipfs\/((Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,})(\/[^?#]*)?)$/.exec(url)?.[1] ?? null
  if (path === null) return [url]
  const gateways = IPFS_GATEWAYS.map((g) => g + path)
  return /^https:/i.test(url) ? [url, ...gateways.filter((g) => g !== url)] : gateways
}
export const gatewayUrl = (url: string): string => gatewayUrls(url)[0]!

export async function readManifest(url: string, onchainHash: string | null): Promise<Manifest | null> {
  const urls = gatewayUrls(url)
  if (urls.length > 1) {
    return firstMatching(urls, onchainHash)
  }
  url = urls[0]!
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

/** Hedge a slow location after 150 ms; at most two guarded reads run at once. */
async function firstMatching(urls: readonly string[], hash: string | null): Promise<Manifest | null> {
  if (!urls.length) return null
  return new Promise(resolve => {
    let next = 0, active = 0, settled = false
    const finish = (value: Manifest | null) => {
      settled = true
      clearTimeout(hedge)
      resolve(value)
    }
    const start = () => {
      if (settled || active >= 2) return
      if (next === urls.length) { if (!active) finish(null); return }
      const url = urls[next++]!
      active++
      void readOne(url, hash).then(m => {
        if (!settled && m !== MISSING && m && (m.matches === true || !hash)) finish(m)
      }).finally(() => {
        active--
        if (!settled) start()
      })
    }
    const hedge = setTimeout(start, 150)
    start()
  })
}

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
    // A deliverable that is not JSON (plain text, markdown) is shown as text; it is still checked against the hash.
    let doc: unknown
    try { doc = JSON.parse(raw) } catch { return { raw, ...deliveryDigest(raw, onchainHash), content: { text: raw }, pretty: raw, url } }
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
type ManifestJob = { deliverable?: { url?: string | null; hash?: string | null } | null; provider?: string | null; events?: Array<{name:string; tx:string}> } | null
const verifiedAnswers = originalAnswerCache(64, true)

export function jobManifest(chainId: number, jobId: string, job: ManifestJob, onchainHash?: string | null): Promise<Manifest | null> {
  const hash = job?.deliverable?.hash ?? onchainHash ?? null
  const load = async () => {
    if (hash && isSupportedChain(chainId) && /^\d{1,20}$/.test(jobId)) {
      // Lens keeps complete original bytes even when no category check exists.
      // Re-hash those bytes against the current job commitment; checks and dates
      // are neither reused here nor refreshed as a side effect of this read.
      const stored = await peekProjection<{ manifest?: unknown }>(`lens:v9:${chainId}:${jobId}`).catch(() => null)
      const tx = job?.events?.find(e => e.name === 'JobSubmitted')?.tx
      const submissionUrl = tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? `${network(chainId).explorer}/tx/${tx}` : null
      const recovered = manifestFromStored(stored?.value?.manifest, hash, submissionUrl)
      if (recovered) return recovered
    }
    return loadJobManifest(chainId, jobId, job, onchainHash)
  }
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return load()
  const submitted = job?.events?.find(e => e.name === 'JobSubmitted')?.tx ?? ''
  // Bind the cache to every input of receipt/byte validation. Never cache missing,
  // unverified, mismatched or withheld answers. Concurrent page/lens reads share it.
  const key = JSON.stringify([chainId, jobId, job?.provider?.toLowerCase() ?? '', hash.toLowerCase(), submitted, job?.deliverable?.url ?? ''])
  return verifiedAnswers(key, hash, load)
}

async function loadJobManifest(chainId: number, jobId: string, job: ManifestJob, onchainHash?: string | null): Promise<Manifest | null> {
  const hash = job?.deliverable?.hash ?? onchainHash ?? null
  if (job?.deliverable?.url) {
    const published=await readManifest(job.deliverable.url, hash)
    if(published && published.matches!==false) return published
    const submitted=job.events?.find(e=>e.name==='JobSubmitted')
    const inline=hash && job.provider && submitted ? await readSubmissionManifest(chainId,jobId,hash,job.provider,submitted.tx,(u)=>readManifest(u,hash)) : null
    return inline ?? published
  }
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash) || /^0x0+$/.test(hash)) return null
  const submitted=job?.events?.find(e=>e.name==='JobSubmitted')
  if(submitted && job?.provider) {
    const inline=await readSubmissionManifest(chainId,jobId,hash,job.provider,submitted.tx,(u)=>readManifest(u,hash))
    if(inline) return inline
  }
  const key = `${chainId}:${jobId}:${hash.toLowerCase()}`
  const known = FOUND.get(key)
  if (known !== undefined) return known ? readManifest(known, hash) : null
  const found = await firstMatching(await candidates(chainId, jobId, job?.provider ?? null, hash), hash)
  if (found?.matches === true && found.url) { FOUND.set(key, found.url); return found }
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
