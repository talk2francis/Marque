import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plan, isoWeek } from './backup-retention.mjs'

const DAY = 86400000
const name = (prefix, ms) => `${prefix}-${new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.sql.gz.age`
const nightly = (prefix, fromIso, days) => Array.from({ length: days }, (_, i) => name(prefix, Date.parse(fromIso) + i * DAY))

test('ISO weeks follow the standard (Monday start, week 1 holds the first Thursday)', () => {
  assert.equal(isoWeek(Date.parse('2026-11-23T02:17:01Z')), '2026-W48') // a Monday
  assert.equal(isoWeek(Date.parse('2026-11-29T23:00:00Z')), '2026-W48') // the Sunday after
  assert.equal(isoWeek(Date.parse('2027-01-01T00:00:00Z')), '2026-W53')
})

test('fewer copies than the daily window: nothing is deleted', () => {
  const names = nightly('marque', '2026-11-01T02:17:01Z', 14)
  assert.deepEqual(plan(names).delete, [])
})

test('a year of nightly copies keeps 14 days, 8 weeks and every month start', () => {
  const names = nightly('marque', '2026-01-01T02:17:01Z', 365)
  const p = plan(names)
  const newest14 = names.slice(-14)
  for (const n of newest14) assert.ok(p.keep.includes(n), `newest daily ${n} kept`)
  for (let m = 1; m <= 12; m++) {
    const first = names.find((n) => n.startsWith(`marque-2026${String(m).padStart(2, '0')}01`))
    assert.ok(p.keep.includes(first), `month start ${first} kept`)
  }
  // 14 daily + up to 8 weekly + 12 monthly, with overlaps
  assert.ok(p.keep.length >= 14 && p.keep.length <= 34, `kept ${p.keep.length}`)
  assert.equal(p.keep.length + p.delete.length, 365)
})

test('a gap of failed uploads never ages out the last good copies', () => {
  const before = nightly('marque', '2026-10-01T02:17:01Z', 30)
  const p = plan(before) // nothing newer exists, so the newest 14 present days are kept
  for (const n of before.slice(-14)) assert.ok(p.keep.includes(n))
})

test('missing month start keeps the earliest copy of that month', () => {
  const names = nightly('marque', '2026-06-03T02:17:01Z', 60)
  const p = plan(names)
  assert.ok(p.keep.includes(names[0])) // 3 June stands in for 1 June
})

test('prefixes are planned independently and foreign files are untouched', () => {
  const names = [...nightly('marque', '2026-09-01T02:17:01Z', 40), ...nightly('charters', '2026-11-01T02:17:01Z', 5), 'notes.txt', 'marque-latest.sql.gz']
  const p = plan(names)
  assert.deepEqual(p.ignored, ['marque-latest.sql.gz', 'notes.txt'])
  assert.ok(p.delete.every((n) => n.startsWith('marque-')))
  assert.equal(p.keep.filter((n) => n.startsWith('charters-')).length, 5)
})

test('two copies on one day: the newer counts as that day', () => {
  const a = 'marque-20261126T021701Z.sql.gz.age'
  const b = 'marque-20261126T201500Z.sql.gz.age'
  const older = nightly('marque', '2026-11-01T02:17:01Z', 25)
  const p = plan([...older, a, b])
  assert.ok(p.keep.includes(b))
})
