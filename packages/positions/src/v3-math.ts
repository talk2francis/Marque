/**
 * Uniswap/PancakeSwap V3 concentrated-liquidity arithmetic.
 *
 * Pure functions, no I/O, exhaustively unit-tested. Everything the Rebalancing
 * category asserts against comes from here, so a bug in this file is a bug in
 * every conformance result we publish.
 *
 * Conventions:
 *  - "raw" price is token1 per token0 in base units, i.e. 1.0001^tick.
 *  - "human" price adjusts for decimals: token1/token0 in display units.
 *  - Amounts are bigint base units throughout; conversion to human is explicit.
 */

const Q96 = 2n ** 96n
const MIN_TICK = -887272
const MAX_TICK = 887272

/**
 * PancakeSwap V3 fee tiers and their tick spacings.
 *
 * A proposed tick that is not a multiple of its pool's spacing is rejected by
 * the contract. AGENTS.md gotcha 12 names this as the most common agent failure
 * and the highest-signal conformance check, so the table is explicit rather
 * than derived.
 */
export const TICK_SPACING: Readonly<Record<number, number>> = {
  100: 1, // 0.01%
  500: 10, // 0.05%
  2500: 50, // 0.25%
  10000: 200, // 1%
}

export function tickSpacingForFee(fee: number): number {
  const spacing = TICK_SPACING[fee]
  if (spacing === undefined) {
    throw new Error(`unknown PancakeSwap V3 fee tier: ${fee}`)
  }
  return spacing
}

/** True when a tick is usable as a position boundary in this pool. */
export function isValidTick(tick: number, spacing: number): boolean {
  return Number.isInteger(tick) && tick % spacing === 0 && tick >= MIN_TICK && tick <= MAX_TICK
}

/** Round a tick to the nearest usable multiple, staying inside the tick range. */
export function nearestUsableTick(tick: number, spacing: number): number {
  if (spacing <= 0) throw new Error('tick spacing must be positive')
  const rounded = Math.round(tick / spacing) * spacing
  if (rounded < MIN_TICK) return rounded + spacing
  if (rounded > MAX_TICK) return rounded - spacing
  return rounded
}

/** Raw price (token1 per token0, base units) at a tick. */
export function tickToRawPrice(tick: number): number {
  return 1.0001 ** tick
}

/** The tick whose raw price is closest to the given raw price. */
export function rawPriceToTick(price: number): number {
  if (price <= 0) throw new Error('price must be positive')
  return Math.floor(Math.log(price) / Math.log(1.0001))
}

/**
 * Human-readable price of token0 denominated in token1.
 *
 * Decimals matter and getting them backwards is the classic V3 display bug:
 * a CAKE/USDT pool reading 0.0000000004 instead of 2.41.
 */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  return tickToRawPrice(tick) * 10 ** (decimals0 - decimals1)
}

export function priceToTick(price: number, decimals0: number, decimals1: number): number {
  return rawPriceToTick(price / 10 ** (decimals0 - decimals1))
}

/** Convert sqrtPriceX96 to a human price of token0 in token1. */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number {
  // Do the shift in floating point only after scaling down, so the
  // intermediate does not lose precision for large sqrt values.
  const sqrt = Number(sqrtPriceX96) / Number(Q96)
  return sqrt * sqrt * 10 ** (decimals0 - decimals1)
}

/** sqrt(1.0001^tick) * 2^96, matching the contract's tick→sqrtPrice mapping. */
export function tickToSqrtPriceX96(tick: number): bigint {
  const sqrt = Math.sqrt(1.0001 ** tick)
  return BigInt(Math.floor(sqrt * Number(Q96)))
}

/**
 * Token amounts locked by `liquidity` between two ticks at the current price.
 *
 * The three cases are the whole of V3: below the range the position is entirely
 * token0, above it entirely token1, and inside it holds both.
 */
export function amountsForLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  if (liquidity === 0n) return { amount0: 0n, amount1: 0n }
  if (tickLower >= tickUpper) throw new Error('tickLower must be below tickUpper')

  const sqrtLower = tickToSqrtPriceX96(tickLower)
  const sqrtUpper = tickToSqrtPriceX96(tickUpper)
  const sqrtCurrent = sqrtPriceX96

  if (sqrtCurrent <= sqrtLower) {
    return { amount0: amount0For(sqrtLower, sqrtUpper, liquidity), amount1: 0n }
  }
  if (sqrtCurrent >= sqrtUpper) {
    return { amount0: 0n, amount1: amount1For(sqrtLower, sqrtUpper, liquidity) }
  }
  return {
    amount0: amount0For(sqrtCurrent, sqrtUpper, liquidity),
    amount1: amount1For(sqrtLower, sqrtCurrent, liquidity),
  }
}

/** amount0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB), in X96 fixed point. */
function amount0For(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const [lo, hi] = sqrtA <= sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  if (lo === 0n) return 0n
  return (liquidity * Q96 * (hi - lo)) / hi / lo
}

/** amount1 = L * (sqrtB - sqrtA). */
function amount1For(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  const [lo, hi] = sqrtA <= sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  return (liquidity * (hi - lo)) / Q96
}

/**
 * The liquidity a given pair of amounts supports across a range.
 * Inverse of amountsForLiquidity; used to validate an agent's proposed mint.
 */
export function liquidityForAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0: bigint,
  amount1: bigint,
): bigint {
  const sqrtLower = tickToSqrtPriceX96(tickLower)
  const sqrtUpper = tickToSqrtPriceX96(tickUpper)
  const sqrtCurrent = sqrtPriceX96

  if (sqrtCurrent <= sqrtLower) return liquidityForAmount0(sqrtLower, sqrtUpper, amount0)
  if (sqrtCurrent >= sqrtUpper) return liquidityForAmount1(sqrtLower, sqrtUpper, amount1)

  const l0 = liquidityForAmount0(sqrtCurrent, sqrtUpper, amount0)
  const l1 = liquidityForAmount1(sqrtLower, sqrtCurrent, amount1)
  return l0 < l1 ? l0 : l1
}

function liquidityForAmount0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  const [lo, hi] = sqrtA <= sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  if (hi === lo) return 0n
  return (amount0 * lo * hi) / Q96 / (hi - lo)
}

function liquidityForAmount1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  const [lo, hi] = sqrtA <= sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  if (hi === lo) return 0n
  return (amount1 * Q96) / (hi - lo)
}

/**
 * How far the current price sits inside its range, as a fraction of the way
 * from lower to upper. 0 means at the lower bound, 1 at the upper.
 * Values outside [0,1] mean the position is out of range.
 */
export function rangePosition(tickCurrent: number, tickLower: number, tickUpper: number): number {
  if (tickUpper === tickLower) return 0
  return (tickCurrent - tickLower) / (tickUpper - tickLower)
}

/** Percentage move in price required to reach each bound. Negative = below. */
export function distanceToBounds(
  priceCurrent: number,
  priceLower: number,
  priceUpper: number,
): { pctToLower: number; pctToUpper: number } {
  if (priceCurrent <= 0) throw new Error('current price must be positive')
  return {
    pctToLower: ((priceLower - priceCurrent) / priceCurrent) * 100,
    pctToUpper: ((priceUpper - priceCurrent) / priceCurrent) * 100,
  }
}

export function inRange(tickCurrent: number, tickLower: number, tickUpper: number): boolean {
  return tickCurrent >= tickLower && tickCurrent < tickUpper
}

/** Convert a base-unit bigint to a human float. Lossy by construction. */
export function toHuman(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals
}

export { Q96, MIN_TICK, MAX_TICK }
