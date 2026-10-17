import { createHash } from 'node:crypto'
import { decodeEventLog, parseAbi, type Hex } from 'viem'
import { z } from 'zod'
import { boundedJson } from '@marque/probe/bounded-json'
import { canonicalise, type Receipt } from './receipt.js'
import { verifyReceiptIntegrity, RECEIPT_DIGEST_CONTRACT } from './receipt-integrity.js'
import { inspectTransaction, type Inspection, type InspectionRpc } from './chain-inspection.js'

const sha = (v: unknown) => `0x${createHash('sha256').update(canonicalise(v as Receipt), 'utf8').digest('hex')}`
const digest = z.string().regex(/^0x[\da-fA-F]{64}$/)
const address = z.string().regex(/^0x[\da-fA-F]{40}$/)
const block = z.string().regex(/^(0|[1-9]\d{0,29})$/)
const anchorSchema = z.object({ chainId: z.union([z.literal(56), z.literal(97)]).nullable(), contract: address.nullable(), txHash: digest.nullable(), blockNumber: block.nullable(), blockHash: digest.nullable() }).strict()
const schema = z.object({
  schema: z.literal('marque.receipt.bundle.v2'), hash: digest,
  payload: z.object({ version: z.literal(2), receiptHash: digest, receipt: z.unknown(), bindings: z.unknown(), anchor: anchorSchema }).strict(),
}).strict()
const anchorAbi = parseAbi(['event Anchored(address indexed anchorer, bytes32 indexed leaf, uint64 blockTime)'])

/** A wrapper only. Never stamps an old immutable receipt with a newer version. */
export function receiptBindings(receipt: Receipt) {
  return {
    agentId: receipt.commercial.agentId,
    service: receipt.service ?? null,
    taskHash: sha(receipt.task), taskHashAlgorithm: 'marque-sorted-json-v1/SHA-256',
    executionChainId: receipt.execution.chainId,
    quoteHash: null, quoteBinding: 'UNAVAILABLE_NOT_PRESERVED',
    authority: 'RECEIPT_CLAIM_NOT_CHAIN_PROOF',
  }
}

export function buildReceiptBundle(row: { hash: string; body: unknown; anchorTxHash: string | null; anchorBlock: string | null }) {
  if (verifyReceiptIntegrity(row.body, row.hash).status !== 'MATCH') throw new Error('Cannot export an invalid stored receipt')
  const receipt = row.body as Receipt
  const payload = {
    version: 2 as const, receiptHash: row.hash, receipt,
    bindings: receiptBindings(receipt),
    // Historical rows do not preserve these three values. No current config inference.
    anchor: { chainId: null, contract: null, txHash: row.anchorTxHash, blockNumber: row.anchorBlock, blockHash: null },
  }
  const envelope = { schema: 'marque.receipt.bundle.v2' as const, payload }
  return { ...envelope, hash: sha(envelope) }
}

