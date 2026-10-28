/**
 * A read-only request that survives one bad moment (28 Oct): a network drop or a 502, 503 or 504 is tried again, after
 * 0.7 s and then 1.6 s, before the caller sees a failure. A slow first read after a deploy, or a single statement
 * timeout, used to leave a button that did nothing until the page was reloaded. GET and other idempotent reads only.
 */
const RETRYABLE = new Set([502, 503, 504])
const sleep = (ms: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  // An abort that already happened fires no event: check it first.
  if (signal?.aborted) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return }
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')) }, { once: true })
})

export async function fetchRetry(input: string, init: RequestInit = {}, delays: readonly number[] = [700, 1600]): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(input, init)
      if (!RETRYABLE.has(r.status) || attempt >= delays.length) return r
    } catch (err) {
      if (init.signal?.aborted || attempt >= delays.length) throw err
    }
    await sleep(delays[attempt]!, init.signal)
  }
}
