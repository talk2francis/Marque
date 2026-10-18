/** Match the page's 30-second revalidation window; never reuse an unknown age. */
export function canReuseInitialMarket(generatedAt: string | null | undefined, now = Date.now()): boolean {
  const age = now - (typeof generatedAt === 'string' ? Date.parse(generatedAt) : NaN)
  return Number.isFinite(age) && age >= 0 && age < 30_000
}
