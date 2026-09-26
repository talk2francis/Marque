'use client'
import { useCallback, useState } from 'react'
import { useConfig } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import type { Hex } from 'viem'
import { reputationAbi } from '../reputation.js'
import { friendlyError, type FriendlyError } from '../errors.js'

/**
 * Rate a delivered job (P2-04). Marque's server checks the guards and stores the comment;
 * the buyer's own wallet sends giveFeedback to the ERC-8004 reputation registry.
 */
export interface RateState { phase: 'idle' | 'preparing' | 'signing' | 'done' | 'error'; tx: Hex | null; error: FriendlyError | null }

export function useRate() {
  const config = useConfig()
  const [state, setState] = useState<RateState>({ phase: 'idle', tx: null, error: null })
  const rate = useCallback(async (input: { chainId: number; jobId: string; wallet: string; stars: number; comment?: string }) => {
    setState({ phase: 'preparing', tx: null, error: null })
    try {
      const res = await fetch('/api/v1/phase2/rate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
      const j = await res.json().catch(() => ({})) as { error?: string; detail?: string; call?: { to: `0x${string}`; args: string[]; chainId: number } }
      if (!res.ok || !j.call) {
        setState({ phase: 'error', tx: null, error: { code: j.error ?? 'rate', title: j.detail ?? 'The rating could not be prepared.', action: 'Try again in a moment.', retryable: true } })
        return null
      }
      const [agentId, value, decimals, tag1, tag2, endpoint, uri, hash] = j.call.args
      setState({ phase: 'signing', tx: null, error: null })
      const tx = await writeContract(config, {
        address: j.call.to, abi: reputationAbi, functionName: 'giveFeedback', chainId: j.call.chainId,
        args: [BigInt(agentId!), BigInt(value!), Number(decimals), tag1!, tag2!, endpoint!, uri!, hash as Hex],
      })
      const r = await waitForTransactionReceipt(config, { hash: tx, chainId: j.call.chainId })
      if (r.status !== 'success') throw Object.assign(new Error('reverted'), { code: 'reverted' })
      setState({ phase: 'done', tx, error: null })
      return tx
    } catch (err) {
      setState({ phase: 'error', tx: null, error: friendlyError(err) })
      return null
    }
  }, [config])
  return { state, rate }
}
