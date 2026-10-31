import { keccak256, sha256, toBytes } from 'viem'

export const MAX_DELIVERY_BYTES = 512 * 1024
export type DeliveryHashAlgorithm = 'keccak256' | 'sha256'

/** Compare exact bytes, never a re-serialized JSON object or a claimed digest inside the document. */
export function deliveryDigest(raw: string, expected: string | null) {
  const bytes = toBytes(raw)
  const keccak = keccak256(bytes)
  if (expected && keccak.toLowerCase() !== expected.toLowerCase()) {
    const sha = sha256(bytes)
    if (sha.toLowerCase() === expected.toLowerCase())
      return { hash: sha, hashAlgorithm: 'sha256' as const, matches: true }
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
