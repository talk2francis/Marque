/** A slow optional dependency must not hold a public status page open forever. */
export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Check timed out')), ms)
    })])
  } finally { clearTimeout(timer) }
}
