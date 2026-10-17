import { describe, expect, it, vi } from 'vitest'
import { decodeFunctionData, keccak256, toBytes } from 'viem'
import { buildHirePlan } from './hire-plan'
import { network, type ChainId } from './config'
import { buildPlainDescription, canonicalJson, descriptionHash } from './description'
import { createJobCall } from './calls'
import { agenticCommerceAbi } from './generated'
import outputSchema from '../../../apps/web/public/api/v1/schemas/hire-plan.v1.json'

// Synthetic plan inputs only. No quote is requested, no wallet or network is used.
const now = Date.parse('2026-10-17T00:00:00Z'), seconds = Math.floor(now / 1000)
const provider = '0x1111111111111111111111111111111111111111'
const buyer = '0x2222222222222222222222222222222222222222'
const hash = '0x' + '3'.repeat(64)
function fixture(chainId: ChainId = 56, alternate = false, identityChain: ChainId = chainId) {
  const n = network(chainId), asset = n.assets.find(a => a.isDefault !== alternate)!
  const intentId = '00000000-0000-4000-8000-000000000001', task = 'Synthetic price-only test task, never sent'
  const agentId = `${identityChain}:${network(identityChain).identityRegistry.toLowerCase()}:123`
  const quote = { quoteId: 1, quoteHash: hash, quoteHashVersion: 1, agentId, serviceId: 42, chainId, provider, price: '100', token: asset, signed: false, sourceClaimVersion: 1, signatureEvidence: 'identity_matched_unsigned', expiresAt: seconds + 600, providerMatchesRegistry: true, registryEvidence: { version: 1, chainId: identityChain, blockNumber: '123', observedAt: new Date(now).toISOString() }, quoteAccessToken: 'synthetic-private-token-must-not-be-exported' }
  const description = buildPlainDescription({ accepted: true, provider, price: '100', payment_token: asset.address, chain_id: chainId, verifying_contract: n.commerce }, task, intentId)
  const expiredAt = String(seconds + 7200)
  const call = createJobCall({ chainId, provider, token: asset, price: 100n, priceLabel: 'synthetic display only', agentName: 'Synthetic fixture', expiredAt: BigInt(expiredAt), description })
  const intent = { intentId, quoteId: 1, quoteHash: hash, quoteHashVersion: 1, wallet: buyer, agentId, serviceId: 42, chainId, agentName: 'Synthetic fixture', provider, price: '100', token: asset, expiredAt, refundAfter: new Date(Number(expiredAt) * 1000).toISOString(), disputeWindowSeconds: 3600, description, descriptionHash: descriptionHash(description), contracts: { commerce: n.commerce, router: n.router, policy: n.policy }, createJob: { to: call.to, functionName: call.functionName, args: call.args.map(String) } }
  const expected = { wallet: buyer, chainId, agentId, serviceId: 42, provider, quoteHash: hash, amountRaw: '100', tokenAddress: asset.address, tokenDecimals: asset.decimals, descriptionHash: intent.descriptionHash, task }
  return { quote, intent, expected }
}
describe('pure unsigned hire plan', () => {
  it.each([56, 97] as const)('uses existing call builder and ABI on chain %i without I/O or authority', chainId => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      for (const alternate of [false, true]) {
        const input = fixture(chainId, alternate), res = buildHirePlan(input, now)
        expect(res.ok).toBe(true)
        if (!res.ok) throw Error(res.reason)
        expect(res.plan).toMatchObject({ state: 'UNSIGNED', chainId, amountRaw: '100', call: { valueRaw: '0' }, simulation: { state: 'NOT_RUN' }, signing: 'USER_WALLET_REQUIRED', quoteSignatureReplay: 'NOT_PERFORMED_SERVER_REPORTED_MODE', replayProtection: 'CHECK_EXISTING_INTENT_BINDING_BEFORE_SUBMISSION' })
        const decoded = decodeFunctionData({ abi: agenticCommerceAbi, data: res.plan.call.data })
        expect(decoded.functionName).toBe(input.intent.createJob.functionName)
        const comparable = (v: unknown) => typeof v === 'string' && /^0x[\da-fA-F]{40}$/.test(v) ? v.toLowerCase() : String(v)
        expect(decoded.args?.map(comparable)).toEqual(input.intent.createJob.args.map(comparable))
        expect(res.plan.deferred).toHaveLength(4)
        expect(res.plan.deferred.find(s => s.step === 'approve')).toMatchObject({ exactAmountRaw: '100', spender: network(chainId).commerce })
        expect(res.plan.deferred.every(s => !('data' in s))).toBe(true)
        expect(JSON.stringify(res.plan)).not.toContain(input.quote.quoteAccessToken)
      }
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally { fetchSpy.mockRestore() }
  })
  it('keeps mutations of a returned plan out of the pinned asset catalog and later plans', () => {
    const input = fixture(), result = buildHirePlan(input, now)
    if (!result.ok) throw Error(result.reason)
    const pinned = network(56).assets.find(a => a.address.toLowerCase() === result.plan.token.address.toLowerCase())!
    const before = structuredClone(pinned)
    expect(result.plan.token).not.toBe(pinned)
    result.plan.token.decimals = 0
    result.plan.token.address = buyer
    expect(pinned).toEqual(before)
    expect(buildHirePlan(input, now)).toMatchObject({ ok: true, plan: { token: before } })
  })
  it('keeps the published output contract aligned with every emitted top-level field', () => {
    const result = buildHirePlan(fixture(), now)
    if (!result.ok) throw Error(result.reason)
    expect(Object.keys(result.plan).sort()).toEqual([...outputSchema.required].sort())
    expect(Object.keys(result.plan).sort()).toEqual(Object.keys(outputSchema.properties).sort())
    expect(outputSchema.properties.state.const).toBe(result.plan.state)
    expect(outputSchema.properties.call.properties.functionName.enum).toContain(result.plan.call.functionName)
    expect(outputSchema.properties.simulation.properties.state.const).toBe(result.plan.simulation.state)
  })
  it('keeps registry identity chain separate from action chain', () => {
    const result = buildHirePlan(fixture(97, false, 56), now)
    expect(result).toMatchObject({ ok: true, plan: { chainId: 97, selection: { identityChainId: 56 } } })
  })
  it('is deterministic for a fixed observation and reuses the durable intent idempotency key', () => {
    const input = fixture(), a = buildHirePlan(input, now), b = buildHirePlan(input, now)
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).not.toMatch(/privateKey|mnemonic|walletClient|sendTransaction/)
    input.intent.quoteId++
    expect(buildHirePlan(input, now)).toMatchObject({ ok: false, reason: 'wrong_quote' })
  })
  it.each(['past', 'margin', 'far'])('rejects %s quote expiry and never renews it', kind => {
    const input = fixture()
    input.quote.expiresAt = seconds + (kind === 'past' ? -1 : kind === 'margin' ? 20 : 901)
    const before = input.quote.expiresAt
    expect(buildHirePlan(input, now).ok).toBe(false)
    expect(input.quote.expiresAt).toBe(before)
  })
  it.each(['chain', 'registry', 'agent', 'service', 'provider', 'buyer', 'quoteHash', 'amount', 'token', 'decimals', 'defaultToken', 'contract', 'function', 'args', 'description', 'task', 'mode'])('rejects %s substitution', kind => {
    const input = fixture()
    if (kind === 'chain') input.intent.chainId = 97
    if (kind === 'registry') input.quote.registryEvidence.chainId = 97
    if (kind === 'agent') input.intent.agentId = input.intent.agentId.replace(':123', ':124')
    if (kind === 'service') input.intent.serviceId++
    if (kind === 'provider') input.intent.provider = buyer
    if (kind === 'buyer') input.intent.wallet = provider
    if (kind === 'quoteHash') input.expected.quoteHash = '0x' + '4'.repeat(64)
    if (kind === 'amount') input.expected.amountRaw = '101'
    if (kind === 'token') input.intent.token = { ...input.intent.token, address: buyer }
    if (kind === 'decimals') input.expected.tokenDecimals--
    if (kind === 'defaultToken') input.intent.token = { ...input.intent.token, isDefault: !input.intent.token.isDefault }
    if (kind === 'contract') input.intent.contracts.router = buyer
    if (kind === 'function') input.intent.createJob.functionName = 'fund'
    if (kind === 'args') input.intent.createJob.args[0] = buyer
    if (kind === 'description') input.intent.description += ' '
    if (kind === 'task') input.expected.task = 'A different synthetic task'
    if (kind === 'mode') input.quote.signatureEvidence = 'provider_signed'
    expect(buildHirePlan(input, now).ok).toBe(false)
  })
  it('checks descriptor money and domain independently of self-consistent hashes/call encoding', () => {
    const input = fixture(), desc = JSON.parse(input.intent.description)
    desc.price = '999'
    input.intent.description = canonicalJson(desc)
    input.intent.descriptionHash = descriptionHash(input.intent.description)
    input.expected.descriptionHash = input.intent.descriptionHash
    input.intent.createJob.args[3] = input.intent.description
    expect(buildHirePlan(input, now)).toMatchObject({ ok: false, reason: 'description_money_or_domain_mismatch' })
  })
  it('keeps signed descriptor commitment checks separate from ECDSA/registry replay', () => {
    const input = fixture(), n = network(56)
    const content = { version: 1, task: input.expected.task, terms: { deliverables: 'synthetic', quality_standards: '' }, price: input.quote.price, currency: input.quote.token.address, chain_id: 56, verifying_contract: n.commerce, negotiated_at: seconds, quote_expires_at: input.quote.expiresAt }
    // This is deliberately a synthetic server claim, not a real provider signature.
    const description = canonicalJson({ ...content, negotiation_hash: keccak256(toBytes(canonicalJson(content))), provider_sig: '0x' + '1'.repeat(130) })
    input.quote.signed = true; input.quote.signatureEvidence = 'provider_signed'
    input.intent.description = description; input.intent.descriptionHash = descriptionHash(description); input.expected.descriptionHash = input.intent.descriptionHash; input.intent.createJob.args[3] = description
    expect(buildHirePlan(input, now)).toMatchObject({ ok: true, plan: { quoteSignatureReplay: 'NOT_PERFORMED_SERVER_REPORTED_MODE' } })
    const altered = JSON.parse(description); altered.negotiation_hash = hash
    input.intent.description = canonicalJson(altered); input.intent.descriptionHash = descriptionHash(input.intent.description); input.expected.descriptionHash = input.intent.descriptionHash; input.intent.createJob.args[3] = input.intent.description
    expect(buildHirePlan(input, now)).toMatchObject({ ok: false, reason: 'signed_description_commitment_mismatch' })
  })
  it('refuses unsupported, malformed, oversized, unbounded or expired terms', () => {
    for (const x of [null, {}, { ...fixture(), arbitraryCalldata: '0x' }]) expect(buildHirePlan(x, now).ok).toBe(false)
    const input = fixture(); input.quote.price = (1n << 128n).toString(); input.intent.price = input.quote.price; input.expected.amountRaw = input.quote.price
    expect(buildHirePlan(input, now)).toMatchObject({ ok: false, reason: 'wrong_or_unbounded_amount' })
    expect(buildHirePlan(fixture(), NaN)).toMatchObject({ ok: false, reason: 'invalid_clock' })
    const expired = fixture(); expired.intent.expiredAt = String(seconds - 1)
    expect(buildHirePlan(expired, now)).toMatchObject({ ok: false, reason: 'invalid_job_expiry' })
  })
})