export function inspectReceiptBundle(input: unknown) {
  const fail = (reason: string, state: Inspection['state'] = 'FAILED') => ({ state, reason, integrity: 'UNAVAILABLE' })
  try {
    if (boundedJson(input) !== 'OK') return fail('invalid_or_oversized_json')
    const p = schema.safeParse(input)
    if (!p.success || !Object.hasOwn(p.data.payload, 'receipt') || !Object.hasOwn(p.data.payload, 'bindings')) return fail('missing_metadata_or_unsupported_bundle', 'UNAVAILABLE')
    const { payload } = p.data
    if (sha({ schema: p.data.schema, payload }) !== p.data.hash.toLowerCase()) return fail('bundle_digest_mismatch')
    const integrity = verifyReceiptIntegrity(payload.receipt, payload.receiptHash)
    if (integrity.status !== 'MATCH') return fail('receipt_' + integrity.status.toLowerCase())
    if (sha(payload.bindings) !== sha(receiptBindings(payload.receipt as Receipt))) return fail('receipt_binding_substitution')
    return {
      state: 'VERIFIABLE' as const, reason: 'offline_content_only', integrity: 'MATCH',
      receiptVersion: (payload.receipt as Receipt).version, bundleVersion: 2,
      bundleDigest: { algorithm: 'SHA-256', canonicalization: 'marque-sorted-json-v1', scope: 'schema-and-payload', encoding: 'UTF-8' },
      digest: RECEIPT_DIGEST_CONTRACT, anchor: { state: 'UNAVAILABLE', reason: 'not_checked' },
      payment: { state: 'UNAVAILABLE', reason: 'receipt_claim_is_not_payment_release_proof' },
      quality: { state: 'UNAVAILABLE', reason: 'supply_the_frozen_mcs_bundle_for_separate_replay' },
      authority: { state: 'UNAVAILABLE', reason: 'historical_policy_and_allowance_evidence_not_preserved' },
      issuerAuthentication: 'NOT_PROVIDED', independence: 'UNKNOWN',
    }
  } catch { return fail('invalid_bundle') }
}

/** Supplied RPC and explicit inspector references only; does not fetch artifact URLs. */
export async function inspectReceiptAnchor(input: unknown, rpc: InspectionRpc, options: { now?: Date; chainId?: 56 | 97; contract?: string; minConfirmations?: number } = {}): Promise<Inspection & { referenceSource?: string; anchorer?: string; confirmations?: string }> {
  const offline = inspectReceiptBundle(input)
  if (offline.integrity !== 'MATCH') return { state: offline.state, reason: offline.reason }
  const { payload } = schema.parse(input)
  const original = payload.anchor
  if ((original.chainId && options.chainId && original.chainId !== options.chainId) || (original.contract && options.contract && original.contract.toLowerCase() !== options.contract.toLowerCase())) return { state: 'FAILED', reason: 'inspector_reference_conflicts_with_record' }
  const chainId = original.chainId ?? options.chainId
  const contract = original.contract ?? options.contract
  if (!chainId || !contract || !address.safeParse(contract).success || !original.txHash) return { state: 'UNAVAILABLE', reason: 'anchor_chain_contract_or_transaction_missing' }
  const checked = await inspectTransaction(rpc, { chainId, txHash: original.txHash as Hex, blockNumber: original.blockNumber, blockHash: original.blockHash }, options)
  if (!checked.receipt) return { state: checked.state, reason: checked.reason, confirmations: checked.confirmations }
  const tx = checked.receipt
  if (tx.to?.toLowerCase() !== contract.toLowerCase()) return { state: 'FAILED', reason: 'anchor_contract_mismatch' }
  const header = await rpc.getBlock({ blockNumber: tx.blockNumber }).catch(() => null)
  if (!header || header.hash !== tx.blockHash) return { state: 'UNAVAILABLE', reason: 'anchor_block_changed_or_unavailable' }
  for (const log of tx.logs) {
    if (log.removed || log.address.toLowerCase() !== contract.toLowerCase() || log.transactionHash !== tx.transactionHash || log.blockHash !== tx.blockHash) continue
    try {
      const e = decodeEventLog({ abi: anchorAbi, data: log.data, topics: log.topics, strict: true })
      if (e.eventName === 'Anchored' && e.args.leaf.toLowerCase() === payload.receiptHash.toLowerCase() && e.args.blockTime === header.timestamp) return { state: 'VERIFIABLE', reason: 'matching_confirmed_anchor_event_only', referenceSource: original.chainId && original.contract ? 'BUNDLE_RECORD' : 'INSPECTOR_SUPPLIED_MISSING_METADATA', anchorer: e.args.anchorer, confirmations: checked.confirmations }
    } catch { /* Another event, never evidence for this leaf. */ }
  }
  return { state: 'FAILED', reason: 'matching_anchor_event_absent' }
}
