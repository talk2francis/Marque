import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const source = readFileSync(new URL('../ecosystem.config.cjs', import.meta.url), 'utf8')
const sha = 'a'.repeat(40)
function load(release) {
  const module = { exports: {} }
  const fs = {
    existsSync: path => path === '/root/.marque/secrets.env',
    readFileSync: path => {
      if (path === '/root/.marque/secrets.env') return 'RPC_BSC_URL=https://rpc.invalid\nSELLER_PRIVATE_KEY=fixture-secret\nOPERATOR_PK=fixture-secret\nOPENAI_API_KEY=fixture-secret\n'
      if (path === '/root/marque/releases/mcp/RELEASE_SHA' && release !== undefined) return release
      throw new Error('missing fixture file')
    },
  }
  runInNewContext(source, { module, require: name => { assert.equal(name, 'node:fs'); return fs }, process: { env: { MARQUE_RELEASE_SHA: 'b'.repeat(40) } } })
  return JSON.parse(JSON.stringify(module.exports.apps))
}
test('MCP metadata follows the active release file rather than another slot shell value', () => {
  const mcp = load(sha + '\n').find(a => a.name === 'marque-mcp')
  assert.equal(mcp.env.MARQUE_RELEASE_SHA, sha)
  assert.equal(mcp.filter_env, true)
  for (const name of ['SELLER_PRIVATE_KEY', 'OPERATOR_PK', 'OPENAI_API_KEY']) assert.equal(mcp.env[name], undefined)
})
test('missing or malformed release metadata cannot become a claimed release', () => {
  for (const release of [undefined, 'not-a-commit', sha + '\nextra']) assert.equal(load(release).find(a => a.name === 'marque-mcp').env.MARQUE_RELEASE_SHA, '')
})
test('changing the MCP release does not change any other process or key filter', () => {
  const first = load(sha), second = load('c'.repeat(40))
  assert.deepEqual(first.filter(a => a.name !== 'marque-mcp'), second.filter(a => a.name !== 'marque-mcp'))
  for (const apps of [first, second]) delete apps.find(a => a.name === 'marque-mcp').env.MARQUE_RELEASE_SHA
  assert.deepEqual(first, second)
})
