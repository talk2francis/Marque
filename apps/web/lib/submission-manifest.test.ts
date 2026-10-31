import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  keccak256,
  parseAbi,
  sha256,
  stringToHex,
  toBytes,
  type Hex,
} from 'viem'
const h = vi.hoisted(() => ({
  tx: {} as Record<string, unknown>,
  receipt: {} as Record<string, unknown>,
}))
vi.mock('@marque/commerce', async (original) => ({
  ...(await original<object>()),
  chainClient: () => ({
    getTransaction: async () => h.tx,
    getTransactionReceipt: async () => h.receipt,
  }),
}))
import { network } from '@marque/commerce'
import { readSubmissionManifest, submissionPayload } from './submission-manifest'
import { MAX_DELIVERY_BYTES } from './delivery-bytes'
const abi = parseAbi([
  'function submit(uint256 jobId,bytes32 deliverable,bytes optParams)',
  'event JobSubmitted(uint256 indexed jobId,address indexed provider,bytes32 deliverable)',
])
const provider = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const jobId = '123'
const raw = ' {"result":{"health_factor":2.3},"note":"Exact bytes, including whitespace"}\n'
let txHash: Hex
let hash: Hex
let serial = 0
const input = (value = raw, digest = hash, id = 123n) =>
  encodeFunctionData({ abi, functionName: 'submit', args: [id, digest, stringToHex(value)] })
beforeEach(() => {
  txHash = `0x${(++serial).toString(16).padStart(64, '0')}`
  hash = sha256(toBytes(raw))
  const blockHash = `0x${'a'.repeat(64)}`
  h.tx = {
    hash: txHash,
    to: network(56).commerce,
    from: provider,
    blockHash,
    chainId: 56,
    input: input(),
  }
  h.receipt = {
    transactionHash: txHash,
    to: network(56).commerce,
    blockHash,
    status: 'success',
    logs: [
      {
        address: network(56).commerce,
        topics: encodeEventTopics({
          abi,
          eventName: 'JobSubmitted',
          args: { jobId: 123n, provider },
        }),
        data: encodeAbiParameters([{ type: 'bytes32' }], [hash]),
      },
    ],
  }
})
const read = () => readSubmissionManifest(56, jobId, hash, provider, txHash)
describe('public answers in kernel submissions are bound to the transaction and exact bytes', () => {
  it('accepts SHA-256 without silently labelling it keccak256', async () => {
    expect(await read()).toMatchObject({
      raw,
      hash,
      hashAlgorithm: 'sha256',
      matches: true,
      source: 'submission_calldata',
      content: { result: { health_factor: 2.3 } },
    })
  })
  it('also accepts exact-byte keccak commitments', () => {
    const k = keccak256(toBytes(raw))
    expect(submissionPayload(input(raw, k), jobId, k)).toMatchObject({
      hashAlgorithm: 'keccak256',
      matches: true,
    })
  })
  it('does not accept the same JSON after reformatting', () =>
    expect(submissionPayload(input(JSON.stringify(JSON.parse(raw))), jobId, hash)).toBeNull())
  it('rejects a different job or committed digest in calldata', () => {
    expect(submissionPayload(input(raw, hash, 124n), jobId, hash)).toBeNull()
    expect(submissionPayload(input(raw, keccak256(toBytes(raw))), jobId, hash)).toBeNull()
  })
  it.each([
    'status',
    'destination',
    'sender',
    'transaction hash',
    'block',
    'network',
    'event address',
    'event absent',
    'event job',
    'event provider',
    'event digest',
  ])('rejects mismatched %s', async (what) => {
    if (what === 'status') h.receipt.status = 'reverted'
    if (what === 'destination') h.tx.to = other
    if (what === 'sender') h.tx.from = other
    if (what === 'transaction hash') h.receipt.transactionHash = `0x${'b'.repeat(64)}`
    if (what === 'block') h.tx.blockHash = `0x${'b'.repeat(64)}`
    if (what === 'network') h.tx.chainId = 97
    const logs = h.receipt.logs as Array<{ address: string; topics: unknown; data: Hex }>
    if (what === 'event address') logs[0]!.address = other
    if (what === 'event absent') h.receipt.logs = []
    if (what === 'event job')
      logs[0]!.topics = encodeEventTopics({
        abi,
        eventName: 'JobSubmitted',
        args: { jobId: 124n, provider },
      })
    if (what === 'event provider')
      logs[0]!.topics = encodeEventTopics({
        abi,
        eventName: 'JobSubmitted',
        args: { jobId: 123n, provider: other },
      })
    if (what === 'event digest')
      logs[0]!.data = encodeAbiParameters([{ type: 'bytes32' }], [`0x${'c'.repeat(64)}`])
    expect(await read()).toBeNull()
  })
  it.each(['null', '[]', 'broken JSON', '\ufeff{"x":1}'])('rejects unusable JSON %s', (value) => {
    const digest = sha256(toBytes(value))
    expect(submissionPayload(input(value, digest), jobId, digest)).toBeNull()
  })
  it('bounds payload bytes before parsing', () => {
    const huge = ' '.repeat(MAX_DELIVERY_BYTES + 1)
    const digest = sha256(toBytes(huge))
    expect(submissionPayload(input(huge, digest), jobId, digest)).toBeNull()
  })
  it('does not treat a URL pointer as an inline answer', () => {
    const url = 'https://example.invalid/file.json'
    const digest = sha256(toBytes(url))
    expect(submissionPayload(input(url, digest), jobId, digest)).toBeNull()
  })
})
