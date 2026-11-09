'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig } from 'wagmi'
import { getCallsStatus, getPublicClient, sendCalls, sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import { BaseError, ContractFunctionRevertedError, formatEther, type Address, type Hex } from 'viem'
import type { CharterChainId } from '@marque/charters/client'
import { cannotBatch } from '../../../lib/charters-builder'
import type { SealPhase, SealStep } from './Seal'

/**
 * The grant for the v2 kinds (09_ALTANA_AND_WALLETS): exact approvals to the charter's predicted address, then the
 * create, from the owner's own account; or, for Range Keeper, one NFT transfer to the factory. Wallets that speak
 * EIP-5792 get every step in one request (Marque Pass: one confirmation, one passkey touch); others get a prompt
 * per step. A failure after an approval retries from the first unfinished step, landing on the same address.
 * The charter counts as granted only when the factory says so (`verify`).
 */
export interface GrantStep { label: string; to: Address; data: Hex; value?: bigint }
export interface StepsGrant {
  chainId: CharterChainId
  owner: Address
  steps: GrantStep[]
  /** Returns the charter's address once the factory lists it, else null. */
  verify: (receipts: Array<{ transactionHash: Hex }>) => Promise<Address | null>
  /** Gas used when estimation cannot run (a step depends on an earlier one): measured per kind on the fork suites. */
  gasFallback: bigint[]
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const refused = (e: unknown) => /user (rejected|denied)|rejected the request|cancel/i.test(`${(e as Error)?.message ?? ''} ${(e as BaseError)?.shortMessage ?? ''}`) || (e as { code?: number })?.code === 4001

const ERRORS: Record<string, string> = {
  BadExpiry: 'The end date is outside what the factory allows from now. Pick the duration again.',
  UnsupportedMarket: 'This Venus market is not one this kind of charter supports.',
  UnsupportedPool: 'This pool is not on the reviewed list for this network.',
  BadBand: 'The band is too narrow: keep the ceiling at least two smallest moves above the floor.',
  BadCap: 'The lifetime limit, or the tip, is outside what the factory allows.',
  BadGrid: 'The levels are outside what the factory allows. Widen the band or use fewer levels.',
  BadParams: 'A setting is outside what the factory allows.',
  NotOwnerOperator: 'Only the position’s owner can grant it, not an approved operator.',
  PositionMismatch: 'This position is not on the pool, pair or fee tier the charter names.',
  BadToken: 'The token chosen does not belong to this pool.',
  BadTip: 'The tip is outside what the factory allows.',
  BadExecutors: 'One of the agents named cannot be an executor.',
  TooManyExecutors: 'At most eight agents can be named.',
}
export function reasonOf(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError)
    if (r instanceof ContractFunctionRevertedError && r.data?.errorName) return ERRORS[r.data.errorName] ?? `The chain refused it (${r.data.errorName}).`
    if (/insufficient funds/i.test(e.message)) return 'The wallet does not hold enough BNB for the network fee.'
    return e.shortMessage
  }
  return e instanceof Error ? e.message.slice(0, 200) : 'Something went wrong.'
}

