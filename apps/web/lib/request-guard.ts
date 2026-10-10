/** Match the router-state shape used by our pinned Next version, before rendering. */
export function validRouterStateHeader(header: string | null): boolean {
  if (header === null) return true
  if (header.length > 40_000) return false
  let nodes = 0
  const tree = (v: unknown, depth: number): boolean => {
    if (++nodes > 2000 || depth > 100 || !Array.isArray(v) || v.length < 2 || v.length > 5) return false
    const [segment, routes, url, refresh, root] = v
    const segmentOk = typeof segment === 'string' || (Array.isArray(segment) && segment.length === 3
      && typeof segment[0] === 'string' && typeof segment[1] === 'string' && ['c', 'ci', 'oc', 'd', 'di'].includes(segment[2]))
    return segmentOk && routes !== null && typeof routes === 'object' && !Array.isArray(routes)
      && (url == null || typeof url === 'string')
      && (refresh == null || ['refetch', 'refresh', 'inside-shared-layout', 'metadata-only'].includes(refresh))
      && (root === undefined || typeof root === 'boolean')
      && Object.values(routes).every(child => tree(child, depth + 1))
  }
  try { return tree(JSON.parse(decodeURIComponent(header)), 0) } catch { return false }
}

export function safeRequestPath(path: string): boolean {
  try { return !hasControlCharacters(decodeURIComponent(path)) } catch { return false }
}

export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}
