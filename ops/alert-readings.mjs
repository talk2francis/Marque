const questCategories = ['rebalancing', 'grid', 'yield', 'health_factor']

/** The current coverage API reports all categories, without an inQuest property. */
export function categorySupplyReading(coverage) {
  if (coverage?.chainId !== 56 || !Array.isArray(coverage.categories)) throw new Error('Mainnet category coverage unavailable')
  const counts = questCategories.map(category => {
    const matches = coverage.categories.filter(row => row.category === category)
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0].hireable) || matches[0].hireable < 0) {
      throw new Error(`Category coverage unavailable for ${category}`)
    }
    return { category, hireable: matches[0].hireable }
  })
  const low = counts.filter(row => row.hireable < 3)
  return { bad: low.length > 0, detail: (low.length ? low : counts).map(row => `${row.category} ${row.hireable}`).join(', ') }
}
