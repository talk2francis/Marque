import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyReadiness, verifyLegacyRelease } from './readiness.mjs'
const release = 'a'.repeat(40)
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
function fixture(replies) {
  let now = 0, calls = 0
  return { calls: () => calls, options: { release, timeoutMs: 1000, now: () => now, wait: async ms => { now += ms }, read: async () => replies[Math.min(calls++, replies.length - 1)] } }
}
const ready = n => ({ status: 200, body: { ready: true, instance: id(n), release } })
test('requires distinct initialized workers after complete readiness responses', async () => {
  const f = fixture([{ status: 503, body: { ready: false } }, ready(1), ready(1), ready(2)])
  assert.equal((await verifyReadiness('unused', f.options)).workers, 2)
  assert.equal(f.calls(), 4)
})
test('one repeatedly sampled worker never proves a two-worker deployment', async () => {
  const f = fixture([ready(1)])
  await assert.rejects(verifyReadiness('unused', f.options), /1 of 2/)
})
test('rejects a ready worker from a different release immediately', async () => {
  const f = fixture([{ ...ready(1), body: { ...ready(1).body, release: 'b'.repeat(40) } }])
  await assert.rejects(verifyReadiness('unused', f.options), /release mismatch/)
  assert.equal(f.calls(), 1)
})
test('does not mistake a liveness body for module readiness', async () => {
  const f = fixture([{ status: 200, body: { ok: true, instance: id(1), release } }])
  await assert.rejects(verifyReadiness('unused', f.options), /0 of 2/)
})
test('legacy rollback accepts an exact-release liveness body without readiness UUIDs', async () => {
  assert.deepEqual(await verifyLegacyRelease('unused', { release, read: async () => ({ status: 200, body: { ok: true, release } }) }), { legacy: true, release })
})
test('legacy rollback rejects wrong or absent tags, failing liveness and bad HTTP status', async () => {
  for (const reply of [{ status: 200, body: { ok: true, release: 'b'.repeat(40) } }, { status: 200, body: { ok: true } }, { status: 200, body: { ok: false, release } }, { status: 503, body: { ok: true, release } }]) {
    await assert.rejects(verifyLegacyRelease('unused', { release, read: async () => reply }), /legacy release mismatch/)
  }
})
test('legacy rollback cannot accept a response whose body failed to decode completely', async () => {
  await assert.rejects(verifyLegacyRelease('unused', { release, read: async () => { throw Error('truncated JSON') } }), /truncated JSON/)
})
