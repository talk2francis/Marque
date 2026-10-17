import { createHash } from 'node:crypto'
import { decodeEventLog, erc20Abi, zeroAddress, type Hex, type PublicClient, type TransactionReceipt } from 'viem'
import { z } from 'zod'
import { boundedJson } from '@marque/probe'
import { DeliverableManifest } from '@bnbagent/sdk/erc8183'
import { descriptionHash } from './description.js'
import { network, assetAt } from './config.js'
import { agenticCommerceAbi, evaluatorRouterAbi, optimisticPolicyAbi } from './generated.js'
import { projectJob, timeline, type JobEvent, type JobEventName } from './state.js'
import { digest, address, uint, sourceSchema, bundleSchema, inspectCommerceContent } from './portable-job.js'
export { buildCommerceBundle, inspectCommerceContent } from './portable-job.js'
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

type State = 'VERIFIABLE' | 'UNAVAILABLE' | 'PENDING' | 'FAILED'
type Check = { state: State; reason: string }
/** Compose with execution.inspectTransaction; dependency direction stays unchanged. */
export type InspectCommerceTransaction = (ref: { chainId: 56 | 97; txHash: Hex; blockNumber: string }) => Promise<Check & { receipt?: TransactionReceipt; confirmations?: string }>
const unavailable = (reason: string): Check => ({ state: 'UNAVAILABLE', reason })
const failed = (reason: string): Check => ({ state: 'FAILED', reason })
const verified = (reason: string): Check => ({ state: 'VERIFIABLE', reason })
const routerNames = new Set(['JobRegistered', 'JobSettled', 'JobFinalised'])
const policyNames = new Set(['Disputed'])
const knownNames = new Set(['JobCreated', 'JobRegistered', 'BudgetSet', 'JobPaymentTokenBound', 'JobFunded', 'JobSubmitted', 'Disputed', 'JobSettled', 'JobFinalised', 'JobCompleted', 'PaymentReleased', 'JobRejected', 'JobExpired', 'Refunded'])

