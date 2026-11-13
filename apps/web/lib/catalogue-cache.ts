export interface CatalogueSnapshot<T> { at: number; rows: T[] }

/** Local fresh reads; stale readers adopt another worker's complete snapshot. */
export function catalogueCache<T>({ load, freshMs, retryMs = 1_000 }: {
  load: () => Promise<CatalogueSnapshot<T> | null>; freshMs: number; retryMs?: number
}) {
  let memo: CatalogueSnapshot<T> | null = null
  let loading: Promise<CatalogueSnapshot<T> | null> | null = null
  let inflight: Promise<CatalogueSnapshot<T>> | null = null
  let retryAt = 0
  const fresh = () => memo !== null && Date.now() - memo.at < freshMs
  return {
    peek: () => memo,
    async read(refresh: (coordinate: boolean) => Promise<CatalogueSnapshot<T> | null>): Promise<CatalogueSnapshot<T>> {
      if (!memo) {
        loading ??= load().catch(() => null)
        const stored = await loading
        if (stored && !memo) memo = stored
      }
      if (fresh()) return memo!
      if (!inflight && (!memo || Date.now() >= retryAt)) {
        inflight = (async () => {
          // A local memo can be stale while another process has already refreshed Redis.
          const shared = memo ? await load().catch(() => null) : null
          if (shared && (!memo || shared.at > memo.at)) memo = shared
          if (fresh()) return memo!
          const next = await refresh(memo !== null)
          if (next && (!memo || next.at >= memo.at)) memo = next
          if (!memo) throw Error('Catalogue has no complete snapshot')
          return memo
        })().finally(() => { retryAt = Date.now() + retryMs; inflight = null })
        // A failing background refresh must leave the last good population available.
        if (memo) inflight.catch(() => undefined)
      }
      return memo ?? inflight!
    },
  }
}
