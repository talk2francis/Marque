'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig } from 'wagmi'
import { getCallsStatus, getPublicClient, sendCalls, sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import { BaseError, ContractFunctionRevertedError, encodeFunctionData, erc20Abi, formatEther, type Address, type Hex } from 'viem'
import { CHARTER_CHAINS, V2, charterFactoryAbi, loanGuardFactoryV2Abi, type CharterChainId } from '@marque/charters/client'
import { loanCalls, minRepayFor } from '../../../lib/charters-builder-v2'
import {
  cannotBatch, clearPending, expiryStillValid, grantCalls, loadPending, newSalt, paramsOf, savePending, tokens,
  type GrantParams, type PendingGrant,
} from '../../../lib/charters-builder'
import type { SealPhase, SealStep } from './Seal'

/**
 * The grant (03_EXPERIENCE 3.2, 3.3 and 9): an exact allowance to the guard's predicted address, then the create,
 * from the owner's own account (review I-6). Wallets that speak EIP-5792 get both in one request (Marque Pass: one
 * confirmation, one passkey prompt); others get one prompt per step. If the create fails after the allowance, the
 * retry creates the same guard at the same address. The guard counts as granted only when the factory says
 * isGuard. Before the Seal opens, the wallet must hold the network fee (P3 found estimateGas caps gas at the
 * balance, so a short wallet looks like a revert), and estimation is retried once a node catches up.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Measured on both chains (fork suites): approve about 46k, create about 1.9M. Used only when estimation fails.
const GAS_FALLBACK = { approve: 70_000n, create: 2_300_000n }

export interface GrantInput { chainId: CharterChainId; owner: Address; token: Address; symbol: string; decimals: number; params: GrantParams }
type Prepared = GrantInput & { salt: Hex; predicted: Address; factory: Address; v2: boolean; calls: Array<{ to: Address; data: Hex }> }

/**
 * Loan Guard v2 (05_LOAN_GUARD) where its factory is deployed: tips have their own budget (ten actions' worth of the
 * chosen tip) and the smallest repayment is derived from the budget. v1 stays the fallback (decision L5).
 */
function v2Create(input: GrantInput) {
  const t = input.params
  return {
    p: { vDebt: t.vDebt, trigger: t.trigger, target: t.target, budget: t.budget, minRepay: minRepayFor(t.budget, input.decimals) },
    expiresAt: t.expiresAt, tipPerAction: t.tip, tipBudget: t.tip * 10n,
  }
}
export const tipBudgetOf = (tip: bigint) => tip * 10n

/** A revert in words, when it is one of the factory's or the guard's rules. */
function reason(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError)
    if (r instanceof ContractFunctionRevertedError && r.data?.errorName) {
      const n = r.data.errorName
      if (n === 'BadExpiry') return 'The end date is outside what the factory allows from now. Pick the duration again.'
      if (n === 'BadTip') return 'The thank-you is above a tenth of the budget.'
      if (n === 'UnsupportedMarket') return 'This debt market is not one a Loan Guard can repay.'
      if (n === 'BadTrigger' || n === 'BadTarget') return 'The trigger or target is outside the factory’s bounds.'
      return `The chain refused it (${n}).`
    }
    if (/insufficient funds/i.test(e.message)) return 'The wallet does not hold enough BNB for the network fee.'
    return e.shortMessage
  }
  return e instanceof Error ? e.message.slice(0, 200) : 'Something went wrong.'
}
const refused = (e: unknown) => /user (rejected|denied)|rejected the request|cancel/i.test(`${(e as Error)?.message ?? ''} ${(e as BaseError)?.shortMessage ?? ''}`) || (e as { code?: number })?.code === 4001