/** Public chain reads only. Every asserted indexed event must match a confirmed log. */
export async function inspectCommerceBundle(input: unknown, rpc: PublicClient, inspectTx: InspectCommerceTransaction, options: { now?: Date; artifactBytes?: Uint8Array } = {}) {
  const content = inspectCommerceContent(input)
  if (content.integrity !== 'MATCH') return content
  const b = bundleSchema.parse(input)
  const s = sourceSchema.parse(b.payload.source)
  const n = network(s.chainId)
  const now = options.now ?? new Date()
  const transactions = new Map<string, TransactionReceipt>()
  const actual: JobEvent[] = []
  try {
    const [chain, head] = await Promise.all([rpc.getChainId(), rpc.getBlock({ blockTag: 'latest' })])
    if (chain !== s.chainId) return failed('wrong_rpc_chain')
    const age = now.getTime() / 1000 - Number(head.timestamp)
    if (!Number.isFinite(age) || age > 120 || age < -30) return unavailable('stale_rpc_head')
    if (!s.provider || !s.client || !s.amount || !s.token?.address) return unavailable('missing_exact_counterparty_asset_or_amount')
    if (new Set(b.payload.references.map(r => r.txHash.toLowerCase())).size > 16 || !b.payload.references.length) return unavailable('missing_or_too_many_transaction_references')
    const refs = new Set<string>()
    for (const ref of b.payload.references) {
      const key = `${ref.txHash.toLowerCase()}:${ref.logIndex}`
      if (refs.has(key) || !knownNames.has(ref.name)) return failed('duplicate_or_unsupported_event_reference')
      refs.add(key)
      let receipt = transactions.get(ref.txHash.toLowerCase())
      if (!receipt) {
        const checked = await inspectTx({ chainId: s.chainId, txHash: ref.txHash as Hex, blockNumber: ref.blockNumber })
        if (checked.state !== 'VERIFIABLE') return { state: checked.state, reason: checked.reason }
        if (!checked.receipt || !checked.confirmations || !/^\d+$/.test(checked.confirmations) || BigInt(checked.confirmations) < 3n) return unavailable('transaction_checker_did_not_supply_confirmed_receipt')
        receipt = checked.receipt
        transactions.set(ref.txHash.toLowerCase(), receipt)
      }
      if (!same(receipt.transactionHash, ref.txHash) || receipt.status !== 'success' || receipt.blockNumber.toString() !== ref.blockNumber) return failed('event_transaction_or_block_mismatch')
      const expectedContract = routerNames.has(ref.name) ? n.router : policyNames.has(ref.name) ? n.policy : n.commerce
      if (!same(ref.contract, expectedContract)) return failed('wrong_event_contract')
      const log = receipt.logs.find(l => l.logIndex === ref.logIndex && !l.removed && same(l.address, expectedContract) && l.blockHash === receipt!.blockHash && l.transactionHash === receipt!.transactionHash)
      if (!log) return failed('referenced_event_missing')
      const abi = routerNames.has(ref.name) ? evaluatorRouterAbi : policyNames.has(ref.name) ? optimisticPolicyAbi : agenticCommerceAbi
      let decoded: { eventName: string; args: Record<string, unknown> }
      try { decoded = decodeEventLog({ abi, data: log.data, topics: log.topics, strict: true }) as unknown as typeof decoded }
      catch { return failed('event_signature_or_encoding_mismatch') }
      if (decoded.eventName !== ref.name || String(decoded.args['jobId']) !== s.jobId) return failed('wrong_event_name_or_job')
      const recorded = s.events.find(e => e.tx.toLowerCase() === ref.txHash.toLowerCase() && e.logIndex === ref.logIndex)!
      for (const [key, value] of Object.entries(decoded.args)) {
        if (!Object.hasOwn(recorded.args, key) || String(recorded.args[key]).toLowerCase() !== String(value).toLowerCase()) return failed('indexed_event_args_disagree_with_chain')
      }
      const number = Number(receipt.blockNumber)
      if (!Number.isSafeInteger(number)) return unavailable('block_exceeds_existing_state_projector_precision')
      // Router summary is checked above; kernel events drive the existing state projector.
      if (ref.name !== 'JobFinalised') actual.push({ name: ref.name as JobEventName, blockNumber: number, logIndex: ref.logIndex, txHash: ref.txHash, blockTime: null, args: decoded.args })
    }
    const id = BigInt(s.jobId)
    const [job, boundToken, policy] = await Promise.all([
      rpc.readContract({ address: n.commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [id], blockNumber: head.number }),
      rpc.readContract({ address: n.commerce, abi: agenticCommerceAbi, functionName: 'jobPaymentToken', args: [id], blockNumber: head.number }),
      rpc.readContract({ address: n.router, abi: evaluatorRouterAbi, functionName: 'jobPolicy', args: [id], blockNumber: head.number }),
    ])
    if (job.id !== id || !same(job.provider, s.provider) || !same(job.client, s.client) || job.budget.toString() !== s.amount || (s.evaluator && !same(job.evaluator, s.evaluator))) return failed('onchain_job_terms_mismatch')
    const token = boundToken === zeroAddress ? await rpc.readContract({ address: n.commerce, abi: agenticCommerceAbi, functionName: 'paymentToken', blockNumber: head.number }) : boundToken
    if (!same(token, s.token.address)) return failed('onchain_payment_asset_mismatch')
    const decimals = await rpc.readContract({ address: token, abi: erc20Abi, functionName: 'decimals', blockNumber: head.number })
    if (s.token.decimals !== null && s.token.decimals !== decimals) return failed('onchain_token_decimal_mismatch')
    const catalog = assetAt(s.chainId, token)
    if (catalog && decimals !== catalog.decimals) return failed('token_catalog_decimal_mismatch')
    if (s.intent?.description_hash && !same(descriptionHash(job.description), s.intent.description_hash)) return failed('onchain_task_description_mismatch')
    if (s.deliverable.hash && !same(s.deliverable.hash, job.deliverable)) return failed('onchain_deliverable_commitment_mismatch')
    const p = projectJob(actual)
    if (p.anomalies.length) return { ...unavailable('incomplete_or_inconsistent_event_history'), anomalies: p.anomalies }
    if (p.provider && !same(p.provider, s.provider) || p.client && !same(p.client, s.client)) return failed('created_job_counterparty_mismatch')
    const created = actual.find(e => e.name === 'JobCreated')
    if (created && (String(created.args['expiredAt']) !== job.expiredAt.toString() || !same(String(created.args['evaluator']), job.evaluator) || !same(String(created.args['hook']), job.hook))) return failed('immutable_created_job_terms_disagree_with_current_chain')
    if ((p.fundedRaw !== null && p.fundedRaw !== s.amount) || (p.budgetRaw !== null && p.budgetRaw !== s.amount)) return failed('funding_or_budget_amount_mismatch')
    const transfer = (event: 'PaymentReleased' | 'Refunded', recipient: string, raw: string | null): Check => {
      const e = actual.find(x => x.name === event)
      if (!e || raw === null) return unavailable(event === 'PaymentReleased' ? 'no_confirmed_payment_release_reference' : 'no_confirmed_refund_reference')
      const receipt = transactions.get(e.txHash.toLowerCase())!
      const sibling = receipt.logs.filter(l => {
        if (l.removed || !same(l.address, n.commerce) || l.blockHash !== receipt.blockHash || l.transactionHash !== receipt.transactionHash) return false
        try { const d = decodeEventLog({ abi: agenticCommerceAbi, data: l.data, topics: l.topics, strict: true }); return d.eventName === event && same(String((d.args as Record<string, unknown>)[event === 'PaymentReleased' ? 'provider' : 'client']), recipient) } catch { return false }
      })
      if (sibling.length !== 1) return unavailable('ambiguous_batched_payment')
      const amounts = receipt.logs.flatMap(l => {
        if (l.removed || !same(l.address, token) || l.blockHash !== receipt.blockHash || l.transactionHash !== receipt.transactionHash) return []
        try { const d = decodeEventLog({ abi: erc20Abi, data: l.data, topics: l.topics, strict: true }); return d.eventName === 'Transfer' && same(d.args.from, n.commerce) && same(d.args.to, recipient) ? [d.args.value] : [] } catch { return [] }
      })
      return amounts.length === 1 && amounts[0]!.toString() === raw ? verified('confirmed_job_event_and_exact_erc20_transfer') : unavailable('transfer_missing_or_ambiguous')
    }
    const released = actual.find(e => e.name === 'PaymentReleased')
    if (released && (!same(String(released.args['provider']), s.provider) || String(released.args['amount']) !== s.amount)) return failed('payment_recipient_or_amount_mismatch')
    const refunded = actual.find(e => e.name === 'Refunded')
    if (refunded && (!same(String(refunded.args['client']), s.client) || String(refunded.args['amount']) !== s.amount)) return failed('refund_recipient_or_amount_mismatch')
    let artifact: Check & { rawSha256?: string; algorithm?: string } = unavailable('artifact_bytes_not_supplied_or_removed_commitment_only')
    if (options.artifactBytes) artifact = inspectDeliverable(options.artifactBytes, job.deliverable, { chainId: s.chainId, jobId: s.jobId, contracts: n })
    let approval: Check = unavailable('historical_fee_approval_reference_not_preserved')
    for (const receipt of transactions.values()) for (const log of receipt.logs) {
      if (!same(log.address, token) || log.removed || log.blockHash !== receipt.blockHash || log.transactionHash !== receipt.transactionHash) continue
      try { const d = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, strict: true }); if (d.eventName === 'Approval' && same(d.args.owner, s.client) && same(d.args.spender, n.commerce) && d.args.value.toString() === s.amount) approval = verified('historical_exact_fee_approval_event_not_current_allowance_or_action_authority') } catch { /* Other log. */ }
    }
    const registered = actual.find(e => e.name === 'JobRegistered')
    const settlement = actual.find(e => e.name === 'JobSettled')
    if (settlement && ((p.state === 'PAID' && String(settlement.args['verdict']) !== '1') || (p.state === 'REFUNDED' && String(settlement.args['verdict']) !== '2'))) return failed('settlement_verdict_disagrees_with_terminal_outcome')
    const historicalPolicy = registered && same(String(registered.args['policy']), n.policy) && same(String(registered.args['client']), s.client)
    const policyProof = historicalPolicy ? verified('confirmed_historical_registration_policy_link') : unavailable('historical_policy_link_not_proven')
    const currentPolicyLink = same(policy, n.policy) ? verified('current_job_policy_link_matches_pinned_policy') : unavailable(policy === zeroAddress ? 'current_policy_link_empty_historical_events_remain_valid' : 'current_policy_link_differs')
    const [window, disputed] = same(policy, n.policy) ? await Promise.all([
      rpc.readContract({ address: n.policy, abi: optimisticPolicyAbi, functionName: 'disputeWindow', blockNumber: head.number }),
      rpc.readContract({ address: n.policy, abi: optimisticPolicyAbi, functionName: 'disputed', args: [id], blockNumber: head.number }),
    ]) : [null, null]
    const timing = window !== null && Number.isSafeInteger(Number(window)) && Number.isSafeInteger(Number(job.expiredAt)) && Number.isSafeInteger(Number(job.submittedAt)) ? timeline(p, job.submittedAt === 0n ? null : Number(job.submittedAt), Number(window), Number(head.timestamp)) : null
    // A second header read detects a changed observed tip during current-state reads.
    const finalHeader = await rpc.getBlock({ blockNumber: head.number })
    if (finalHeader.hash !== head.hash) return failed('head_changed_during_state_reads')
    return {
      state: artifact.state === 'FAILED' ? 'FAILED' : 'VERIFIABLE', reason: artifact.state === 'FAILED' ? 'artifact_digest_or_subject_mismatch' : 'listed_transaction_events_and_current_job_terms_checked', integrity: 'MATCH',
      chainId: s.chainId, observedAt: now.toISOString(), headBlock: head.number.toString(), headHash: head.hash,
      eventProjection: p.state, onchainStatus: job.status, bundleObservedAt: b.payload.observedAt, sourceComputedAt: b.payload.sourceComputedAt,
      asset: { address: token, decimals, amountRaw: job.budget.toString(), source: 'pinned_block_erc20_decimals_and_job_budget' },
      delivery: actual.some(e => e.name === 'JobSubmitted') ? verified('confirmed_submission_is_not_completion_or_payment') : unavailable('no_submission_reference'),
      completion: actual.some(e => e.name === 'JobCompleted') ? verified('confirmed_completion_event_only') : unavailable('no_completion_reference'),
      payment: transfer('PaymentReleased', s.provider, p.paidRaw), refund: transfer('Refunded', s.client, p.refundedRaw),
      artifact, feeApproval: approval, policy: policyProof, currentPolicyLink: { ...currentPolicyLink, address: policy }, currentDisputed: disputed, timeline: timing,
      settlement: settlement ? { txHash: settlement.txHash, verdict: String(settlement.args['verdict']), policy: String(settlement.args['policy']), reason: String(settlement.args['reason']) } : null,
      expiredWithoutDelivery: job.status === 1 && head.timestamp >= job.expiredAt,
      assetActionAuthority: 'UNAVAILABLE_NOT_PROVEN_BY_FEE_APPROVAL', quality: 'NOT_CHECKED_USE_MCS_BUNDLE',
      quoteSignature: 'NOT_REPLAYED_NO_RAW_QUOTE_EXPORT', exactService: s.selectionCommitments?.status !== 'UNAVAILABLE' && s.selectionCommitments?.serviceId ? 'PRESERVED_MARKETPLACE_SELECTION_NOT_HISTORICAL_OWNER_PROOF' : 'UNAVAILABLE_NOT_PRESERVED_IN_PUBLIC_PROJECTION',
      issuerAuthentication: 'NOT_PROVIDED', humanAndFundingIndependence: 'UNKNOWN',
      limits: ['RPC consistency is not an independent consensus or verified source-build attestation.', 'Current chain state may have advanced beyond the listed historical events.', 'A fee allowance is not an asset action charter; indexed identity is not historical owner proof.', 'Referenced asset URLs are never fetched by this inspector.'],
    }
  } catch { return unavailable('rpc_or_protocol_metadata_unavailable') }
}

