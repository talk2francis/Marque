import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateWindow, checkHealth, persistentProcesses, checkHost, collectResponses, completedStage } from './capacity-guards.mjs'
const sha = 'a'.repeat(40), start = '2026-11-11T21:00:00Z', ms = Date.parse(start)
test('only the exact approved start window and complete SHA are accepted', () => {
  validateWindow(sha, start, ms)
  for (const now of [ms - 1, ms + 30 * 60_000 + 1]) assert.throws(() => validateWindow(sha, start, now))
  assert.throws(() => validateWindow('main', start, ms))
  assert.throws(() => validateWindow(sha, 'invalid', ms))
})
test('unhealthy or changed production release stops the run', () => {
  checkHealth({ ok: true, release: sha }, sha)
  assert.throws(() => checkHealth({ ok: false, release: sha }, sha))
  assert.throws(() => checkHealth({ ok: true, release: 'b'.repeat(40) }, sha))
})
test('normal short-lived keys process is excluded; persistent restarts and low memory stop the run', () => {
  const row = { name: 'marque-web', pm_id: 3, pm2_env: { status: 'online', restart_time: 4 } }
  const baseline = persistentProcesses([row, { ...row, name: 'marque-charters-keys' }])
  assert.equal(baseline.length, 1)
  checkHost(baseline, baseline, 2_000_000)
  assert.throws(() => checkHost(baseline, [], 2_000_000))
  assert.throws(() => checkHost(baseline, [{ ...baseline[0], restarts: 5 }], 2_000_000))
  assert.throws(() => checkHost(baseline, baseline, 100_000))
})
test('count only request duration points, retaining 429 and other HTTP errors', () => {
  const point = (metric, status) => JSON.stringify({ type: 'Point', metric, data: { tags: { status } } })
  const counts = collectResponses([point('http_req_duration', '200'), point('http_req_duration', '429'), point('http_req_failed', '429'), point('http_req_duration', '404')])
  assert.deepEqual(counts, { 200: 1, 429: 1, 404: 1 })
  assert.throws(() => completedStage(0, counts))
  assert.throws(() => completedStage(0, {}))
  for (const code of [69, 99, 108, 1, null]) assert.throws(() => completedStage(code, { 200: 20 }))
  completedStage(0, { 200: 20 })
})

for (const [exit, status] of [[69, '200'], [0, '429']]) test(`external runner stops all higher stages after exit ${exit}, HTTP ${status}`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'marque-external-'))
  const out = join(dir, 'results'), calls = join(dir, 'calls')
  writeFileSync(join(dir, 'fetch.mjs'), `globalThis.fetch = async () => ({ ok:true, json:async()=>({ok:true,release:'${sha}'}) })`)
  writeFileSync(join(dir, 'k6'), `#!/bin/bash\necho called >> "$GUARD_CALLS"\nfor arg in "$@"; do\n  case "$arg" in json=*) raw="\${arg#json=}";; esac\ndone\nprintf '%s\\n' '{"type":"Point","metric":"http_req_duration","data":{"tags":{"status":"${status}"}}}' >> "$raw"\nexit ${exit}\n`, { mode: 0o700 })
  try {
    const r = spawnSync(process.execPath, ['--import', join(dir, 'fetch.mjs'), resolve('scripts/load/external.mjs')], {
      encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, PATH: `${dir}:${dirname(process.execPath)}:${process.env.PATH}`, EXPECTED_RELEASE: sha, NOT_BEFORE: new Date().toISOString(), CAPACITY_OUT: out, DRY_RUN: 'false', GUARD_CALLS: calls },
    })
    assert.equal(r.status, 1, r.stderr)
    assert.equal(readFileSync(calls, 'utf8').trim(), 'called')
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    assert.equal(manifest.stages.length, 1)
    assert.equal(manifest.stages[0].completedHold, false)
    assert.ok(manifest.failure)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
