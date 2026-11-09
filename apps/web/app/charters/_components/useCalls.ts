'use client'
import { useCallback, useState } from 'react'
import { useConfig } from 'wagmi'
import { getCallsStatus, sendCalls, sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import { BaseError, type Address, type Hex } from 'viem'
import type { CharterChainId } from '@marque/charters/client'
import { cannotBatch } from '../../../lib/charters-builder'

/**
 * One owner action of one or more calls (End with Clear allowance, Protect now): batched where the wallet speaks
 * EIP-5792, else one prompt per call, each waiting for its receipt. Reports the hashes as they land.
 */
export type CallsState = 'idle' | 'signing' | 'pending' | 'done' | 'failed'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const words = (e: unknown) => {
  const t = `${(e as BaseError)?.shortMessage ?? ''} ${(e as Error)?.message ?? ''}`
  if ((e as { code?: number })?.code === 4001 || /user (rejected|denied)|rejected the request/i.test(t)) return 'You cancelled. Nothing was signed.'
  return (e as BaseError)?.shortMessage ?? (e instanceof Error ? e.message.slice(0, 200) : 'The wallet did not complete it.')
}

export function useCalls() {
  const config = useConfig()
  const [state, setState] = useState<CallsState>('idle')
  const [hashes, setHashes] = useState<Hex[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (account: Address, chainId: CharterChainId, calls: Array<{ to: Address; data: Hex }>): Promise<boolean> => {
    setState('signing'); setError(null); setHashes([])
    if (calls.length > 1) {
      try {
        const { id } = await sendCalls(config, { account, chainId, calls })
        setState('pending')
        for (let i = 0; i < 160; i++) {
          const st = await getCallsStatus(config, { id }).catch(() => null)
          if (st?.receipts?.length) setHashes(st.receipts.map((r) => r.transactionHash))
          if (st && st.statusCode >= 200) {
            if (st.statusCode === 200) { setState('done'); return true }
            setState('failed'); setError('The wallet reports that part of it did not go through. Check the timeline.')
            return false
          }
          await sleep(1500)
        }
        setState('failed'); setError('The wallet has not reported the result yet. Check your wallet’s activity.')
        return false
      } catch (e) {
        if (!cannotBatch(e)) { setState('failed'); setError(words(e)); return false }
      }
    }
    for (const c of calls) {
      try {
        setState('signing')
        const hash = await sendTransaction(config, { account, chainId, to: c.to, data: c.data })
        setHashes((h) => [...h, hash])
        setState('pending')
        const r = await waitForTransactionReceipt(config, { chainId, hash, timeout: 180_000 })
        if (r.status !== 'success') throw new Error('The transaction reverted on chain. Nothing changed.')
      } catch (e) { setState('failed'); setError(words(e)); return false }
    }
    setState('done')
    return true
  }, [config])

  const reset = useCallback(() => { setState('idle'); setError(null); setHashes([]) }, [])
  return { state, hashes, error, run, reset }
}
