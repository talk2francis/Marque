import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { desc, eq, lte, and } from 'drizzle-orm'
import { db, sealedCall } from '@marque/db'
import { sealHash, agentIdBytes32, trackRecord, type SealOutcome } from './sealed.js'

/**
 * Sealing, on chain.
 *
 * `MarqueRegistry.sealCall(callHash, agentId)` writes a hash at a block that
 * PRECEDES the outcome. That single ordering fact is what separates a track
 * record from a marketing claim, and it is the only reason the contract was
 * worth deploying.
 *
 * The seal is on BSC TESTNET. A mainnet seal is an on-chain state change on
 * mainnet and needs written approval (escalation gate 1); the proof of the
 * mechanism does not depend on which chain it runs on, and pretending
 * otherwise to look more impressive would be the wrong trade.
 */

const registryAbi = [
  {
    type: 'function', name: 'sealCall', stateMutability: 'nonpayable',
    inputs: [{ name: 'callHash', type: 'bytes32' }, { name: 'agentId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function', name: 'isSealed', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'sealedAt', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ type: 'uint256' }],
  },
] as const

export interface SealInput {
  agentId: string
  category: string
  recommendation: Record<string, unknown>
  subject: string
  blockNumber: string
  resolutionRule: string
  resolveAfterSeconds: number
}

export interface SealResult {
  ok: boolean
  hash: string
  txHash: string | null
  sealBlock: string | null
  detail?: string
}

function config() {
  const registryAddress = process.env['MARQUE_REGISTRY_ADDRESS_TESTNET']
  const privateKey = process.env['MARQUE_TESTNET_PK']
  const rpcUrl = process.env['BSC_TESTNET_RPC']?.split(',')[0]?.trim()
  if (!registryAddress || !privateKey || !rpcUrl) return null
  return { registryAddress: registryAddress as Address, privateKey: privateKey as `0x${string}`, rpcUrl }
}

/**
 * Seal one recommendation.
 *
 * The row is written FIRST and the anchor second, so a seal whose transaction
 * failed is still visible as a seal that failed. Writing the row only on
 * success would quietly delete every failed anchor from the record, which is
 * the same shape as choosing your sample after the fact.
 */
export async function seal(input: SealInput): Promise<SealResult> {
  const timestamp = new Date().toISOString()
  const hash = sealHash({
    agentId: input.agentId,
    recommendation: input.recommendation,
    blockNumber: input.blockNumber,
    timestamp,
  })

  await db().insert(sealedCall).values({
    hash,
    agentId: input.agentId,
    category: input.category as 'security',
    recommendation: input.recommendation,
    subject: input.subject,
    blockNumber: input.blockNumber,
    issuedAt: new Date(timestamp),
    resolutionRule: input.resolutionRule,
    resolveAfter: new Date(Date.now() + input.resolveAfterSeconds * 1000),
    chainId: 97,
  }).onConflictDoNothing()

  const cfg = config()
  if (!cfg) {
    return { ok: false, hash, txHash: null, sealBlock: null, detail: 'sealing is not configured on this deployment' }
  }

  try {
    const account = privateKeyToAccount(cfg.privateKey)
    const transport = http(cfg.rpcUrl, { timeout: 30_000 })
    const wallet = createWalletClient({ account, chain: bscTestnet, transport })
    const pub = createPublicClient({ chain: bscTestnet, transport })

    const txHash = await wallet.writeContract({
      address: cfg.registryAddress,
      abi: registryAbi,
      functionName: 'sealCall',
      args: [hash as `0x${string}`, agentIdBytes32(input.agentId)],
      chain: bscTestnet,
      account,
    })
    const receipt = await pub.waitForTransactionReceipt({ hash: txHash })

    await db().update(sealedCall).set({
      sealTxHash: txHash,
      sealBlock: receipt.blockNumber.toString(),
      sealedAt: new Date(),
    }).where(eq(sealedCall.hash, hash))

    return { ok: true, hash, txHash, sealBlock: receipt.blockNumber.toString() }
  } catch (err) {
    return {
      ok: false, hash, txHash: null, sealBlock: null,
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
    }
  }
}

/** Sealed calls whose resolution window has passed and which are unresolved. */
export async function dueForResolution(limit = 50) {
  return db().select().from(sealedCall)
    .where(and(eq(sealedCall.outcome, 'unresolved'), lte(sealedCall.resolveAfter, new Date())))
    .limit(limit)
}

export async function resolve(hash: string, outcome: SealOutcome, evidence: Record<string, unknown>, atBlock: string): Promise<void> {
  await db().update(sealedCall).set({
    outcome, resolutionEvidence: evidence, resolvedAt: new Date(), resolvedAtBlock: atBlock,
  }).where(eq(sealedCall.hash, hash))
}

export async function sealsFor(agentId: string, limit = 200) {
  return db().select().from(sealedCall)
    .where(eq(sealedCall.agentId, agentId))
    .orderBy(desc(sealedCall.issuedAt))
    .limit(limit)
}

export async function allSeals(limit = 200) {
  return db().select().from(sealedCall).orderBy(desc(sealedCall.issuedAt)).limit(limit)
}

/**
 * The agent's public track record.
 *
 * n, the window, the breakdown and the small-sample warning. Never a bare
 * percentage: at these sample sizes a rate is a number that looks like
 * evidence and is not one.
 */
export async function recordFor(agentId: string) {
  const rows = await sealsFor(agentId)
  if (rows.length === 0) {
    return trackRecord({
      agentId,
      windowFrom: new Date().toISOString(),
      windowTo: new Date().toISOString(),
      outcomes: [],
    })
  }
  const times = rows.map((r) => r.issuedAt.getTime())
  return trackRecord({
    agentId,
    windowFrom: new Date(Math.min(...times)).toISOString(),
    windowTo: new Date(Math.max(...times)).toISOString(),
    outcomes: rows.map((r) => r.outcome as SealOutcome),
  })
}
