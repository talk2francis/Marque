import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'

/**
 * Last-good projection cache (AGENTS 13.8, "Batching of pages").
 *
 * A read either gets a fresh value (younger than `freshMs`), or a newly computed one if
 * the computation finishes inside `timeoutMs`, or, when it does not, the last good value
 * with its age. It retains last-good values within any explicit maximum age. Values live in
 * Redis so they survive a web restart or a blue/green swap; if Redis is unreachable the
 * cache degrades to process memory rather than failing the request.
 */
export interface Projection<T> {
  value: T
  computedAt: string
  ageMs: number
  /** True when the value is older than `freshMs` because a refresh failed or timed out. */
  stale: boolean
}

let client: Redis | null = null
let closed = false
const memory = new Map<string, { at: number; value: unknown }>()
type Entry<T> = { at: number; value: T }
const inflight = new Map<string, Promise<Entry<unknown>>>()

function redis(): Redis | null {
  if (closed) return null
  if (client) return client
  const url = process.env.REDIS_URL
  if (!url) return null
  // Commands queue until the connection is up (so the first read after a restart still
  // hits Redis) but each one gives up after 500 ms, so an outage degrades to memory fast.
  client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1_000, commandTimeout: 500, enableOfflineQueue: true })
  client.on('error', () => {
    // Swallowed on purpose: a cache outage must degrade to memory, never break a page.
  })
  return client
}

async function readStored(key: string): Promise<{ at: number; value: unknown } | null> {
  const r = redis()
  if (r) {
    try {
      const raw = await r.get(`proj:${key}`)
      if (raw) return JSON.parse(raw) as { at: number; value: unknown }
    } catch {
      // fall through to memory
    }
  }
  return memory.get(key) ?? null
}

async function writeStored(key: string, entry: { at: number; value: unknown }, keepMs: number): Promise<void> {
  memory.set(key, entry)
  const r = redis()
  if (!r) return
  try {
    await r.set(`proj:${key}`, JSON.stringify(entry), 'PX', keepMs)
  } catch {
    // memory copy already written
  }
}

/** Read existing projection bytes without refreshing, re-dating or extending retention. */
export async function peekProjection<T>(key: string): Promise<{ value: T; computedAt: string; ageMs: number } | null> {
  const stored = await readStored(key)
  if (!stored || !Number.isFinite(stored.at)) return null
  return { value: structuredClone(stored.value) as T, computedAt: new Date(stored.at).toISOString(), ageMs: Date.now() - stored.at }
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`projection exceeded ${ms} ms`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

export async function cachedProjection<T>(
  key: string,
  compute: () => Promise<T>,
  opts: { freshMs?: number; timeoutMs?: number; keepMs?: number; staleWhileRevalidate?: boolean; staleRefreshLeaseMs?: number; reuseStored?: (value: T) => boolean; coordinateCold?: boolean; maxStaleMs?: number; observedAt?: (value: T) => number } = {},
): Promise<Projection<T>> {
  const freshMs = opts.freshMs ?? 60_000
  const timeoutMs = opts.timeoutMs ?? 5_000
  const keepMs = opts.keepMs ?? 24 * 3600_000
  const previous = await readStored(key)
  const now = Date.now()
  const stored = previous && (opts.maxStaleMs === undefined || now - previous.at < opts.maxStaleMs) ? previous : null
  if (stored && now - stored.at < freshMs) {
    return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: now - stored.at, stale: false }
  }
  // Opt-in for immutable historical evidence. Keep the original observation date
  // and age; this does not make an old value current or extend its Redis TTL.
  if (stored && opts.reuseStored?.(stored.value as T)) {
    return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: now - stored.at, stale: true }
  }

  // One computation per key per process, however many requests arrive together.
  let run = inflight.get(key) as Promise<Entry<T>> | undefined
  if (!run) {
    // A hard ceiling on the refresh itself: a compute that never settles (a hung RPC or
    // query) once stayed in `inflight` for hours, so every reader waited on it, timed
    // out and got the stale value (the coverage snapshot sat 4.5 h old on 26 Sep).
    run = (async () => {
      // Cold coalescing is opt-in. Redis outages retain ordinary computation.
      const r = (opts.coordinateCold || (stored && opts.staleWhileRevalidate)) && (opts.staleRefreshLeaseMs ?? 0) > 0 ? redis() : null
      const leaseKey = `proj:refresh:${key}`, token = randomUUID()
      let owned = false
      if (r) {
        try {
          const deadline = Date.now() + Math.max(timeoutMs * 6, 60_000)
          for (;;) {
            const shared = await readStored(key)
            if (shared && (!previous || shared.at !== previous.at)
              && (opts.maxStaleMs === undefined || Date.now() - shared.at < opts.maxStaleMs)) return shared as Entry<T>
            owned = await r.set(leaseKey, token, 'PX', Math.ceil(opts.staleRefreshLeaseMs!), 'NX') === 'OK'
            if (owned) break
            if (stored && opts.staleWhileRevalidate) return stored as Entry<T>
            // A peer owns this cold computation. Wait for complete published data,
            // preserving its real observation date, or recover its released lease.
            if (Date.now() >= deadline) throw new TimeoutError('projection peer exceeded its deadline')
            await pause(50)
          }
        } catch (err) {
          if (err instanceof TimeoutError) throw err
          // Redis unavailable: refresh normally, retaining memory fallback.
        }
      }
      try {
        const value = await withTimeout(Promise.resolve().then(compute), Math.max(timeoutMs * 6, 60_000))
        const at = opts.observedAt?.(value) ?? Date.now()
        if (!Number.isFinite(at)) throw new Error('projection observation date is invalid')
        if (opts.maxStaleMs !== undefined && Date.now() - at >= opts.maxStaleMs) throw new TimeoutError('projection observation is too old')
        const entry = { at, value }
        if (owned && r) {
          try {
            const published = await r.eval("if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[2], ARGV[2], 'PX', ARGV[3]); return 1 else return 0 end", 2, leaseKey, `proj:${key}`, token, JSON.stringify(entry), String(keepMs))
            if (Number(published) === 1) memory.set(key, entry)
          } catch { memory.set(key, entry) }
        } else await writeStored(key, entry, keepMs)
        return entry
      } finally {
        if (owned && r) {
          // An expired owner's completion must never release its successor's lease.
          await r.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, leaseKey, token).catch(() => undefined)
        }
      }
    })()
    inflight.set(key, run)
    run.finally(() => inflight.delete(key)).catch(() => undefined)
  }

  // Stale-while-revalidate: answer from the last good value now; the refresh above
  // lands for the next reader.
  if (opts.staleWhileRevalidate && stored) {
    return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: now - stored.at, stale: true }
  }

  try {
    const entry = await withTimeout(run, timeoutMs)
    const ageMs = Math.max(0, Date.now() - entry.at)
    if (opts.maxStaleMs !== undefined && ageMs >= opts.maxStaleMs) throw new TimeoutError('projection observation is too old')
    return { value: entry.value, computedAt: new Date(entry.at).toISOString(), ageMs, stale: ageMs >= freshMs }
  } catch (err) {
    if (stored && (opts.maxStaleMs === undefined || Date.now() - stored.at < opts.maxStaleMs)) {
      return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: Date.now() - stored.at, stale: true }
    }
    throw err
  }
}

