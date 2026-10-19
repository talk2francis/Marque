import { test } from 'node:test'
import assert from 'node:assert/strict'
import { warmCandidateProjections } from './warm-projections.mjs'
const START = Date.parse('2026-10-19T19:00:00Z')
function fixture(reply) {
  let clock = START
  const seen = []
  return { seen, options: { now: () => clock, wait: async ms => { clock += ms }, fetchPage: async route => { seen.push(route); return reply(route, clock, seen.length) } } }
}
const home = at => `<html><body aria-label="Quote snapshot at ${new Date(at).toISOString()}"></body></html>`
test('waits the natural interval and rejects stale build HTML until runtime regeneration', async () => {
  const f = fixture((route, now, call) => ({ cache: call <= 4 || call === 5 ? 'STALE' : 'HIT', html: home(call <= 5 ? START - 600000 : now) }))
  const result = await warmCandidateProjections('http://candidate.invalid', f.options)
  assert.equal(result.records.length, 4)
  assert.deepEqual(result.records.map(r => r.route), ['/', '/protocol', '/register', '/quest'])
  assert.ok(Date.parse(result.verifiedAt) - START >= 32000)
  assert.ok(Date.parse(result.records[0].snapshotAt) >= START)
})
test('a cached HIT containing fixture snapshot data cannot pass', async () => {
  const f = fixture(() => ({ cache: 'HIT', html: home(START - 600000) }))
  await assert.rejects(warmCandidateProjections('http://candidate.invalid', f.options), /did not refresh/)
})
test('keeps genuine unavailable runtime data as unavailable instead of inventing zero', async () => {
  const f = fixture(() => ({ cache: 'HIT', html: '<html>Live category counts are unavailable right now.</html>' }))
  const result = await warmCandidateProjections('http://candidate.invalid', f.options)
  assert.equal(result.records[0].snapshotAt, null)
})
test('fails closed when a route never completes revalidation', async () => {
  const f = fixture(() => ({ cache: 'STALE', html: home(START) }))
  await assert.rejects(warmCandidateProjections('http://candidate.invalid', f.options), /did not refresh/)
})
test('does not hide transport failures', async () => {
  const f = fixture(() => { throw Error('synthetic transport failure') })
  await assert.rejects(warmCandidateProjections('http://candidate.invalid', f.options), /synthetic transport failure/)
})
