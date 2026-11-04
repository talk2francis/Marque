import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeFunctionData, keccak256, parseAbi, sha256, toBytes, toHex } from 'viem'
import { canonicalText, deliveryContent, deliveryDigest, sdkManifestHash } from './delivery-bytes'
import { submissionUrl } from './submission-manifest'
import { gatewayUrl } from './manifest'

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
    expect(gatewayUrl('ipfs://bafyabc/answer.json')).toBe('https://ipfs.io/ipfs/bafyabc/answer.json')
    expect(gatewayUrl('ar://xyz')).toBe('https://arweave.net/xyz')
    expect(gatewayUrl('https://a.example/x')).toBe('https://a.example/x')
  })
  it('keeps a plain-text or markdown answer as text', () => {
    expect(deliveryContent({ response: { content: '# Report\nAll good', content_type: 'text/markdown' } })).toEqual({ text: '# Report\nAll good' })
    expect(deliveryContent({ response: { content: '{"healthFactor":1.2}' } })).toEqual({ healthFactor: 1.2 })
  })
})
