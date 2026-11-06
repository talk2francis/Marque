/** Limit expensive reads, with a short FIFO queue that never starts an expired request. */
export function boundedWork(limit: number, maxQueued: number, waitMs: number) {
  let active = 0
  const queue: Array<{ start: () => void }> = []
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active < limit) active++
    else {
      if (queue.length >= maxQueued) throw new Error('read_capacity_busy')
      await new Promise<void>((resolve, reject) => {
        const item = { start: () => { clearTimeout(timer); active++; resolve() } }
        const timer = setTimeout(() => {
          const at = queue.indexOf(item)
          if (at >= 0) queue.splice(at, 1)
          reject(new Error('read_capacity_wait_expired'))
        }, waitMs)
        queue.push(item)
      })
    }
    try { return await work() }
    finally { active--; queue.shift()?.start() }
  }
}
