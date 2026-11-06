import 'server-only'
import type { Manifest } from './manifest'

/** Bounded cache of immutable, already verified answer bytes. Fresh chain comparisons retain their own 60s cache. */
export function originalAnswerCache() {
  const kept = new Map<string, { at: number; value: Manifest }>()
  const pending = new Map<string, Promise<Manifest | null>>()
  return async (key: string, expectedHash: string | null, load: () => Promise<Manifest | null>, now = Date.now): Promise<Manifest | null> => {
    if (!expectedHash || !/^0x[0-9a-fA-F]{64}$/.test(expectedHash)) return null
    const boundKey = `${key}:${expectedHash.toLowerCase()}`
    const previous = kept.get(boundKey)
    if (previous && now() - previous.at <= 600_000) return structuredClone(previous.value)
    kept.delete(boundKey)
    const running = pending.get(boundKey)
    if (running) return running.then(value => value ? structuredClone(value) : null)
    const work = load().then(value => {
      if (!value || value.matches !== true || value.hash.toLowerCase() !== expectedHash.toLowerCase() || new TextEncoder().encode(value.raw).length > 512 * 1024) return null
      kept.set(boundKey, { at: now(), value: structuredClone(value) })
      if (kept.size > 16) { const oldest = kept.keys().next().value; if (oldest !== undefined) kept.delete(oldest) }
      return value
    }).finally(() => { pending.delete(boundKey) })
    pending.set(boundKey, work)
    return work
  }
}
export const recheckOriginalAnswer = originalAnswerCache()
