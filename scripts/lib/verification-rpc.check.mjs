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
test('allows practice-lane balance and contract reads at the public BSC testnet RPC, never writes', () => {
  const t = 'https://bsc-testnet-rpc.publicnode.com/'
  const bal = { jsonrpc: '2.0', id: 3, method: 'eth_getBalance', params: ['0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452', 'latest'] }
  assert.equal(isVerificationRpcRead(t, JSON.stringify([read, bal, { jsonrpc: '2.0', id: 4, method: 'eth_chainId' }])), true)
  assert.equal(isVerificationRpcRead(t, JSON.stringify([bal, { ...read, method: 'eth_sendRawTransaction' }])), false)
  assert.equal(isVerificationRpcRead(t, JSON.stringify({ ...bal, params: ['not-an-address'] })), false)
})
