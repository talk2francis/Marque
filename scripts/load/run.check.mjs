import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

for (const exit of [69, 99, 108, 1]) test(`stops the entire load run after k6 exits ${exit}`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'marque-load-guard-')), bin = join(dir, 'bin'), out = join(dir, 'results')
  mkdirSync(bin)
  const stub = (name, code) => writeFileSync(join(bin, name), '#!/bin/bash\n' + code + '\n', { mode: 0o700 })
  stub('pm2', "echo '[]'")
  stub('vmstat', 'exit 0')
  stub('free', "echo 'Mem: 100 10 90 0 0 90'")
  stub('sleep', '/bin/sleep 0.01')
  stub('k6', 'echo called >> "$LOAD_GUARD_CALLS"; exit "$LOAD_GUARD_EXIT"')
  try {
    const r = spawnSync('bash', ['scripts/load/run.sh', 'https://example.invalid', out], { env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, STAGES: '25 50 100', HOLD: '60s', LOAD_GUARD_CALLS: join(dir, 'calls'), LOAD_GUARD_EXIT: String(exit) }, encoding: 'utf8', timeout: 10000 })
    assert.equal(r.status, exit, r.stderr)
    assert.equal(readFileSync(join(dir, 'calls'), 'utf8').trim(), 'called', 'No higher stage may run')
    assert.match(readFileSync(join(out, 'restarts.txt'), 'utf8'), /no higher stage was started/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
