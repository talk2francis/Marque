import 'server-only'
import { publicClient } from '@marque/chain'
import { cachedProjection } from '@marque/db'
import { ScanClient } from '@marque/registry'
import { isIdentityMint } from './registration-evidence'

/** Read-only evidence lookup. An upstream hash is never trusted without its receipt. */
export async function registrationTx(tokenId: string, registry: string, candidate: unknown): Promise<string | null> {
  try {
    const p = await cachedProjection(`registration:v1:56:${registry}:${tokenId}`, async () => {
      let hash = typeof candidate === 'string' ? candidate : null
      if (!hash) {
        const r = await new ScanClient().getAgentResult(56, tokenId)
        if (r.status === 'transient') throw new Error('Registry temporarily unavailable')
        if (r.status !== 'ok' || r.detail.token_id !== tokenId || r.detail.contract_address.toLowerCase() !== registry.toLowerCase()) return null
        hash = r.detail.created_tx_hash ?? null
      }
      if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null
      const receipt = await publicClient().getTransactionReceipt({hash: hash as `0x${string}`})
      return receipt.status === 'success' && receipt.logs.some(log => isIdentityMint(log, registry, tokenId)) ? hash : null
    }, {freshMs: 3600_000, timeoutMs: 5000, keepMs: 7 * 24 * 3600_000})
    return p.value
  } catch { return null }
}
