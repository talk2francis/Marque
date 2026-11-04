import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeFunctionData, keccak256, parseAbi, sha256, toBytes, toHex } from 'viem'
import { canonicalText, deliveryContent, deliveryDigest, sdkManifestHash } from './delivery-bytes'
import { optParamsOf, submissionUrl } from './submission-manifest'
import { gatewayUrl, gatewayUrls } from './manifest'

/**
 * Every way a seller commits to its answer (4 Nov). A delivered answer counts only when its bytes match the hash on
 * chain; these are the forms Marque recomputes. The fixture is a real BSC testnet delivery (job 1702) stored off chain
 * by the BNB Agent Studio SDK, whose on-chain hash is the manifest's canonical JSON.
 */
const raw = readFileSync(new URL('./__fixtures__/sdk-manifest-testnet-1702.json', import.meta.url), 'utf8')
const ONCHAIN = '0x4910d71dd434f58ed7e71fd1e70d26a3934c297e5e2033db13a9e5fc988345d6'
const SUBMIT = parseAbi(['function submit(uint256 jobId, bytes32 deliverable, bytes optParams)'])

vi.mock('server-only', () => ({}))

describe('delivered answer hashes', () => {
  it('recomputes the SDK canonical manifest hash of a real delivery', () => {
    expect(sdkManifestHash(JSON.parse(raw))).toBe(ONCHAIN)
    expect(deliveryDigest(raw, ONCHAIN)).toMatchObject({ matches: true })
  })
  it('still accepts the exact bytes, by keccak256 or sha256', () => {
    expect(deliveryDigest(raw, keccak256(toBytes(raw)))).toMatchObject({ matches: true, hashAlgorithm: 'keccak256' })
    expect(deliveryDigest(raw, sha256(toBytes(raw)))).toMatchObject({ matches: true, hashAlgorithm: 'sha256' })
  })
  it('accepts a hash of the answer content alone, or of the whole document canonicalised', () => {
    const doc = { response: { content: '{"healthFactor":1.2}' }, note: 'π' }
    const text = JSON.stringify(doc)
    expect(deliveryDigest(text, keccak256(toBytes('{"healthFactor":1.2}')))).toMatchObject({ matches: true })
    expect(deliveryDigest(text, keccak256(toBytes(canonicalText(doc))))).toMatchObject({ matches: true })
    expect(canonicalText({ b: 1, a: 'π' })).toBe('{"a":"\\u03c0","b":1}')
  })
  it('never matches a different answer', () => {
    const doc = JSON.parse(raw) as { response: { content: string } }
    expect(doc.response.content).toContain('"inRange":false')
    doc.response.content = doc.response.content.replace('"inRange":false', '"inRange":true')
    expect(deliveryDigest(JSON.stringify(doc), ONCHAIN).matches).toBe(false)
  })
})

describe('where an answer is found', () => {
  it('follows the deliverable_url an SDK submission carries, under its common names', () => {
    for (const key of ['deliverable_url', 'url', 'uri', 'manifest_url']) {
      const input = encodeFunctionData({ abi: SUBMIT, functionName: 'submit', args: [1702n, ONCHAIN, toHex(JSON.stringify({ [key]: 'https://blob.example/deliverables/1702.json' }))] })
      expect(submissionUrl(input, '1702', ONCHAIN)).toBe('https://blob.example/deliverables/1702.json')
    }
    const other = encodeFunctionData({ abi: SUBMIT, functionName: 'submit', args: [1703n, ONCHAIN, toHex('{"deliverable_url":"https://x.example/a"}')] })
    expect(submissionUrl(other, '1702', ONCHAIN)).toBeNull()
  })
  it('reads ipfs and arweave links through public gateways', () => {
    expect(gatewayUrl('ipfs://bafyabc/answer.json')).toBe('https://ipfs.filebase.io/ipfs/bafyabc/answer.json')
    expect(gatewayUrls('ipfs://QmaPoLHEuVCsucehhv237UY8JbzRrCNwhFjBjRiU37DP8A')).toHaveLength(3)
    const pinned = 'https://x.mypinata.cloud/ipfs/QmaPoLHEuVCsucehhv237UY8JbzRrCNwhFjBjRiU37DP8A'
    expect(gatewayUrls(pinned)[0]).toBe(pinned)
    expect(gatewayUrls(pinned)).toContain('https://ipfs.filebase.io/ipfs/QmaPoLHEuVCsucehhv237UY8JbzRrCNwhFjBjRiU37DP8A')
    expect(gatewayUrls('https://a.example/ipfs/notacid')).toEqual(['https://a.example/ipfs/notacid'])
    expect(gatewayUrl('ar://xyz')).toBe('https://arweave.net/xyz')
    expect(gatewayUrl('https://a.example/x')).toBe('https://a.example/x')
  })
  it('keeps a plain-text or markdown answer as text', () => {
    expect(deliveryContent({ response: { content: '# Report\nAll good', content_type: 'text/markdown' } })).toEqual({ text: '# Report\nAll good' })
    expect(deliveryContent({ response: { content: '{"healthFactor":1.2}' } })).toEqual({ healthFactor: 1.2 })
  })
})

describe('a provider that submits through its own contract (mainnet job 57051)', () => {
  // The forwarder's real calldata: (seller id, job id, deliverable hash, optParams) under its own selector.
  const input = '0x0e4879b20000000000000000000000000000000000000000000000000000000000002ba0000000000000000000000000000000000000000000000000000000000000dedb612917c2c1122dedce95df23f8f5d21afef5703ddf37b5f68f29a568440df6d6000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000667b2264656c6976657261626c655f75726c223a2268747470733a2f2f676174657761792e70696e6174612e636c6f75642f697066732f516d526f676139594b7747394144544d4c4d4a4d545a3236533241374a52327a5359323274345934324777464846227d0000000000000000000000000000000000000000000000000000' as const
  const hash = '0x612917c2c1122dedce95df23f8f5d21afef5703ddf37b5f68f29a568440df6d6'
  it('finds the answer URL inside the forwarder call', () => {
    expect(submissionUrl(input, '57051', hash)).toBe('https://gateway.pinata.cloud/ipfs/QmRoga9YKwG9ADTMLMJMTZ26S2A7JR2zSY22t4Y42GwFHF')
  })
  it('offers nothing when the call does not carry this job and this hash', () => {
    expect(optParamsOf(input, '57052', hash)).toEqual([])
    expect(optParamsOf(input, '57051', `0x${'1'.repeat(64)}`)).toEqual([])
  })
})
