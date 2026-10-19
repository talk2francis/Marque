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
  /** A disclosure supplied by the provider, not independent re-hashing of the original. */
  withheld?: { originalContentHash: string }
}

export async function readManifest(url: string, onchainHash: string | null): Promise<Manifest | null> {
  try {
    const r = await safeFetch(url, { timeoutMs: 8_000, maxBytes: 512 * 1024 })
    if (r.status === 409) {
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
    const doc = JSON.parse(raw) as { response?: { content?: string } }
    let content: Record<string, unknown> | null = null
    try {
      const parsed: unknown = doc.response?.content ? JSON.parse(doc.response.content) : null
      content = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch { content = null }
    return { raw, hash, matches: onchainHash ? hash.toLowerCase() === onchainHash.toLowerCase() : null, content, pretty: JSON.stringify(doc, null, 2) }
  } catch {
    return null
  }
}
