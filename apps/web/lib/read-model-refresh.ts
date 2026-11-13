/** Ordinary public projections, across both networks; never individual Job Rooms. */
export const initialReadModelPaths = [
  '/api/v1/marketplace?lane=mainnet&limit=1',
  '/api/v1/marketplace?lane=practice&limit=1',
  '/api/v1/marketplace?tab=ready&lane=all&failed=group&limit=15&offset=0',
  ...['all', 'mainnet', 'practice'].map(lane => `/api/v1/marketplace/ladder?lane=${lane}`),
  '/api/v1/hire/examples',
] as const
export const readModelPaths = [...initialReadModelPaths,
  '/api/v1/proof', '/api/v1/funnel', '/api/v1/phase2/coverage',
] as const

/** One bounded pass; consuming the body completes the actual read, including streamed errors. */
export async function refreshReadModels(base: string, options: {
  signal?: AbortSignal
  read?: typeof fetch
  failed?: (path: string) => void
} = {}): Promise<void> {
  const origin = new URL(base)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw Error('Read-model refresh requires a loopback reader')
  const read = options.read ?? fetch
  // Two independent reads at a time avoid a startup or retry burst across the graph.
  let cursor = 0
  await Promise.all([0, 1].map(async () => {
    while (!options.signal?.aborted && cursor < readModelPaths.length) {
      const path = readModelPaths[cursor++]!
      try {
        const deadline = AbortSignal.timeout(10_000)
        const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
        const response = await read(new URL(path, origin), { signal, redirect: 'error', cache: 'no-store' })
        await response.arrayBuffer()
        if (!response.ok) options.failed?.(path)
      } catch {
        if (!options.signal?.aborted) options.failed?.(path)
      }
    }
  }))
}

/** The next pass starts after completion, so slow reads cannot accumulate cycles. */
export async function maintainReadModels(base: string, options: {
  signal: AbortSignal
  read?: typeof fetch
  failed?: (path: string) => void
  pause?: (ms: number, signal: AbortSignal) => Promise<void>
}): Promise<void> {
  const pause = options.pause ?? ((ms, signal) => new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  }))
  while (!options.signal.aborted) {
    await refreshReadModels(base, options)
    if (!options.signal.aborted) await pause(5_000, options.signal)
  }
}