export function useGrantSteps() {
  const config = useConfig()
  const [g, setG] = useState<StepsGrant | null>(null)
  const [phase, setPhase] = useState<SealPhase>('review')
  const [steps, setSteps] = useState<SealStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [preError, setPreError] = useState<string | null>(null)
  const [granted, setGranted] = useState<Address | null>(null)
  const receipts = useRef<Array<{ transactionHash: Hex }>>([])
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const mark = (i: number, patch: Partial<SealStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  /** The network fee check (estimation caps gas at the balance, so a short wallet looks like a revert), then the Seal. */
  const prepare = useCallback(async (grant: StepsGrant) => {
    setPreError(null); setChecking(true)
    try {
      const pub = getPublicClient(config, { chainId: grant.chainId })!
      const [balance, gasPrice] = await Promise.all([pub.getBalance({ address: grant.owner }), pub.getGasPrice()])
      // The last step is the create (it may depend on the approvals); estimate the approvals, use the measured fallback for the rest.
      const gas = await Promise.all(grant.steps.map((s, i) => (i < grant.steps.length - 1 || grant.steps.length === 1
        ? pub.estimateGas({ account: grant.owner, to: s.to, data: s.data, value: s.value }).catch((e) => { if (grant.steps.length === 1 && e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)) throw e; return grant.gasFallback[i]! })
        : Promise.resolve(grant.gasFallback[i]!))))
      const fee = gas.reduce((a, b) => a + b, 0n) * 12n / 10n * gasPrice + grant.steps.reduce((a, s) => a + (s.value ?? 0n), 0n)
      if (balance < fee) {
        const coin = grant.chainId === 97 ? 'tBNB' : 'BNB'
        throw new Error(`Your wallet needs about ${Number(formatEther(fee)).toPrecision(2)} ${coin} for the network fee and holds ${Number(formatEther(balance)).toPrecision(2)}.${grant.chainId === 97 ? ' The BNB Chain testnet faucet gives free tBNB.' : ''}`)
      }
      if (!alive.current) return
      receipts.current = []
      setG(grant); setSteps(grant.steps.map((s, i) => ({ key: String(i), label: s.label, state: 'waiting' })))
      setError(null); setNote(null); setGranted(null); setPhase('review')
    } catch (e) { setPreError(e instanceof Error && !(e instanceof BaseError) ? e.message : reasonOf(e)) } finally { setChecking(false) }
  }, [config])

  const finish = useCallback(async (grant: StepsGrant) => {
    const at = await grant.verify(receipts.current).catch(() => null)
    if (!alive.current) return
    if (at) { setGranted(at); setPhase('sealed') } else { setPhase('failed'); setError('The last step confirmed, but the factory does not list this charter yet. Open My Marque in a minute, or try again.') }
  }, [])

  const failAt = useCallback((i: number, e: unknown) => {
    setPhase('failed')
    setError(refused(e) ? (i === 0 ? 'You cancelled. Nothing was signed.' : 'You stopped before the charter was created.') : reasonOf(e))
    if (i > 0) setNote('The approvals so far are set, but the charter was not created. Try again: it lands at the same address, which only this exact charter can occupy. Or clear the approvals from My Marque.')
  }, [])

  const oneByOne = useCallback(async (grant: StepsGrant, from: number) => {
    for (let i = from; i < grant.steps.length; i++) {
      mark(i, { state: 'signing' })
      try {
        // 30% over the estimate: a position mint or transfer that initialises ticks can use exactly its estimate and run out.
        const st = grant.steps[i]!
        const est = await getPublicClient(config, { chainId: grant.chainId })!.estimateGas({ account: grant.owner, to: st.to, data: st.data, value: st.value }).catch(() => grant.gasFallback[i]!)
        const hash = await sendTransaction(config, { account: grant.owner, chainId: grant.chainId, to: st.to, data: st.data, value: st.value, gas: est * 13n / 10n })
        mark(i, { state: 'pending', hash })
        const r = await waitForTransactionReceipt(config, { chainId: grant.chainId, hash, timeout: 180_000 })
        if (r.status !== 'success') throw new Error('The transaction reverted on chain.')
        receipts.current[i] = { transactionHash: hash }
        mark(i, { state: 'done' })
      } catch (e) { mark(i, { state: 'failed' }); failAt(i, e); return false }
    }
    return true
  }, [config, failAt])

  const sign = useCallback(async () => {
    if (!g) return
    setError(null); setNote(null); setPhase('signing')
    const from = steps.findIndex((s) => s.state !== 'done')
    if (from > 0) { if (await oneByOne(g, from)) await finish(g); return } // a retry continues where it stopped
    setSteps((s) => s.map((x) => ({ ...x, state: 'signing' as const })))
    let id: string
    try {
      id = (await sendCalls(config, { account: g.owner, chainId: g.chainId, calls: g.steps.map((c) => ({ to: c.to, data: c.data, value: c.value })) })).id
    } catch (e) {
      setSteps((s) => s.map((x) => ({ ...x, state: 'waiting' as const })))
      if (!cannotBatch(e)) { failAt(0, e); return }
      if (await oneByOne(g, 0)) await finish(g)
      return
    }
    setSteps((s) => s.map((x) => ({ ...x, state: 'pending' as const })))
    const until = Date.now() + 300_000
    while (alive.current && Date.now() < until) {
      const st = await getCallsStatus(config, { id }).catch(() => null)
      const rs = st?.receipts ?? []
      const atomic = rs.length === 1 && g.steps.length > 1 && st?.statusCode === 200
      rs.forEach((r, i) => { mark(i, { state: r.status === 'success' ? 'done' : 'failed', hash: r.transactionHash }); if (r.status === 'success') receipts.current[i] = { transactionHash: r.transactionHash } })
      if (atomic) g.steps.forEach((_, i) => { mark(i, { state: 'done', hash: rs[0]!.transactionHash }); receipts.current[i] = { transactionHash: rs[0]!.transactionHash } })
      if (st && st.statusCode >= 200) {
        if (st.statusCode === 200) { await finish(g); return }
        const firstFailed = rs.findIndex((r) => r.status !== 'success')
        failAt(atomic ? 0 : Math.max(0, firstFailed), new Error('The wallet reports a step failed.'))
        return
      }
      await sleep(1500)
    }
    if (alive.current) { setPhase('failed'); setError('The wallet has not reported the result yet. Check your wallet’s activity, then open My Marque.') }
  }, [g, steps, config, oneByOne, finish, failAt])

  const close = useCallback(() => { setG(null); setPhase('review'); setSteps([]); setError(null); setNote(null) }, [])
  return { grant: g, phase, steps, error, note, checking, preError, setPreError, granted, prepare, sign, close }
}
