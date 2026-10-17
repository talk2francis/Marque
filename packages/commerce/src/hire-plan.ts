import { z } from 'zod'
import { encodeFunctionData, getAddress, zeroAddress, keccak256, toBytes } from 'viem'
import { network, assetAt, formatAmount } from './config.js'
import { createJobCall } from './calls.js'
import { descriptionHash, sanitizeForClaim, canonicalJson, MAX_DESCRIPTION_BYTES } from './description.js'

const address = z.string().regex(/^0x[\da-fA-F]{40}$/).refine(s => s.toLowerCase() !== zeroAddress)
const digest = z.string().regex(/^0x[\da-fA-F]{64}$/)
const raw = z.string().regex(/^(0|[1-9]\d{0,77})$/)
const chain = z.union([z.literal(56), z.literal(97)])
const id = z.number().int().positive().max(2_147_483_647)
const token = z.object({ address, symbol: z.string().max(20), decimals: z.number().int().min(0).max(255), isDefault: z.boolean() })
export const planQuoteSchema = z.object({
  quoteId: id, quoteHash: digest, quoteHashVersion: z.literal(1), agentId: z.string().max(200), serviceId: id,
  chainId: chain, provider: address, price: raw, token,
  signed: z.boolean(), sourceClaimVersion: z.literal(1), signatureEvidence: z.enum(['provider_signed', 'identity_matched_unsigned']),
  expiresAt: z.number().int().positive().safe(), providerMatchesRegistry: z.literal(true),
  registryEvidence: z.object({ version: z.literal(1), chainId: chain, blockNumber: raw, observedAt: z.string().datetime() }),
})
export const planIntentSchema = z.object({
  intentId: z.string().uuid(), quoteId: id, quoteHash: digest.nullable(), quoteHashVersion: z.literal(1),
  wallet: address, agentId: z.string().max(200), serviceId: id, chainId: chain,
  agentName: z.string().max(300), provider: address, price: raw, token,
  expiredAt: raw, refundAfter: z.string().datetime(), disputeWindowSeconds: z.number().int().nonnegative().safe(),
  description: z.string().max(MAX_DESCRIPTION_BYTES), descriptionHash: digest,
  contracts: z.object({ commerce: address, router: address, policy: address }),
  createJob: z.object({ to: address, functionName: z.enum(['createJob', 'createJobWithToken']), args: z.array(z.string().max(MAX_DESCRIPTION_BYTES)).min(5).max(6) }),
})
/** Independently selected/reviewed terms, not derived blindly from the same response. */
export const expectedSelectionSchema = z.object({
  wallet: address, chainId: chain, agentId: z.string().max(200), serviceId: id,
  provider: address, quoteHash: digest, amountRaw: raw, tokenAddress: address,
  tokenDecimals: z.number().int().min(0).max(255), descriptionHash: digest,
  task: z.string().min(3).max(1200),
}).strict()
export const hirePlanInputSchema = z.object({ quote: planQuoteSchema, intent: planIntentSchema, expected: expectedSelectionSchema }).strict()
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Pure unsigned plan. It cannot query state, sign, spend, grant authority or consume an intent. */
export function buildHirePlan(input: unknown, nowMs = Date.now()) {
  const fail = (reason: string) => ({ ok: false as const, reason })
  try {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return fail('invalid_clock')
    const parsed = hirePlanInputSchema.safeParse(input)
    if (!parsed.success) return fail('invalid_input')
    const { quote: q, intent: i, expected: e } = parsed.data
    const now = Math.floor(nowMs / 1000)
    if (q.chainId !== i.chainId || q.chainId !== e.chainId) return fail('wrong_chain')
    const n = network(q.chainId)
    const key = /^(56|97):(0x[\da-fA-F]{40}):(0|[1-9]\d{0,77})$/.exec(q.agentId)
    if (!key || q.registryEvidence.chainId !== Number(key[1]) || !same(key[2]!, network(q.registryEvidence.chainId).identityRegistry) || BigInt(key[3]!) >= 2n ** 256n) return fail('noncanonical_agent')
    if (!same(q.agentId, i.agentId) || !same(q.agentId, e.agentId) || q.serviceId !== i.serviceId || q.serviceId !== e.serviceId) return fail('wrong_selected_service')
    if (!same(i.wallet, e.wallet)) return fail('wrong_buyer')
    if (!same(q.provider, i.provider) || !same(q.provider, e.provider)) return fail('wrong_provider')
    if (q.quoteId !== i.quoteId || !i.quoteHash || !same(q.quoteHash, i.quoteHash) || !same(q.quoteHash, e.quoteHash)) return fail('wrong_quote')
    if ((q.signed && q.signatureEvidence !== 'provider_signed') || (!q.signed && q.signatureEvidence !== 'identity_matched_unsigned')) return fail('quote_mode_conflict')
    if (q.expiresAt <= now + 20) return fail('quote_expired_or_too_close')
    if (q.expiresAt > now + 900) return fail('unsupported_quote_lifetime')
    const measured = Date.parse(q.registryEvidence.observedAt)
    if (!Number.isFinite(measured) || measured > nowMs + 30_000) return fail('invalid_registry_observation')
    const asset = assetAt(q.chainId, q.token.address)
    if (!asset || !same(q.token.address, e.tokenAddress) || !same(q.token.address, i.token.address) || q.token.decimals !== asset.decimals || i.token.decimals !== asset.decimals || e.tokenDecimals !== asset.decimals || q.token.symbol !== asset.symbol || i.token.symbol !== asset.symbol || q.token.isDefault !== asset.isDefault || i.token.isDefault !== asset.isDefault) return fail('wrong_payment_asset')
    const amount = BigInt(q.price)
    if (amount <= 0n || amount >= 1n << 128n || q.price !== i.price || q.price !== e.amountRaw) return fail('wrong_or_unbounded_amount')
    if (!same(i.contracts.commerce, n.commerce) || !same(i.contracts.router, n.router) || !same(i.contracts.policy, n.policy)) return fail('wrong_contracts')
    const expiry = BigInt(i.expiredAt)
    if (expiry <= BigInt(now) || expiry > 8_640_000_000_000n || Date.parse(i.refundAfter) !== Number(expiry) * 1000) return fail('invalid_job_expiry')
    if (new TextEncoder().encode(i.description).byteLength > MAX_DESCRIPTION_BYTES || !same(descriptionHash(i.description), i.descriptionHash) || !same(i.descriptionHash, e.descriptionHash)) return fail('wrong_task_commitment')
    const description = z.object({ version: z.literal(1), task: z.string(), price: raw, currency: address, chain_id: chain, verifying_contract: address, provider: address.optional(), marque_intent: z.string().optional(), client_ref: z.string().optional(), provider_sig: z.string().regex(/^0x[\da-fA-F]+$/).optional(), negotiation_hash: digest.optional(), negotiated_at: z.number().int().positive().safe().optional(), quote_expires_at: z.number().int().positive().safe().optional() }).passthrough().safeParse(JSON.parse(i.description))
    if (!description.success) return fail('invalid_task_description')
    const d = description.data
    if (d.task !== sanitizeForClaim(e.task)) return fail('wrong_selected_task')
    if (d.price !== q.price || !same(d.currency, asset.address) || d.chain_id !== q.chainId || !same(d.verifying_contract, n.commerce)) return fail('description_money_or_domain_mismatch')
    if (q.signed && (!d.provider_sig || !d.negotiation_hash || !d.negotiated_at || d.quote_expires_at !== q.expiresAt || d.quote_expires_at - d.negotiated_at > 900 || d.quote_expires_at <= d.negotiated_at)) return fail('signed_description_evidence_mismatch')
    if (q.signed) {
      const { provider_sig, negotiation_hash, ...content } = d
      if (!/^0x[\da-fA-F]{128}([\da-fA-F]{2})?$/.test(provider_sig!) || !same(keccak256(toBytes(canonicalJson(content))), negotiation_hash!)) return fail('signed_description_commitment_mismatch')
    }
    if (!q.signed && (!d.provider || !same(d.provider, q.provider) || d.marque_intent !== i.intentId || d.client_ref !== 'marque.trade' || d.provider_sig || d.negotiation_hash)) return fail('unsigned_description_binding_mismatch')
    const priceLabel = `${formatAmount(amount, asset.decimals)} ${asset.symbol}`
    const call = createJobCall({ chainId: q.chainId, provider: getAddress(q.provider), token: asset, price: amount, priceLabel, agentName: i.agentName, expiredAt: expiry, description: i.description })
    if (!same(i.createJob.to, call.to) || i.createJob.functionName !== call.functionName || JSON.stringify(i.createJob.args) !== JSON.stringify(call.args.map(String))) return fail('intent_call_substitution')
    const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args })
    return {
      ok: true as const,
      plan: {
        schema: 'marque.hire-plan.v1' as const, version: 1 as const, state: 'UNSIGNED' as const,
        generatedAt: new Date(nowMs).toISOString(), intentId: i.intentId,
        idempotencyKey: `intent:${i.intentId}:${i.wallet.toLowerCase()}:${q.quoteHash.toLowerCase()}`,
        selection: { agentId: q.agentId, identityChainId: q.registryEvidence.chainId, serviceId: q.serviceId, quoteId: q.quoteId, quoteHash: q.quoteHash, quoteHashVersion: 1 as const, quoteMode: q.signatureEvidence, provider: getAddress(q.provider) },
        chainId: q.chainId, buyer: getAddress(i.wallet), token: { ...asset }, amountRaw: q.price, amountLabel: priceLabel,
        quoteExpiresAt: new Date(q.expiresAt * 1000).toISOString(), quoteExpiresAtSeconds: String(q.expiresAt),
        jobExpiresAt: i.refundAfter, jobExpiresAtSeconds: i.expiredAt, disputeWindowSeconds: i.disputeWindowSeconds,
        descriptionHash: i.descriptionHash,
        call: { chainId: call.chainId, from: getAddress(i.wallet), to: call.to, functionName: i.createJob.functionName, args: call.args.map(String), data, valueRaw: '0' },
        deferred: [
          { step: 'registerJob', to: n.router, functionName: 'registerJob', requires: 'CONFIRMED_JOB_ID' },
          { step: 'setBudget', to: n.commerce, functionName: 'setBudget', requires: 'CONFIRMED_JOB_ID' },
          { step: 'approve', to: asset.address, functionName: 'approve', spender: n.commerce, exactAmountRaw: q.price, requires: 'CONFIRMED_JOB_ID_AND_ALLOWANCE_CHECK' },
          { step: 'fund', to: n.commerce, functionName: 'fund', exactAmountRaw: q.price, requires: 'CONFIRMED_JOB_ID_AND_SETUP_RECOVERY_CHECK' },
        ],
        simulation: { state: 'NOT_RUN' as const, reason: 'Caller must simulate with its actual chain, account, balance and current contract state.' },
        signing: 'USER_WALLET_REQUIRED' as const,
        quoteSignatureReplay: 'NOT_PERFORMED_SERVER_REPORTED_MODE' as const,
        currentRegistryAndAssetSupport: 'NOT_REPLAYED_RECHECK_BEFORE_SIGNING' as const,
        replayProtection: 'CHECK_EXISTING_INTENT_BINDING_BEFORE_SUBMISSION' as const,
        limits: ['A valid unsigned call is not signing permission or a successful simulation.', 'Do not batch createJob with funding: the created job ID must be independently confirmed first.', 'Never resend createJob blindly after an interrupted submission; recover and bind the original transaction.'],
      },
    }
  } catch { return fail('invalid_plan_terms') }
}
export type HirePlan = Extract<ReturnType<typeof buildHirePlan>, { ok: true }>['plan']
