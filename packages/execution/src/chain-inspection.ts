import type { Hex, TransactionReceipt } from 'viem'

export type InspectionState = 'VERIFIABLE' | 'UNAVAILABLE' | 'PENDING' | 'FAILED'
export interface Inspection { state: InspectionState; reason: string }
/** Supplied by the inspector. No wallet, database, key or write method. */
export interface InspectionRpc {
  getChainId(): Promise<number>
  getBlock(input: { blockNumber?: bigint; blockTag?: 'latest' }): Promise<{ number: bigint | null; hash: Hex | null; timestamp: bigint }>
  getTransactionReceipt(input: { hash: Hex }): Promise<TransactionReceipt>
}
export interface TransactionReference {
  chainId: 56 | 97
  txHash: Hex
  blockNumber?: string | null
  blockHash?: string | null
}

/** Checks current RPC consistency, not an independent consensus or source attestation. */
export async function inspectTransaction(rpc: InspectionRpc, ref: TransactionReference, opts: { now?: Date; minConfirmations?: number } = {}): Promise<Inspection & { receipt?: TransactionReceipt; confirmations?: string }> {
  const min = opts.minConfirmations ?? 3
  if (!Number.isSafeInteger(min) || min < 3 || min > 10_000 || !/^0x[\da-fA-F]{64}$/.test(ref.txHash) || ![56, 97].includes(ref.chainId)) return { state: 'FAILED', reason: 'invalid_transaction_reference_or_confirmation_policy' }
  try {
    const [chain, head] = await Promise.all([rpc.getChainId(), rpc.getBlock({ blockTag: 'latest' })])
    if (chain !== ref.chainId) return { state: 'FAILED', reason: 'wrong_rpc_chain' }
    const age = (opts.now ?? new Date()).getTime() / 1000 - Number(head.timestamp)
    if (!Number.isFinite(age) || age > 120 || age < -30 || head.number === null || !head.hash) return { state: 'UNAVAILABLE', reason: 'stale_or_invalid_rpc_head' }
    let receipt: TransactionReceipt
    try { receipt = await rpc.getTransactionReceipt({ hash: ref.txHash }) }
    catch (e) {
      // A missing receipt is not a reverted transaction or an expired job.
      const missing = e instanceof Error && /notfound|not found/i.test(e.name + ' ' + e.message)
      const historical = ref.blockNumber !== undefined && ref.blockNumber !== null && /^\d+$/.test(ref.blockNumber) && BigInt(ref.blockNumber) + BigInt(min) <= head.number
      return { state: missing && !historical ? 'PENDING' : 'UNAVAILABLE', reason: historical ? 'historical_receipt_unavailable' : 'transaction_receipt_unavailable' }
    }
    if (receipt.transactionHash.toLowerCase() !== ref.txHash.toLowerCase() || receipt.status !== 'success') return { state: 'FAILED', reason: 'transaction_hash_or_status_mismatch' }
    if ((ref.blockNumber !== undefined && ref.blockNumber !== null && receipt.blockNumber.toString() !== ref.blockNumber) || (ref.blockHash && receipt.blockHash.toLowerCase() !== ref.blockHash.toLowerCase())) return { state: 'FAILED', reason: 'recorded_block_mismatch' }
    const block = await rpc.getBlock({ blockNumber: receipt.blockNumber })
    if (block.number !== receipt.blockNumber || block.hash !== receipt.blockHash) return { state: 'FAILED', reason: 'canonical_block_mismatch_or_reorg' }
    const confirmations = head.number - receipt.blockNumber + 1n
    if (confirmations < BigInt(min)) return { state: 'PENDING', reason: 'insufficient_confirmations', confirmations: confirmations.toString() }
    return { state: 'VERIFIABLE', reason: 'successful_transaction_in_current_rpc_canonical_block', confirmations: confirmations.toString(), receipt }
  } catch { return { state: 'UNAVAILABLE', reason: 'rpc_or_block_unavailable' } }
}
