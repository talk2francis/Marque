import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isVerificationRpcRead } from './verification-rpc.mjs'

const endpoint = 'https://bsc-dataseed.bnbchain.org/'
const read = { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0x0000000000000000000000000000000000000001', data: '0x' }, 'latest'] }
test('allows actual contract reads and batches of only contract reads at the existing public BSC RPC', () => {
  assert.equal(isVerificationRpcRead(endpoint, JSON.stringify(read)), true)
  assert.equal(isVerificationRpcRead(endpoint, JSON.stringify([read, { ...read, id: 2 }])), true)
})
for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'wallet_sendCalls', 'personal_sign', 'eth_sign', 'wallet_grantPermissions']) {
  test(`blocks ${method}, including when mixed with a read`, () => {
    const write = { ...read, method }
    assert.equal(isVerificationRpcRead(endpoint, JSON.stringify(write)), false)
    assert.equal(isVerificationRpcRead(endpoint, JSON.stringify([read, write])), false)
  })
}
test('does not allow other origins, protocols, ports, credentials, paths or queries', () => {
  for (const url of ['http://bsc-dataseed.bnbchain.org/', 'https://bsc-dataseed.bnbchain.org.evil.invalid/', 'https://bsc-dataseed.bnbchain.org:444/', 'https://user:password@bsc-dataseed.bnbchain.org/', 'https://bsc-dataseed.bnbchain.org/task', endpoint + '?task=send', endpoint + '#fragment', '/api/task']) {
    assert.equal(isVerificationRpcRead(url, JSON.stringify(read)), false, url)
  }
})
test('fails closed for empty, malformed and unsupported JSON-RPC envelopes', () => {
  for (const body of ['not json', '', 'null', '[]', '{}', JSON.stringify({ ...read, jsonrpc: '1.0' }), JSON.stringify({ ...read, params: null }), JSON.stringify({ ...read, params: [] }), JSON.stringify({ ...read, params: [null] }), JSON.stringify([read, null])]) {
    assert.equal(isVerificationRpcRead(endpoint, body), false, body)
  }
})
