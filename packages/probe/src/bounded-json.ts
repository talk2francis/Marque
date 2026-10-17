/** Inspect JSON values without invoking getters, toJSON, or lossy coercions. */
export function boundedJson(value: unknown): 'OK' | 'INVALID' | 'LIMIT' {
  const budget = { nodes: 100_000, bytes: 2 * 1024 * 1024, exceeded: false }
  function visit(item: unknown, depth: number): boolean {
    if (depth > 64 || --budget.nodes < 0) return false
    if (typeof item === 'string') {
      budget.bytes -= Buffer.byteLength(item, 'utf8')
      if (budget.bytes < 0) budget.exceeded = true
      return !budget.exceeded
    }
    if (item === null || typeof item === 'boolean') return true
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item !== 'object') return false
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return false
    if (Object.getOwnPropertySymbols(item).length) return false
    const descriptors = Object.getOwnPropertyDescriptors(item)
    if (Array.isArray(item) && Object.keys(item).length !== item.length) return false
    return Object.entries(descriptors).every(([key, descriptor]) => {
      if (Array.isArray(item) && key === 'length') return true
      budget.bytes -= Buffer.byteLength(key, 'utf8')
      if (budget.bytes < 0) budget.exceeded = true
      return !budget.exceeded && Boolean(descriptor.enumerable) && 'value' in descriptor && visit(descriptor.value, depth + 1)
    })
  }
  try { return visit(value, 0) ? 'OK' : budget.exceeded ? 'LIMIT' : 'INVALID' }
  catch { return 'INVALID' }
}