/** No HTTP, storage, task invocation or payment. Raw bytes and SDK semantic hashes differ. */
export function inspectDeliverable(bytes: Uint8Array, expected: string, subject?: { chainId: number; jobId: string; contracts: { commerce: string; router: string; policy: string } }): Check & { rawSha256?: string; algorithm?: string } {
  if (bytes.byteLength > 2 * 1024 * 1024 || !digest.safeParse(expected).success) return failed('artifact_size_or_commitment_invalid')
  const rawSha256 = `0x${createHash('sha256').update(bytes).digest('hex')}`
  try {
    const obj: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (boundedJson(obj) !== 'OK' || !obj || typeof obj !== 'object' || Array.isArray(obj)) return { ...unavailable('invalid_sdk_manifest_metadata'), rawSha256 }
    const shape = z.object({ version: z.literal(1), job_id: z.union([uint, z.number().int().nonnegative().safe()]), chain_id: z.union([z.literal(56), z.literal(97)]), contracts: z.object({ commerce: address, router: address, policy: address }).passthrough(), response: z.object({ content: z.unknown(), content_type: z.string().optional() }).passthrough(), metadata: z.record(z.unknown()).optional() }).passthrough().safeParse(obj)
    if (!shape.success || !Object.hasOwn(shape.data.response, 'content')) return { ...unavailable('invalid_sdk_manifest_metadata'), rawSha256 }
    if (subject && (String(shape.data.job_id) !== subject.jobId || shape.data.chain_id !== subject.chainId || !same(shape.data.contracts.commerce, subject.contracts.commerce) || !same(shape.data.contracts.router, subject.contracts.router) || !same(shape.data.contracts.policy, subject.contracts.policy))) return { ...failed('artifact_job_chain_or_contract_substitution'), rawSha256 }
    const actual = DeliverableManifest.fromDict(obj as Record<string, unknown>).manifestHash()
    return { ...(same(actual, expected) ? verified('sdk_manifest_digest_matches_submission_commitment') : failed('deliverable_digest_mismatch')), rawSha256, algorithm: 'bnbagent-sdk-0.6.0-deliverable-manifest/Keccak-256' }
  } catch { return { ...unavailable('unsupported_or_invalid_manifest_raw_commitment_only'), rawSha256 } }
}
