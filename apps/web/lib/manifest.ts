import 'server-only'
import { keccak256, toBytes } from 'viem'
import { safeFetch } from '@marque/probe'

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
}

export async function readManifest(url: string, onchainHash: string | null): Promise<Manifest | null> {
  try {
    const r = await safeFetch(url, { timeoutMs: 8_000, maxBytes: 512 * 1024 })
    if (!r.ok) return null
    const raw = r.body
    const hash = keccak256(toBytes(raw))
    const doc = JSON.parse(raw) as { response?: { content?: string } }
    let content: Record<string, unknown> | null = null
    try { content = doc.response?.content ? (JSON.parse(doc.response.content) as Record<string, unknown>) : null } catch { content = null }
    return { raw, hash, matches: onchainHash ? hash.toLowerCase() === onchainHash.toLowerCase() : null, content, pretty: JSON.stringify(doc, null, 2) }
  } catch {
    return null
  }
}