/**
 * A compressed blob in Redis (a large projection, such as the marketplace catalog, that a fresh process can start from).
 * Redis down or absent: storing is skipped and loading returns null, so the caller computes as before.
 */
export async function storeBlob(key: string, value: Buffer, keepMs: number): Promise<boolean> {
  const r = redis()
  if (!r) return false
  try { await r.set(`blob:${key}`, value, 'PX', keepMs); return true } catch { return false }
}

export async function loadBlob(key: string): Promise<Buffer | null> {
  const r = redis()
  if (!r) return null
  try { return await r.getBuffer(`blob:${key}`) } catch { return null }
}

/** Publish a complete binary snapshot only while this process owns its refresh. */
export async function refreshBlob<T>(
  key: string,
  compute: () => Promise<{ value: T; blob: Buffer }>,
  opts: { coordinate: boolean; keepMs: number; leaseMs: number },
): Promise<T | null> {
  const r = opts.coordinate ? redis() : null
  const leaseKey = `blob:refresh:${key}`, token = randomUUID()
  let owned = false
  if (r) {
    try {
      owned = await r.set(leaseKey, token, 'PX', opts.leaseMs, 'NX') === 'OK'
      if (!owned) return null
    } catch { /* Redis outage retains the ordinary local computation. */ }
  }
  try {
    const entry = await compute()
    if (owned && r) {
      try {
        const published = await r.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[2], ARGV[2], 'PX', ARGV[3]); return 1 else return 0 end",
          2, leaseKey, `blob:${key}`, token, entry.blob, String(opts.keepMs),
        )
        if (Number(published) !== 1) return null
      } catch { /* Keep the complete local value if Redis becomes unavailable. */ }
    } else await storeBlob(key, entry.blob, opts.keepMs)
    return entry.value
  } finally {
    if (owned && r) {
      await r.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, leaseKey, token).catch(() => undefined)
    }
  }
}

/** For tests and shutdown. */
export async function closeCache(): Promise<void> {
  closed = true
  memory.clear()
  if (client) {
    const c = client
    client = null
    await c.quit().catch(() => undefined)
  }
}
