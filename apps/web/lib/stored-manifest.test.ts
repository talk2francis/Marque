import { expect, it } from 'vitest'
import { keccak256, sha256, toBytes } from 'viem'
import { manifestFromStored } from './stored-manifest'
import { sdkManifestHash } from './delivery-bytes'

const raw = '{"response":{"content":"{\\"healthFactor\\":0,\\"recommend\\":false}"}}'
const hash = keccak256(toBytes(raw)), txUrl = 'https://bscscan.com/tx/0x' + 'ab'.repeat(32)
const stored = () => ({ raw, hash, matches: true, url: txUrl, source: 'submission_calldata', content: { fabricated: true } })
it('re-hashes saved bytes and derives content instead of trusting cached content or checks', () => {
  const value = manifestFromStored(stored(), hash, txUrl)
  expect(value).toMatchObject({ raw, hash, matches: true, source: 'submission_calldata', url: txUrl, content: { healthFactor: 0, recommend: false } })
  expect(value?.content).not.toHaveProperty('fabricated')
})
it('requires the current submission link for calldata provenance', () => {
  expect(manifestFromStored(stored(), hash, null)).toBeNull()
  expect(manifestFromStored(stored(), hash, txUrl + '00')).toBeNull()
})
it('supports the existing SHA-256 and SDK canonical commitments', () => {
  const sha = sha256(toBytes(raw))
  expect(manifestFromStored({ raw, hash: sha, matches: true }, sha, null)).toMatchObject({ matches: true, hashAlgorithm: 'sha256' })
  const doc = { version: 1, job_id: 1, chain_id: 56, contracts: {}, response: { content: { rate: 0 } }, metadata: {} }
  const sdk = sdkManifestHash(doc)!
  expect(manifestFromStored({ raw: JSON.stringify(doc, null, 2), hash: sdk, matches: true }, sdk, null)).toMatchObject({ matches: true, content: { rate: 0 } })
})
it('rejects missing, unverified, changed, oversized and malformed saved manifests', () => {
  for (const value of [null, [], {}, { ...stored(), matches: null }, { ...stored(), hash: '0x' + '00'.repeat(32) },
    { ...stored(), raw: raw + 'changed' }, { ...stored(), raw: 'x'.repeat(512 * 1024 + 1) },
    { ...stored(), url: 'javascript:alert(1)' }, { ...stored(), raw: null }]) expect(manifestFromStored(value, hash, txUrl)).toBeNull()
  expect(manifestFromStored(stored(), 'invalid', txUrl)).toBeNull()
})
it('retains plaintext and unavailable structured content without inventing a category answer', () => {
  for (const text of ['plain answer', 'null', '[]']) {
    const h = keccak256(toBytes(text)), value = manifestFromStored({ raw: text, hash: h, matches: true }, h, null)
    expect(value?.content).toEqual(text === 'plain answer' ? { text } : null)
  }
})
