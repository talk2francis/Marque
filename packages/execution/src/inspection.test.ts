import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hex, type TransactionReceipt } from 'viem'
import { buildReceiptBundle, inspectReceiptBundle, inspectReceiptAnchor } from './portable-receipt'
import { inspectTransaction, type InspectionRpc } from './chain-inspection'
import vectors from './receipt-vectors.fixture.json'

// All chain objects here are synthetic. Real historical reads stay outside Git.
const txHash = ('0x' + '1'.repeat(64)) as Hex
const blockHash = ('0x' + '2'.repeat(64)) as Hex
const contract = ('0x' + '3'.repeat(40)) as Hex
const actor = ('0x' + '4'.repeat(40)) as Hex
const now = new Date('2026-10-17T00:00:00Z')
const timestamp = BigInt(now.getTime() / 1000)
const abi = parseAbi(['event Anchored(address indexed anchorer, bytes32 indexed leaf, uint64 blockTime)'])
function fixture(version = 0) {
  const v = structuredClone(vectors[version]!)
  const bundle = buildReceiptBundle({ hash: v.hash, body: v.receipt, anchorTxHash: txHash, anchorBlock: '100' })
  const log = { address: contract, data: encodeAbiParameters([{ type: 'uint64' }], [timestamp - 10n]), topics: encodeEventTopics({ abi, eventName: 'Anchored', args: { anchorer: actor, leaf: v.hash as Hex } }), blockNumber: 100n, blockHash, transactionHash: txHash, transactionIndex: 0, logIndex: 0, removed: false }
  const receipt = { transactionHash: txHash, blockNumber: 100n, blockHash, status: 'success', to: contract, logs: [log] } as unknown as TransactionReceipt
  const rpc: InspectionRpc = {
    getChainId: vi.fn(async () => 97),
    getBlock: vi.fn(async (input) => ({ number: input.blockNumber ?? 110n, hash: blockHash, timestamp: input.blockNumber ? timestamp - 10n : timestamp })),
    getTransactionReceipt: vi.fn(async () => receipt),
  }
  return { bundle, rpc, receipt }
}
describe('portable receipt inspection', () => {
  it.each([0, 1])('keeps old receipt version/hash intact inside a V2 container %#', i => {
    const { bundle } = fixture(i)
    expect(inspectReceiptBundle(bundle)).toMatchObject({ state: 'VERIFIABLE', integrity: 'MATCH', receiptVersion: vectors[i]!.receipt.version, bundleVersion: 2, payment: { state: 'UNAVAILABLE' }, issuerAuthentication: 'NOT_PROVIDED', independence: 'UNKNOWN' })
    expect(bundle.payload.receipt).toEqual(vectors[i]!.receipt)
    expect(bundle.payload.receiptHash).toBe(vectors[i]!.hash)
    expect(bundle.payload.anchor.chainId).toBeNull()
  })
  it('fails mutations, fabricated binding, missing/unsupported metadata and oversized JSON without network', async () => {
    const { bundle, rpc } = fixture()
    bundle.payload.receipt.runId += '!'
    expect(inspectReceiptBundle(bundle).state).toBe('FAILED')
    expect((await inspectReceiptAnchor(bundle, rpc)).state).toBe('FAILED')
    expect(rpc.getChainId).not.toHaveBeenCalled()
    const missing = fixture().bundle as unknown as { payload: Record<string, unknown> }
    delete missing.payload['bindings']
    expect(inspectReceiptBundle(missing).state).toBe('UNAVAILABLE')
    expect(inspectReceiptBundle({ version: '2' }).state).toBe('UNAVAILABLE')
    expect(inspectReceiptBundle({ huge: 'x'.repeat(2 * 1024 * 1024 + 1) }).state).toBe('FAILED')
  })
  it('requires explicit missing anchor context, validates the exact event and never asserts payment', async () => {
    const { bundle, rpc } = fixture()
    expect((await inspectReceiptAnchor(bundle, rpc, { now })).state).toBe('UNAVAILABLE')
    expect(rpc.getChainId).not.toHaveBeenCalled()
    expect(await inspectReceiptAnchor(bundle, rpc, { now, chainId: 97, contract })).toMatchObject({ state: 'VERIFIABLE', referenceSource: 'INSPECTOR_SUPPLIED_MISSING_METADATA', anchorer: actor, confirmations: '11' })
    expect(inspectReceiptBundle(bundle)).toMatchObject({ payment: { state: 'UNAVAILABLE' }, quality: { state: 'UNAVAILABLE' }, authority: { state: 'UNAVAILABLE' } })
  })
  it.each(['contract', 'leaf', 'signature', 'removed', 'blockTime'])('rejects wrong anchor %s', async kind => {
    const { bundle, rpc, receipt } = fixture()
    const log = receipt.logs[0]!
    if (kind === 'contract') receipt.to = actor
    if (kind === 'leaf') log.topics = encodeEventTopics({ abi, eventName: 'Anchored', args: { anchorer: actor, leaf: blockHash } })
    if (kind === 'signature') log.topics[0] = blockHash
    if (kind === 'removed') log.removed = true
    if (kind === 'blockTime') log.data = encodeAbiParameters([{ type: 'uint64' }], [timestamp])
    expect((await inspectReceiptAnchor(bundle, rpc, { now, chainId: 97, contract })).state).toBe('FAILED')
  })
})
describe('read-only chain reference consistency', () => {
  it.each(['chain', 'hash', 'status', 'recordedBlock', 'reorg'])('rejects %s mismatch', async kind => {
    const { rpc, receipt } = fixture()
    if (kind === 'chain') vi.mocked(rpc.getChainId).mockResolvedValue(56)
    if (kind === 'hash') receipt.transactionHash = blockHash
    if (kind === 'status') receipt.status = 'reverted'
    if (kind === 'recordedBlock') receipt.blockNumber = 101n
    if (kind === 'reorg') vi.mocked(rpc.getBlock).mockImplementation(async input => ({ number: input.blockNumber ?? 110n, hash: actor, timestamp }))
    expect((await inspectTransaction(rpc, { chainId: 97, txHash, blockNumber: '100' }, { now })).state).toBe('FAILED')
  })
  it('reports missing receipt, insufficient finality, stale head and RPC failure distinctly', async () => {
    const { rpc } = fixture()
    vi.mocked(rpc.getTransactionReceipt).mockRejectedValueOnce(Object.assign(new Error('Transaction receipt not found'), { name: 'TransactionReceiptNotFoundError' }))
    expect((await inspectTransaction(rpc, { chainId: 97, txHash }, { now })).state).toBe('PENDING')
    vi.mocked(rpc.getTransactionReceipt).mockRejectedValueOnce(Object.assign(new Error('receipt not found'), { name: 'TransactionReceiptNotFoundError' }))
    expect((await inspectTransaction(rpc, { chainId: 97, txHash, blockNumber: '100' }, { now })).state).toBe('UNAVAILABLE')
    vi.mocked(rpc.getBlock).mockImplementation(async input => ({ number: input.blockNumber ?? 100n, hash: blockHash, timestamp: input.blockNumber ? timestamp - 10n : timestamp }))
    expect((await inspectTransaction(rpc, { chainId: 97, txHash }, { now })).state).toBe('PENDING')
    expect((await inspectTransaction(rpc, { chainId: 97, txHash }, { now, minConfirmations: 1 })).state).toBe('FAILED')
    vi.mocked(rpc.getBlock).mockResolvedValue({ number: 110n, hash: blockHash, timestamp: timestamp - 121n })
    expect((await inspectTransaction(rpc, { chainId: 97, txHash }, { now })).state).toBe('UNAVAILABLE')
    vi.mocked(rpc.getChainId).mockRejectedValue(new Error('offline'))
    expect((await inspectTransaction(rpc, { chainId: 97, txHash }, { now })).state).toBe('UNAVAILABLE')
  })
})
