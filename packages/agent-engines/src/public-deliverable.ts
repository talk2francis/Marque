import { keccak256, toBytes } from 'viem'

/** The original file is never rewritten. Error payloads can contain private RPC URLs. */
export function publicDeliverableResponse(original: string): { status: 200 | 409; body: string } {
  try {
    const manifest = JSON.parse(original) as { response?: { content?: unknown } }
    const content: unknown = typeof manifest.response?.content === 'string' ? JSON.parse(manifest.response.content) : null
    if (content && typeof content === 'object' && !Array.isArray(content) && 'error' in content && content.error != null) {
      return { status: 409, body: JSON.stringify({
        schema: 'marque.withheld-error-deliverable.v1',
        error: 'The stored response reports an error. Raw diagnostics are withheld.',
        originalContentHash: keccak256(toBytes(original)), originalPreserved: true,
      }) }
    }
  } catch { /* Preserve the existing raw-file behavior for other historical formats. */ }
  return { status: 200, body: original }
}
