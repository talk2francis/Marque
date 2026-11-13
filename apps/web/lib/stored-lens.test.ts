import { expect, it } from 'vitest'
import type { JobLens } from './lens'
import { reusableStoredLens } from './stored-lens'

const hash = `0x${'12'.repeat(32)}`
function fixture(): JobLens {
  return {
    lens: null, checkedAtBlock: '133153063', state: 'decided', stored: true, reason: null,
    attemptedAt: '2026-11-12T11:35:12.000Z', readable: true, terms: null,
    checks: [{ key: 'hf', label: 'Health factor', state: 'match', agent: '1.3', marque: '1.3', how: 'chain', detail: null }],
    summary: { checked: 1, agreed: 1 },
    manifest: { matches: true, hash, raw: '{"result":"original"}', url: 'https://example.invalid/original', source: 'submission_calldata' },
  }
}
it('reuses a saved original-block result without changing its provenance or date', () => {
  const value = fixture(), before = structuredClone(value)
  expect(reusableStoredLens(value, hash.toUpperCase().replace('0X', '0x'))).toBe(true)
  expect(value).toEqual(before)
})
it.each(['differs', 'fails'] as const)('preserves a saved negative %s result as historical evidence', state => {
  const value = fixture(); value.checks[0]!.state = state; value.summary.agreed = 0
  expect(reusableStoredLens(value, hash)).toBe(true)
})
it('does not reuse an incomplete or unsaved result or a missing/mismatched commitment', () => {
  for (const edit of [
    (v: JobLens) => { v.stored = false },
    (v: JobLens) => { v.state = 'unavailable' },
    (v: JobLens) => { v.state = 'no-check' },
    (v: JobLens) => { v.checks[0]!.state = 'unavailable' },
    (v: JobLens) => { v.manifest!.matches = false },
    (v: JobLens) => { v.manifest!.matches = null },
    (v: JobLens) => { v.manifest = null },
    (v: JobLens) => { v.manifest!.raw = null },
    (v: JobLens) => { v.checks = [] },
    (v: JobLens) => { v.summary.checked = 0 },
    (v: JobLens) => { v.summary.agreed = 0 },
  ]) {
    const value = fixture(); edit(value); expect(reusableStoredLens(value, hash)).toBe(false)
  }
  expect(reusableStoredLens(fixture(), `0x${'34'.repeat(32)}`)).toBe(false)
  expect(reusableStoredLens(fixture(), null)).toBe(false)
})
it('requires an original block for chain checks while permitting saved pure arithmetic', () => {
  const value = fixture(); value.checkedAtBlock = null
  expect(reusableStoredLens(value)).toBe(false)
  value.checks[0]!.how = 'arithmetic'
  expect(reusableStoredLens(value)).toBe(true)
})
