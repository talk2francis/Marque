import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyse } from '../src/strategy.js'
import { reader } from '../src/chain.js'
import { fromCase, type PublishedCase } from '../src/task.js'

const API = process.env['MARQUE_API'] ?? 'https://marque.trade'
const TEST = 'MCS-HF-1'

test(`${TEST}: every assertion holds on the published case`, async () => {
  const r = await fetch(`${API}/api/v1/conformance/cases?test=${TEST}`)
  assert.equal(r.status, 200, `could not read the published case (${r.status})`)
  const { cases } = (await r.json()) as { cases: PublishedCase[] }
  assert.ok(cases.length > 0, 'no published case')
  for (const c of cases) {
    const report = await analyse(fromCase(c), reader(BigInt(c.blockNumber)))
    const g = await fetch(`${API}/api/v1/conformance/grade`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId: c.caseId, response: report }) })
    const graded = (await g.json()) as { pass: boolean; diffs: Array<{ field: string; pass: boolean; expected: string; actual: string; tolerance: string }> }
    for (const d of graded.diffs) console.log(`${d.pass ? 'pass' : 'FAIL'}  ${d.field}: expected ${d.expected}, got ${d.actual} (${d.tolerance})`)
    assert.ok(graded.pass, `${c.caseId}: ${graded.diffs.filter((d) => !d.pass).map((d) => d.field).join(', ') || 'no assertion graded'} failed`)
  }
})
