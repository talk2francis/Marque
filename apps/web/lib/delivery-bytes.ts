import { keccak256, sha256, toBytes } from 'viem'

export const MAX_DELIVERY_BYTES = 512 * 1024
export type DeliveryHashAlgorithm = 'keccak256' | 'sha256'

/**
 * The BNB Agent Studio SDK's deliverable hash (4 Nov): keccak256 of the manifest's canonical JSON, meaning its own
 * fields (version, job_id, chain_id, contracts, response, metadata), keys sorted at every depth, no whitespace, and
 * characters from U+007F up escaped as \uXXXX. It is the protocol's own definition of the bytes32 an SDK seller
 * submits, so a verifier recomputes it from the fetched manifest. Null when the document is not such a manifest.
 */
/** Sorted keys at every depth, no whitespace, U+007F and up escaped: the SDK's canonical JSON text. */
export function canonicalText(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v
  return JSON.stringify(sort(value)).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

export function sdkManifestHash(doc: unknown): `0x${string}` | null {
  const d = doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : null
  const res = d && d['response'] && typeof d['response'] === 'object' ? (d['response'] as Record<string, unknown>) : null
  if (!d || !res || !('content' in res) || !('job_id' in d) || !('chain_id' in d) || !('contracts' in d) || d['version'] === undefined) return null
  const manifest = {
    version: d['version'], job_id: d['job_id'], chain_id: d['chain_id'], contracts: d['contracts'],
    response: { content: res['content'], ...('content_type' in res ? { content_type: res['content_type'] } : {}) },
    metadata: d['metadata'] ?? {},
  }
  return keccak256(toBytes(canonicalText(manifest)))
}

/**
 * Compare exact bytes (keccak256 or sha256) first; then, for an Agent Studio manifest, its canonical hash as the SDK
 * defines it. Never a digest the document claims about itself.
 */
export function deliveryDigest(raw: string, expected: string | null) {
  const bytes = toBytes(raw)
  const keccak = keccak256(bytes)
  if (expected && keccak.toLowerCase() !== expected.toLowerCase()) {
    const sha = sha256(bytes)
    if (sha.toLowerCase() === expected.toLowerCase())
      return { hash: sha, hashAlgorithm: 'sha256' as const, matches: true }
    // Other commitments sellers make to the same answer: the SDK's canonical manifest, the whole document's canonical
    // JSON, or the answer content alone (its exact text). Each is a hash of bytes in the file, never a claimed digest.
    let doc: unknown = null
    try { doc = JSON.parse(raw) } catch { doc = null }
    if (doc !== null) {
      const content = doc && typeof doc === 'object' && !Array.isArray(doc) && (doc as Record<string, unknown>)['response'] && typeof (doc as Record<string, unknown>)['response'] === 'object'
        ? ((doc as Record<string, Record<string, unknown>>)['response']!['content']) : undefined
      const forms: Array<`0x${string}` | null> = [
        sdkManifestHash(doc),
        keccak256(toBytes(canonicalText(doc))),
        typeof content === 'string' ? keccak256(toBytes(content)) : content !== undefined ? keccak256(toBytes(canonicalText(content))) : null,
      ]
      const hit = forms.find((h) => h && h.toLowerCase() === expected.toLowerCase())
      if (hit) return { hash: hit, hashAlgorithm: 'keccak256' as const, matches: true }
    }
  }
  return {
    hash: keccak,
    hashAlgorithm: 'keccak256' as const,
    matches: expected ? keccak.toLowerCase() === expected.toLowerCase() : null,
  }
}

export function deliveryContent(doc: unknown): Record<string, unknown> | null {
  const object = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const root = object(doc)
  if (!root) return null
  try {
    const response = object(root['response'])
    if (response) {
      const inner: unknown = response['content']
      // An answer in plain text or markdown (content_type text/*) is kept as text, never dropped.
      if (typeof inner === 'string') { try { JSON.parse(inner) } catch { return { text: inner } } }
      const content = object(typeof inner === 'string' ? JSON.parse(inner) : inner)
      if (content && object(content['answer']) && !('healthFactor' in content))
        return { ...object(content['answer'])!, subject: content['subject'] ?? null }
      return content
    }
    if (object(root['answer']))
      return { ...object(root['answer'])!, subject: root['subject'] ?? null }
    // Some providers publish the task result itself, including { result: ... } envelopes.
    return root
  } catch {
    return null
  }
}
