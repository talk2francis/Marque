/**
 * Bounded-concurrency map.
 *
 * The 8004scan budget is 600 requests/minute. Sequential fetching leaves most
 * of that unused (a full BSC index would take hours); unbounded parallelism
 * burns the minute window and gets us throttled. A small fixed worker pool sits
 * in the middle and keeps throughput predictable.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const width = Math.max(1, Math.min(limit, items.length))
  let cursor = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i] as T, i)
    }
  }

  await Promise.all(Array.from({ length: width }, worker))
  return results
}
