import type { ServiceKind } from '@marque/db'
import { normalizeKind } from './normalize.js'

export interface DeclaredService { kind: ServiceKind | 'other'; endpoint: string }

/** Preserve exact URL paths (including double slashes); normalize protocol names only. */
export function declaredServices(meta: Record<string, unknown> | null): DeclaredService[] {
  const list: unknown[] = [...(Array.isArray(meta?.services) ? meta.services : []), ...(Array.isArray(meta?.endpoints) ? meta.endpoints : [])]
  const result = new Map<string, DeclaredService>()
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const x = item as Record<string, unknown>
    if (typeof x.endpoint !== 'string' || x.endpoint.length > 2048 || !/^https:\/\//i.test(x.endpoint)
      || Array.from(x.endpoint).some(c => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)) continue
    const kind = normalizeKind(String(x.name ?? x.type ?? '')) ?? 'other'
    result.set(`${kind} ${x.endpoint}`, { kind, endpoint: x.endpoint })
  }
  return [...result.values()].sort((a, b) => (a.kind === 'a2a' || a.kind === 'mcp' ? 0 : 1) - (b.kind === 'a2a' || b.kind === 'mcp' ? 0 : 1))
}
