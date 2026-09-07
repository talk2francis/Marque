import 'server-only'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'

/**
 * Anchor a receipt hash on MarqueRegistry.
 *
 * What this proves is narrow and worth stating precisely: the receipt existed
 * at a block and has not been edited since. It does not prove the receipt is
 * TRUE, and the page that renders it says so. Overstating an anchor is how a
 * timestamp gets sold as an audit.
 *
 * Anchoring is best-effort. A run whose receipt could not be anchored is still
 * a real run with a real receipt; the page shows it as unanchored rather than
 * failing the run, because losing the evidence to protect the proof would be
 * exactly backwards.
 */

const abi = [
  { type: 'function', name: 'anchor', stateMutability: 'nonpayable', inputs: [{ name: 'leaf', type: 'bytes32' }], outputs: [] },
] as const

export interface AnchorResult {
  ok: boolean
  txHash: string | null
  blockNumber: string | null
  detail?: string
}

export async function anchorReceipt(hash: string): Promise<AnchorResult> {
  const registryAddress = process.env['MARQUE_REGISTRY_ADDRESS_TESTNET']
  const privateKey = process.env['MARQUE_TESTNET_PK']
  const rpcUrl = process.env['BSC_TESTNET_RPC']?.split(',')[0]?.trim()
  if (!registryAddress || !privateKey || !rpcUrl) {
    return { ok: false, txHash: null, blockNumber: null, detail: 'anchoring is not configured on this deployment' }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return { ok: false, txHash: null, blockNumber: null, detail: 'a receipt hash must be 32 bytes' }
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const transport = http(rpcUrl, { timeout: 30_000 })
    const wallet = createWalletClient({ account, chain: bscTestnet, transport })
    const pub = createPublicClient({ chain: bscTestnet, transport })

    const txHash = await wallet.writeContract({
      address: registryAddress as `0x${string}`,
      abi,
      functionName: 'anchor',
      args: [hash as `0x${string}`],
      chain: bscTestnet,
      account,
    })
    const receipt = await pub.waitForTransactionReceipt({ hash: txHash })
    return { ok: true, txHash, blockNumber: receipt.blockNumber.toString() }
  } catch (err) {
    return {
      ok: false, txHash: null, blockNumber: null,
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
    }
  }
}
