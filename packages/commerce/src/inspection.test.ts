import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, type Abi, type AbiEvent, type Hex, type PublicClient, type TransactionReceipt } from 'viem'
import { DeliverableManifest } from '@bnbagent/sdk/erc8183'
import { buildCommerceBundle, inspectCommerceContent, inspectCommerceBundle, inspectDeliverable } from './inspection'
import { network } from './config'
import { descriptionHash } from './description'
import { agenticCommerceAbi, evaluatorRouterAbi } from './generated'

// Synthetic public projections and RPC fixtures only. No jobs or payments are sent.
const now = new Date('2026-10-17T00:00:00Z'), seconds = BigInt(now.getTime() / 1000)
const provider = ('0x' + '1'.repeat(40)) as Hex, buyer = ('0x' + '2'.repeat(40)) as Hex
const blockHash = ('0x' + 'a'.repeat(64)) as Hex
const n = network(56), token = n.assets.find(a => a.isDefault)!
const text = 'Synthetic task, never sent to an agent'
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x))
function log(abi: Abi, name: string, args: Record<string, unknown>, contract: Hex, tx: Hex, block: bigint, index = 0) {
  const event = abi.find(x => x.type === 'event' && x.name === name) as AbiEvent
  const plain = event.inputs.filter(i => !i.indexed)
  return { address: contract, data: encodeAbiParameters(plain, plain.map(i => args[i.name!])), topics: encodeEventTopics({ abi, eventName: name, args }), blockNumber: block, blockHash, transactionHash: tx, transactionIndex: 0, logIndex: index, removed: false }
}
function fixture(kind: 'paid' | 'submitted' | 'expired' | 'refunded' = 'paid') {
  const manifest = { version: 1, job_id: 1, chain_id: 56, contracts: { commerce: n.commerce, router: n.router, policy: n.policy }, response: { content: { answer: 'synthetic fixture' } }, metadata: {} }
  const delivery = DeliverableManifest.fromDict(manifest).manifestHash()
  const specs: Array<{ name: string; args: Record<string, unknown> }> = [
    { name: 'JobCreated', args: { jobId: 1n, client: buyer, provider, evaluator: n.router, expiredAt: kind === 'expired' || kind === 'refunded' ? seconds - 1n : seconds + 7200n, hook: n.router } },
    { name: 'JobRegistered', args: { jobId: 1n, policy: n.policy, client: buyer } },
    { name: 'BudgetSet', args: { jobId: 1n, amount: 100n } },
    { name: 'JobFunded', args: { jobId: 1n, client: buyer, provider, amount: 100n } },
  ]
  if (kind === 'paid' || kind === 'submitted') specs.push({ name: 'JobSubmitted', args: { jobId: 1n, provider, deliverable: delivery } })
  if (kind === 'paid') specs.push({ name: 'JobFinalised', args: { jobId: 1n, status: 3 } }, { name: 'JobCompleted', args: { jobId: 1n, evaluator: n.router, reason: blockHash } }, { name: 'PaymentReleased', args: { jobId: 1n, provider, amount: 100n } }, { name: 'JobSettled', args: { jobId: 1n, policy: n.policy, verdict: 1, reason: blockHash } })
  if (kind === 'refunded') specs.push({ name: 'Refunded', args: { jobId: 1n, client: buyer, amount: 100n } }, { name: 'JobExpired', args: { jobId: 1n } })
  const receipts = new Map<string, TransactionReceipt>()
  const events = specs.map((e, i) => {
    const tx = ('0x' + (i + 1).toString(16).padStart(64, '0')) as Hex
    const role = ['JobRegistered', 'JobSettled', 'JobFinalised'].includes(e.name) ? 'router' : 'commerce'
    const contract = n[role]
    const abi = role === 'router' ? evaluatorRouterAbi : agenticCommerceAbi
    const logs = [log(abi, e.name, e.args, contract, tx, BigInt(100 + i))]
    if (e.name === 'PaymentReleased' || e.name === 'Refunded') {
      const transferAbi = [{ type: 'event', name: 'Transfer', anonymous: false, inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] }] as const
      logs.push(log(transferAbi, 'Transfer', { from: n.commerce, to: e.name === 'Refunded' ? buyer : provider, value: 100n }, token.address, tx, BigInt(100 + i), 1))
    }
    receipts.set(tx, { transactionHash: tx, blockNumber: BigInt(100 + i), blockHash, status: 'success', to: contract, logs } as unknown as TransactionReceipt)
    return { name: e.name, contract: role, tx, logIndex: 0, block: 100 + i, at: now.toISOString(), args: json(e.args) }
  })
  const hasDelivery = kind === 'paid' || kind === 'submitted'
  const source = { chainId: 56, jobId: '1', provider, client: buyer, evaluator: n.router, amount: '100', token: { address: token.address, symbol: token.symbol, decimals: token.decimals }, deliverable: { hash: hasDelivery ? delivery : null, url: null }, intent: { agent_id: `56:${n.identityRegistry.toLowerCase()}:123`, quote_id: 1, description_hash: descriptionHash(text) }, events }
  const job = { id: 1n, client: buyer, provider, evaluator: n.router, description: text, budget: 100n, expiredAt: kind === 'expired' || kind === 'refunded' ? seconds - 1n : seconds + 7200n, status: kind === 'paid' ? 3 : kind === 'submitted' ? 2 : kind === 'expired' ? 1 : 5, hook: n.router, submittedAt: hasDelivery ? seconds - 30n : 0n, deliverable: hasDelivery ? delivery : ('0x' + '0'.repeat(64)) as Hex }
  const readContract = vi.fn(async (p: { functionName: string }) => {
    if (p.functionName === 'getJob') return job
    if (p.functionName === 'jobPaymentToken' || p.functionName === 'paymentToken') return token.address
    if (p.functionName === 'jobPolicy') return n.policy
    if (p.functionName === 'disputeWindow') return 3600n
    if (p.functionName === 'disputed') return false
    if (p.functionName === 'decimals') return token.decimals
    throw new Error('unexpected read')
  })
  const rpc = { getChainId: vi.fn(async () => 56), getBlock: vi.fn(async () => ({ number: 200n, hash: blockHash, timestamp: seconds })), readContract } as unknown as PublicClient
  const inspectTx = vi.fn(async (ref: { txHash: Hex }) => ({ state: 'VERIFIABLE' as const, reason: 'synthetic confirmed reference', receipt: receipts.get(ref.txHash), confirmations: '100' }))
  return { source, job, rpc, inspectTx, receipts, manifest, readContract, bundle: () => buildCommerceBundle(source, now.toISOString()) }
}
describe('portable public commerce evidence', () => {
  it('replays the exact listed events and current terms, separates transfer/payment/quality/authority', async () => {
    const f = fixture()
    const res = await inspectCommerceBundle(f.bundle(), f.rpc, f.inspectTx, { now, artifactBytes: Buffer.from(JSON.stringify(f.manifest)) })
    expect(res).toMatchObject({ state: 'VERIFIABLE', eventProjection: 'PAID', onchainStatus: 3, payment: { state: 'VERIFIABLE' }, completion: { state: 'VERIFIABLE' }, refund: { state: 'UNAVAILABLE' }, artifact: { state: 'VERIFIABLE' }, policy: { state: 'VERIFIABLE' }, feeApproval: { state: 'UNAVAILABLE' }, assetActionAuthority: 'UNAVAILABLE_NOT_PROVEN_BY_FEE_APPROVAL', humanAndFundingIndependence: 'UNKNOWN', sourceComputedAt: null })
    expect(f.inspectTx).toHaveBeenCalledTimes(9)
    expect(f.bundle().payload.bindings.serviceId).toBeNull()
    expect(f.bundle().payload.bindings.quoteHash).toBeNull()
  })
  it('distinguishes submitted/review, expired/refundable and confirmed refund without inferring payment', async () => {
    for (const kind of ['submitted', 'expired', 'refunded'] as const) {
      const f = fixture(kind), res = await inspectCommerceBundle(f.bundle(), f.rpc, f.inspectTx, { now })
      expect(res).toMatchObject({ state: 'VERIFIABLE', payment: { state: 'UNAVAILABLE' } })
      if (kind === 'submitted') expect(res).toMatchObject({ eventProjection: 'SUBMITTED', completion: { state: 'UNAVAILABLE' }, timeline: { disputable: true, settleable: false }, artifact: { state: 'UNAVAILABLE' } })
      if (kind === 'expired') expect(res).toMatchObject({ expiredWithoutDelivery: true, timeline: { refundable: true }, refund: { state: 'UNAVAILABLE' } })
      if (kind === 'refunded') expect(res).toMatchObject({ eventProjection: 'REFUNDED', refund: { state: 'VERIFIABLE' } })
    }
  })
  it.each(['job', 'provider', 'asset', 'amount', 'task', 'args', 'signature', 'block', 'duplicate'])('rejects preserved %s substitution', async kind => {
    const f = fixture()
    if (kind === 'job') f.source.jobId = '2'
    if (kind === 'provider') f.source.provider = buyer
    if (kind === 'asset') f.source.token.address = buyer
    if (kind === 'amount') f.source.amount = '101'
    if (kind === 'task') f.source.intent.description_hash = blockHash
    if (kind === 'args') f.source.events[0]!.args['provider'] = buyer
    if (kind === 'signature') f.receipts.values().next().value!.logs[0]!.topics[0] = blockHash
    if (kind === 'block') f.source.events[0]!.block++
    if (kind === 'duplicate') f.source.events.push(f.source.events[0]!)
    expect((await inspectCommerceBundle(f.bundle(), f.rpc, f.inspectTx, { now })).state).toBe('FAILED')
  })
  it('rejects mutated bytes before RPC, treats absent metadata as unavailable and propagates reorg/pending', async () => {
    const f = fixture(), b = f.bundle()
    b.payload.source.amount = '101'
    expect((await inspectCommerceBundle(b, f.rpc, f.inspectTx)).state).toBe('FAILED')
    expect(f.inspectTx).not.toHaveBeenCalled()
    expect(inspectCommerceContent({ schema: 'marque.commerce.bundle.v2' }).state).toBe('UNAVAILABLE')
    for (const state of ['PENDING', 'FAILED', 'UNAVAILABLE'] as const) {
      const g = fixture()
      const result = await inspectCommerceBundle(g.bundle(), g.rpc, async () => ({ state, reason: 'synthetic unavailable, reorg or pending' }), { now })
      expect(result.state).toBe(state)
      expect(g.readContract).not.toHaveBeenCalled()
    }
  })
  it('does not claim transfer proof when token bytes are absent or ambiguous', async () => {
    const f = fixture(), receipt = [...f.receipts.values()].at(-2)!
    receipt.logs = receipt.logs.slice(0, 1)
    expect(await inspectCommerceBundle(f.bundle(), f.rpc, f.inspectTx, { now })).toMatchObject({ state: 'VERIFIABLE', payment: { state: 'UNAVAILABLE' } })
  })
  it('rejects immutable expiry disagreement rather than using an inconsistent refund clock', async () => {
    const f = fixture('expired')
    f.job.expiredAt += 10_000n
    expect(await inspectCommerceBundle(f.bundle(), f.rpc, f.inspectTx, { now })).toMatchObject({ state: 'FAILED', reason: 'immutable_created_job_terms_disagree_with_current_chain' })
  })
  it('keeps source age distinct from export time and bounds invalid source input', () => {
    const f = fixture()
    const b = buildCommerceBundle(f.source, now.toISOString(), '2026-10-16T00:00:00.000Z')
    expect(b.payload.sourceComputedAt).not.toBe(b.payload.observedAt)
    expect(inspectCommerceContent(b)).toMatchObject({ integrity: 'MATCH' })
    expect(() => buildCommerceBundle({ ...f.source, chainId: 1 }, now.toISOString())).toThrow()
    expect(() => buildCommerceBundle({ ...f.source, unknown: 'x'.repeat(2 * 1024 * 1024 + 1) }, now.toISOString())).toThrow()
  })
  it('refuses wrong-chain, stale and changing RPC heads', async () => {
    const wrong = fixture()
    vi.mocked(wrong.rpc.getChainId).mockResolvedValue(97)
    expect(await inspectCommerceBundle(wrong.bundle(), wrong.rpc, wrong.inspectTx, { now })).toMatchObject({ state: 'FAILED', reason: 'wrong_rpc_chain' })
    expect(wrong.inspectTx).not.toHaveBeenCalled()
    const stale = fixture()
    vi.mocked(stale.rpc.getBlock).mockResolvedValue({ number: 200n, hash: blockHash, timestamp: seconds - 121n } as Awaited<ReturnType<PublicClient['getBlock']>>)
    expect((await inspectCommerceBundle(stale.bundle(), stale.rpc, stale.inspectTx, { now })).state).toBe('UNAVAILABLE')
    const reorg = fixture()
    vi.mocked(reorg.rpc.getBlock).mockResolvedValueOnce({ number: 200n, hash: blockHash, timestamp: seconds } as Awaited<ReturnType<PublicClient['getBlock']>>).mockResolvedValueOnce({ number: 200n, hash: '0x' + 'b'.repeat(64), timestamp: seconds } as Awaited<ReturnType<PublicClient['getBlock']>>)
    expect(await inspectCommerceBundle(reorg.bundle(), reorg.rpc, reorg.inspectTx, { now })).toMatchObject({ state: 'FAILED', reason: 'head_changed_during_state_reads' })
  })
  it('binds preserved selection commitments without pretending to replay a private signature', () => {
    const f = fixture()
    const selection = { version: 1, status: 'PRESERVED', reason: null, agentId: f.source.intent.agent_id, serviceId: 123, quoteId: 1, quoteHash: blockHash, quoteHashVersion: 1, quoteHashAlgorithm: 'Keccak-256/JSON.stringify(provider-envelope)', signatureEvidence: 'provider_signed', endpointSha256: blockHash, provider, token: token.address, chainId: 56, amountRaw: '100' }
    const b = buildCommerceBundle({ ...f.source, selectionCommitments: selection }, now.toISOString())
    expect(b.payload.bindings).toMatchObject({ serviceId: 123, quoteHash: blockHash, quoteMode: 'provider_signed', serviceBinding: 'PRESERVED_SELECTION_NOT_HISTORICAL_OWNER_PROOF' })
    expect(inspectCommerceContent(b)).toMatchObject({ integrity: 'MATCH', signatureVerification: 'UNAVAILABLE_NO_PRIVATE_QUOTE_EXPORT' })
    expect(() => buildCommerceBundle({ ...f.source, selectionCommitments: { ...selection, provider: buyer } }, now.toISOString())).toThrow()
    const partial = buildCommerceBundle({ ...f.source, selectionCommitments: { ...selection, status: 'PARTIAL', quoteHash: null, signatureEvidence: 'unknown', endpointSha256: null, reason: 'snapshot_quote_missing' } }, now.toISOString())
    expect(partial.payload.bindings).toMatchObject({ serviceId: 123, quoteHash: null, quoteHashVersion: null, quoteMode: 'unknown', quoteBinding: 'UNAVAILABLE_ORIGINAL_QUOTE_HASH_NOT_PRESERVED' })
  })
})
describe('delivery commitment scope', () => {
  it('checks SDK canonical Keccak separately from raw SHA256 and exact subject, rejects changed content', () => {
    const f = fixture(), bytes = Buffer.from(JSON.stringify(f.manifest))
    const expected = DeliverableManifest.fromDict(f.manifest).manifestHash()
    expect(inspectDeliverable(bytes, expected)).toMatchObject({ state: 'VERIFIABLE', algorithm: 'bnbagent-sdk-0.6.0-deliverable-manifest/Keccak-256' })
    const subject = { chainId: 97, jobId: '1', contracts: n }
    expect(inspectDeliverable(bytes, expected, subject).state).toBe('FAILED')
    f.manifest.response.content.answer = 'altered'
    expect(inspectDeliverable(Buffer.from(JSON.stringify(f.manifest)), expected).state).toBe('FAILED')
    for (const obj of [null, [], {}, { ...f.manifest, contracts: null }, { ...f.manifest, response: [] }]) expect(inspectDeliverable(Buffer.from(JSON.stringify(obj)), expected).state).toBe('UNAVAILABLE')
  })
})
