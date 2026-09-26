import Redis from 'ioredis'

/**
 * Last-good projection cache (AGENTS 13.8, "Batching of pages").
 *
 * A read either gets a fresh value (younger than `freshMs`), or a newly computed one if
 * the computation finishes inside `timeoutMs`, or, when it does not, the last good value
 * with its age. It never returns an error while any good value exists. Values live in
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
const inflight = new Map<string, Promise<unknown>>()

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
  opts: { freshMs?: number; timeoutMs?: number; keepMs?: number; staleWhileRevalidate?: boolean } = {},
): Promise<Projection<T>> {
  const freshMs = opts.freshMs ?? 60_000
  const timeoutMs = opts.timeoutMs ?? 5_000
  const keepMs = opts.keepMs ?? 24 * 3600_000
  const now = Date.now()
  const stored = await readStored(key)
  if (stored && now - stored.at < freshMs) {
    return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: now - stored.at, stale: false }
  }

  // One computation per key per process, however many requests arrive together.
  let run = inflight.get(key) as Promise<T> | undefined
  if (!run) {
    run = compute().then(async (value) => {
      await writeStored(key, { at: Date.now(), value }, keepMs)
      return value
    })
    inflight.set(key, run)
    run.finally(() => inflight.delete(key)).catch(() => undefined)
  }

  // Stale-while-revalidate: answer from the last good value now; the refresh above
  // lands for the next reader.
  if (opts.staleWhileRevalidate && stored) {
    return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: now - stored.at, stale: true }
  }

  try {
    const value = await withTimeout(run, timeoutMs)
    return { value, computedAt: new Date().toISOString(), ageMs: 0, stale: false }
  } catch (err) {
    if (stored) {
      return { value: stored.value as T, computedAt: new Date(stored.at).toISOString(), ageMs: now - stored.at, stale: true }
    }
    throw err
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
