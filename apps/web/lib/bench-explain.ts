import { resolveCardUrl } from './card-check'

/** A2A tests read the agent card at the given address; a bare agent address is looked up at the well-known path. */
export function benchEndpoint(kind: 'a2a' | 'mcp', endpoint: string): string {
  return kind === 'a2a' ? resolveCardUrl(endpoint).url : endpoint
}

/**
 * When an agent answers with its own error instead of the JSON the test asks for, every field reads "not provided"
 * and the builder cannot tell why (21 Nov: an agent replied "unknown skill" and the bench showed six blank fields).
 * Return the agent's own words so the bench can show them.
 */
export function agentErrorText(response: unknown, diffs: ReadonlyArray<{ missing?: boolean }>): string | null {
  if (!diffs.length || !diffs.every((d) => d.missing !== false)) return null
  const said = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      for (const k of ['error', 'message', 'detail']) {
        const x = o[k]
        if (typeof x === 'string' && x.trim()) return x.trim()
        if (x && typeof x === 'object' && typeof (x as Record<string, unknown>)['message'] === 'string') return String((x as Record<string, unknown>)['message'])
      }
    }
    return null
  }
  const text = said(response)
  if (!text) return null
  const extra = response && typeof response === 'object' && Array.isArray((response as Record<string, unknown>)['skills'])
    ? ` (the skills it says it handles: ${((response as Record<string, unknown>)['skills'] as unknown[]).map(String).slice(0, 6).join(', ')})`
    : ''
  return `Your agent answered with its own error instead of the JSON this test asks for: "${text.slice(0, 200)}"${extra}. Check that the server handling tasks at this address runs the skill the card advertises.`
}
