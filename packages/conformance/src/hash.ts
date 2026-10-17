import { createHash } from 'node:crypto'

/** Historical unsorted JSON helper. Never reinterpret existing digests. */
export function hash(value: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')}`
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, stable(rec[k])]))
  }
  return value
}

export function stableHash(value: unknown): string { return hash(stable(value)) }
