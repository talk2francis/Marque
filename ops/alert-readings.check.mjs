import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categorySupplyReading } from './alert-readings.mjs'

const sample = () => ({ chainId: 56, categories: [
  { category: 'yield', hireable: 2 }, { category: 'grid', hireable: 4 },
  { category: 'rebalancing', hireable: 7 }, { category: 'health_factor', hireable: 3 },
  { category: 'security', hireable: 0 },
] })
test('current API without inQuest reports the actual yield shortage', () => {
  assert.deepEqual(categorySupplyReading(sample()), { bad: true, detail: 'yield 2' })
})
test('zero is a measured shortage, not missing data', () => {
  const coverage = sample(); coverage.categories[0].hireable = 0
  assert.equal(categorySupplyReading(coverage).detail, 'yield 0')
})
test('healthy core categories clear while an extra security category does not page', () => {
  const coverage = sample(); coverage.categories[0].hireable = 3
  assert.equal(categorySupplyReading(coverage).bad, false)
})
test('unknown, duplicate or malformed coverage cannot produce a healthy reading', () => {
  for (const coverage of [null, {}, { ...sample(), chainId: 97 }, { ...sample(), categories: [] },
    { ...sample(), categories: [...sample().categories, { category: 'yield', hireable: 5 }] },
    ...[null, '3', -1, 2.5].map(hireable => ({ ...sample(), categories: sample().categories.map(row => row.category === 'yield' ? { ...row, hireable } : row) })),
  ]) assert.throws(() => categorySupplyReading(coverage))
})
