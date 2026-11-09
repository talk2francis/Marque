/** The fixture market maker's walk (runbook R6), kept apart so it can be tested without starting the process. */
/** The walk stays within this many ticks of the mainnet price (about 6%), stepping at most STEP ticks a move. */
const SPAN = 600
const STEP = 180

/** Next offset from the mainnet price: a step of up to STEP ticks, reflected back inside [-SPAN, SPAN]. */
export function nextOffset(current: number, rand: () => number = Math.random): number {
  let n = current + Math.round((rand() * 2 - 1) * STEP)
  if (n > SPAN) n = 2 * SPAN - n
  if (n < -SPAN) n = -2 * SPAN - n
  return n
}

