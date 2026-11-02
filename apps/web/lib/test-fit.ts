/**
 * Test fit (V4.4 P2): a category's published test asks one kind of question, and an agent filed under that category may
 * do a different job (a vault keeper is not a PancakeSwap range rebalancer). Before a result is shown or a test is run,
 * the agent's own description must name the job the test asks about. Otherwise it reads "No Marque test fits this agent
 * yet", which is neutral and leaves it hireable. Pure, so the marketplace, the agent page and the tests share it.
 */
const FITS: Record<string, RegExp> = {
  'MCS-REB-1': /pancake|\bv3\b|range|tick|concentrated|\blp\b|liquidity position/i,
  'MCS-HF-1': /venus|health.?factor|liquidat/i,
  'MCS-GRID-1': /\bgrid\b/i,
  'MCS-YIELD-1': /yield|\bapr\b|\bapy\b|venus|lend|supply rate|interest/i,
  'MCS-RYIELD-1': /yield|\bapr\b|\bapy\b|realised|realized/i,
}

export function testFits(testId: string | null, description: string | null): boolean {
  if (!testId) return true
  const re = FITS[testId]
  // An agent with no description is judged on its category alone, as before.
  return !re || !description || re.test(description)
}