export function useGrant() {
  const config = useConfig()
  const [prep, setPrep] = useState<Prepared | null>(null)
  const [phase, setPhase] = useState<SealPhase>('review')
  const [steps, setSteps] = useState<SealStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [preError, setPreError] = useState<string | null>(null)
  const [granted, setGranted] = useState<Address | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const client = useCallback((c: CharterChainId) => getPublicClient(config, { chainId: c })!, [config])
  const mark = (i: number, patch: Partial<SealStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  /** Fee and simulation checks, then the Seal opens on the review frame. */
  const prepare = useCallback(async (input: GrantInput, labels: [string, string], reuse?: { salt: Hex; predicted: Address; approved: boolean }) => {
    setPreError(null); setChecking(true)
    try {
      const pub = client(input.chainId)
      const v2 = V2[input.chainId].loanFactory !== null
      const factory = (V2[input.chainId].loanFactory ?? CHARTER_CHAINS[input.chainId].factory) as Address | null
      if (!factory) throw new Error('There is no Loan Guard factory on this network yet.')
      const salt = reuse?.salt ?? newSalt()
      const create = v2Create(input)
      const predicted = (v2
        ? await pub.readContract({ address: factory, abi: loanGuardFactoryV2Abi, functionName: 'predict', args: [input.owner, create, salt] })
        : await pub.readContract({ address: factory, abi: charterFactoryAbi, functionName: 'predict', args: [input.owner, input.params, salt] })) as Address
      // A resumed grant is re-derived from the chain, never trusted from storage.
      if (reuse && predicted.toLowerCase() !== reuse.predicted.toLowerCase()) throw new Error('That unfinished charter no longer matches this factory. Clear its allowance and grant again.')
      const calls = v2 ? loanCalls(factory, input.token, predicted, create.p, create.expiresAt, create.tipPerAction, create.tipBudget, salt) : grantCalls(input.chainId, input.token, predicted, input.params, salt)
      // The create must pass the factory's own checks now; a node a block behind can answer stale, so ask twice.
      let createGas: bigint | null = null
      let lastErr: unknown = null
      for (let i = 0; i < 3 && createGas === null; i++) {
        try { createGas = await pub.estimateGas({ account: input.owner, to: factory, data: calls[1]!.data }) } catch (e) {
          lastErr = e
          if (e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)) break
          await sleep(1500)
        }
      }
      const [balance, gasPrice, approveGas] = await Promise.all([
        pub.getBalance({ address: input.owner }),
        pub.getGasPrice(),
        pub.estimateGas({ account: input.owner, to: input.token, data: calls[0]!.data }).catch(() => GAS_FALLBACK.approve),
      ])
      const fee = ((approveGas + (createGas ?? GAS_FALLBACK.create)) * 12n / 10n) * gasPrice
      const coin = input.chainId === 97 ? 'tBNB' : 'BNB'
      if (balance < fee) {
        throw new Error(`Your wallet needs about ${Number(formatEther(fee)).toPrecision(2)} ${coin} for the network fee and holds ${Number(formatEther(balance)).toPrecision(2)}.${input.chainId === 97 ? ' The BNB Chain testnet faucet gives free tBNB.' : ''}`)
      }
      if (createGas === null && lastErr && !(lastErr instanceof BaseError && /insufficient funds|gas required exceeds/i.test(lastErr.message))) throw new Error(reason(lastErr))
      if (!alive.current) return
      setPrep({ ...input, salt, predicted, factory, v2, calls: calls.map((c) => ({ to: c.to as Address, data: c.data as Hex })) })
      setSteps([{ key: 'approve', label: labels[0], state: reuse?.approved ? 'done' : 'waiting' }, { key: 'create', label: labels[1], state: 'waiting' }])
      setError(null); setNote(null); setGranted(null); setPhase('review')
    } catch (e) {
      setPreError(e instanceof Error ? e.message : reason(e))
    } finally { setChecking(false) }
  }, [client])

  const finish = useCallback(async (p: Prepared) => {
    const pub = client(p.chainId)
    const ok = await (p.v2
      ? pub.readContract({ address: p.factory, abi: loanGuardFactoryV2Abi, functionName: 'isCharter', args: [p.predicted] })
      : pub.readContract({ address: p.factory, abi: charterFactoryAbi, functionName: 'isGuard', args: [p.predicted] })).catch(() => false)
    if (!alive.current) return
    if (ok) {
      clearPending(p.chainId, p.owner)
      setGranted(p.predicted)
      setPhase('sealed')
      setNote('Keel is registering its key. Your money has not moved.')
    } else {
      setPhase('failed')
      setError('The create confirmed, but the factory does not list this guard yet. Open the charter in a minute, or try again.')
    }
  }, [client])

  const afterApproveFailure = useCallback((p: Prepared, e: unknown, approveDone: boolean) => {
    setPhase('failed')
    if (refused(e)) {
      setError(approveDone ? 'You stopped before the guard was created.' : 'You cancelled. Nothing was signed.')
    } else setError(reason(e))
    if (approveDone) {
      setNote(expiryStillValid(p.params.expiresAt, Math.floor(Date.now() / 1000))
        ? 'The allowance is set, but the guard was not created. Try again: it will be created at the same address, which only this exact charter can occupy.'
        : 'The allowance is set, but this charter’s end date can no longer be used. Clear the allowance, then grant again.')
    }
  }, [])

  /** Sequential path: one prompt per step, each waiting for its receipt. */
  const oneByOne = useCallback(async (p: Prepared, from: 0 | 1) => {
    const calls = p.calls
    for (let i = from; i < 2; i++) {
      mark(i, { state: 'signing' })
      try {
        const hash = await sendTransaction(config, { account: p.owner, chainId: p.chainId, to: calls[i]!.to, data: calls[i]!.data })
        mark(i, { state: 'pending', hash })
        const r = await waitForTransactionReceipt(config, { chainId: p.chainId, hash, timeout: 180_000 })
        if (r.status !== 'success') throw new Error(i === 0 ? 'The allowance transaction reverted.' : 'The create transaction reverted on chain.')
        mark(i, { state: 'done' })
      } catch (e) {
        mark(i, { state: 'failed' })
        afterApproveFailure(p, e, i === 1)
        return false
      }
    }
    return true
  }, [config, afterApproveFailure])

  /** The Seal's main button: sign and send, batched where the wallet can. */
  const sign = useCallback(async () => {
    const p = prep
    if (!p) return
    setError(null); setNote(null); setPhase('signing')
    savePending({
      chainId: p.chainId, owner: p.owner, token: p.token, symbol: p.symbol, decimals: p.decimals, predicted: p.predicted, salt: p.salt, at: Date.now(),
      params: { vDebt: p.params.vDebt, trigger: String(p.params.trigger), target: String(p.params.target), budget: String(p.params.budget), tip: String(p.params.tip), expiresAt: String(p.params.expiresAt) },
    })
    const calls = p.calls
    setSteps((s) => s.map((x) => ({ ...x, state: 'signing' as const })))
    let id: string | null = null
    try {
      id = (await sendCalls(config, { account: p.owner, chainId: p.chainId, calls: calls.map((c) => ({ to: c.to, data: c.data })) })).id
    } catch (e) {
      if (!cannotBatch(e)) {
        setSteps((s) => s.map((x) => ({ ...x, state: 'waiting' as const })))
        afterApproveFailure(p, e, false)
        return
      }
      setSteps((s) => s.map((x) => ({ ...x, state: 'waiting' as const })))
      if (await oneByOne(p, 0)) await finish(p)
      return
    }
    setSteps((s) => s.map((x) => ({ ...x, state: 'pending' as const })))
    const until = Date.now() + 240_000
    while (alive.current && Date.now() < until) {
      const st = await getCallsStatus(config, { id }).catch(() => null)
      const receipts = st?.receipts ?? []
      // A wallet that batches atomically returns one receipt for both steps.
      const atomic = receipts.length === 1 && st?.statusCode === 200
      receipts.forEach((r, i) => mark(i, { state: r.status === 'success' ? 'done' : 'failed', hash: r.transactionHash }))
      if (atomic) mark(1, { state: 'done', hash: receipts[0]!.transactionHash })
      if (st && st.statusCode >= 200) {
        if (st.statusCode === 200) { await finish(p); return }
        const approveDone = receipts[0]?.status === 'success' && !atomic
        afterApproveFailure(p, new Error(approveDone ? 'The create transaction reverted on chain.' : 'The wallet reports the batch failed. Nothing was created.'), approveDone)
        return
      }
      await sleep(1500)
    }
    if (alive.current) { setPhase('failed'); setError('The wallet has not reported the result yet. Check your wallet’s activity, then open My Marque.') }
  }, [prep, config, oneByOne, finish, afterApproveFailure])

  /** After a failed create: send only the create, same salt and parameters, so the guard lands where the allowance points. */
  const retryCreate = useCallback(async () => {
    const p = prep
    if (!p) return
    setError(null); setNote(null); setPhase('signing')
    mark(1, { state: 'waiting', hash: null })
    if (await oneByOne(p, 1)) await finish(p)
  }, [prep, oneByOne, finish])

  /** Set the allowance this unfinished charter holds back to zero. */
  const clearAllowance = useCallback(async (p: { chainId: CharterChainId; owner: Address; token: Address; predicted: Address }) => {
    const hash = await sendTransaction(config, { account: p.owner, chainId: p.chainId, to: p.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [p.predicted, 0n] }) })
    await waitForTransactionReceipt(config, { chainId: p.chainId, hash, timeout: 180_000 })
    clearPending(p.chainId, p.owner)
    return hash
  }, [config])

  const close = useCallback(() => { setPrep(null); setPhase('review'); setSteps([]); setError(null); setNote(null) }, [])
  const approveDone = steps[0]?.state === 'done'

  return { prep, phase, steps, error, note, checking, preError, setPreError, granted, prepare, sign, retryCreate, clearAllowance, close, approveDone }
}

/** An unfinished grant from an earlier visit, checked against the chain: finished, still open (with its allowance), or gone. */
export async function checkPending(pub: { readContract: (a: never) => Promise<unknown> }, owner: Address, chainId: CharterChainId): Promise<{ pending: PendingGrant; allowance: bigint } | null> {
  const p = loadPending(chainId, owner)
  const v2 = V2[chainId].loanFactory
  const factory = v2 ?? CHARTER_CHAINS[chainId].factory
  if (!p || !factory) return null
  const exists = await pub.readContract((v2
    ? { address: v2, abi: loanGuardFactoryV2Abi, functionName: 'isCharter', args: [p.predicted] }
    : { address: factory, abi: charterFactoryAbi, functionName: 'isGuard', args: [p.predicted] }) as never).catch(() => null)
  if (exists === true) { clearPending(chainId, owner); return null }
  const allowance = await pub.readContract({ address: p.token, abi: erc20Abi, functionName: 'allowance', args: [owner, p.predicted] } as never).catch(() => null) as bigint | null
  if (allowance === null) return null
  if (allowance === 0n) { clearPending(chainId, owner); return null }
  return { pending: p, allowance }
}

export { paramsOf, tokens }
