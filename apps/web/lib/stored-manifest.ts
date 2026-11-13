import type { Manifest } from './manifest'
import { deliveryContent, deliveryDigest, MAX_DELIVERY_BYTES } from './delivery-bytes'

/** Recover committed answer bytes, never saved checks or unverified content fields. */
export function manifestFromStored(
  value: unknown,
  expectedHash: string,
  submissionUrl: string | null,
): Manifest | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(expectedHash) || !value || typeof value !== 'object') return null
  const m = value as Record<string, unknown>
  if (m.matches !== true || typeof m.hash !== 'string' || m.hash.toLowerCase() !== expectedHash.toLowerCase()
    || typeof m.raw !== 'string' || !m.raw.length || new TextEncoder().encode(m.raw).length > MAX_DELIVERY_BYTES) return null
  // A calldata provenance claim must name this job's current submission, not just another answer with the same hash.
  const inline = m.source === 'submission_calldata'
  if (inline && (!submissionUrl || typeof m.url !== 'string' || m.url.toLowerCase() !== submissionUrl.toLowerCase())) return null
  if (m.url !== null && m.url !== undefined && (typeof m.url !== 'string' || !/^(https|ipfs|ar):\/\//i.test(m.url))) return null
  const digest = deliveryDigest(m.raw, expectedHash)
  if (digest.matches !== true) return null
  let content: Manifest['content'], pretty: string
  try { const doc: unknown = JSON.parse(m.raw); content = deliveryContent(doc); pretty = JSON.stringify(doc, null, 2) }
  catch { content = { text: m.raw }; pretty = m.raw }
  return { raw: m.raw, ...digest, content, pretty,
    ...(typeof m.url === 'string' ? { url: m.url } : {}), ...(inline ? { source: 'submission_calldata' as const } : {}) }
}
