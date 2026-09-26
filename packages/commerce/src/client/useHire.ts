'use client'
import { useCallback, useRef, useState } from 'react'
import { useConfig, useAccount } from 'wagmi'
import {
  writeContract, waitForTransactionReceipt, switchChain, readContract, getBalance,
  getCapabilities, sendCalls, waitForCallsStatus, getGasPrice,
} from '@wagmi/core'
import { erc20Abi, encodeFunctionData, type Abi, type Hex } from 'viem'
import { createJobCall, paymentCalls, cancelCall, type Call, type HireTerms, type StepId } from '../calls.js'
import { friendlyError, type FriendlyError } from '../errors.js'
import { network, type ChainId } from '../config.js'

/**
 * The hire step runner (SPEC-COMMERCE 5.1). Every signature is named before the wallet
 * opens. After createJob confirms, registerJob, setBudget, approve and fund go as one
 * EIP-5792 atomic batch when the wallet supports it on this chain; otherwise one at a
 * time. The chain is the source of truth: the Job Room reads the job from chain events.
 */
/** `active` = waiting in the wallet; `confirming` = sent, waiting for the block (tx known). */
export type StepStatus = 'todo' | 'active' | 'confirming' | 'done' | 'skipped' | 'failed'
export interface HireStep { id: StepId | 'quote' | 'notify'; label: string; detail: string; status: StepStatus; tx?: Hex }

export interface HireQuote {
  quoteId: number; agentId: string; serviceId: number; agentName: string; category: string | null
  chainId: ChainId; provider: `0x${string}`; price: string; priceLabel: string
  token: { address: `0x${string}`; symbol: string; decimals: number; isDefault: boolean }
  signed: boolean; expiresAt: number; estimatedCompletionSeconds: number | null
  /** Settings the task left out and the stated default the agent will use (Marque's own agents). */
  assumptions?: string[]
}
interface IntentResponse { intentId: string; expiredAt: string; refundAfter: string; description: string; disputeWindowSeconds: number }

export interface HireState {
  phase: 'idle' | 'quoting' | 'quoted' | 'checking' | 'signing' | 'done' | 'error'
  quote: HireQuote | null
  intent: IntentResponse | null
  jobId: string | null
  steps: HireStep[]
  batched: boolean
  error: FriendlyError | null
  /** Balance problems found before the first signature. */
  shortfall: { token: boolean; gas: boolean } | null
  /** What the connected wallet holds on the quote's chain, read before any signature. */
  balances: { token: string; gas: string; gasNeeded: string } | null
  /** Whether this wallet can sign the payment steps as one EIP-5792 batch here (null = not checked yet). */
  batchCapable: boolean | null
}

const initial: HireState = { phase: 'idle', quote: null, intent: null, jobId: null, steps: [], batched: false, error: null, shortfall: null, balances: null, batchCapable: null }

/**
 * Gas for createJob, registerJob, setBudget, approve and fund together. Measured on mainnet
 * job 56810: 812,219 + 151,530 + 96,341 + 60,233 + 105,368 = 1,225,691; about 15% headroom.
 */
const HIRE_GAS = 1_400_000n

async function api<T>(route: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/v1/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({})) as T & { error?: string; detail?: string }
  if (!res.ok) throw Object.assign(new Error(j.detail ?? 'request failed'), { code: j.error ?? `http_${res.status}`, detail: j.detail, status: res.status })
  return j
}

function planSteps(q: HireQuote): HireStep[] {
  return [
    { id: 'createJob', label: `Open a job for ${q.agentName}`, detail: 'Records the job and its signed price on the escrow contract. No money moves.', status: 'todo' },
    { id: 'registerJob', label: 'Turn on buyer protection', detail: 'Lets you report a bad delivery and reclaim payment if nothing is delivered.', status: 'todo' },
    { id: 'setBudget', label: `Lock the price at ${q.priceLabel}`, detail: 'The job can never be paid more than this.', status: 'todo' },
    { id: 'approve', label: `Allow exactly ${q.priceLabel}`, detail: 'The escrow may take this exact amount and nothing more.', status: 'todo' },
    { id: 'fund', label: `Pay ${q.priceLabel} into escrow`, detail: 'Held by BNB Chain\'s ERC-8183 escrow, not by Marque, until the work is delivered.', status: 'todo' },
    { id: 'notify', label: `Ask ${q.agentName} to start`, detail: 'Marque tells the agent the job is paid. It checks the escrow on chain before working.', status: 'todo' },
  ]
}

export function useHire() {
  const config = useConfig()
  const { address, chainId: walletChain } = useAccount()
  const [state, setState] = useState<HireState>(initial)
  const busy = useRef(false)
  const lastRequest = useRef<{ agentId: string; task: string; serviceId: number | null } | null>(null)
  const set = (patch: Partial<HireState> | ((s: HireState) => Partial<HireState>)) =>
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  const mark = (id: HireStep['id'], status: StepStatus, tx?: Hex) =>
    set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, status, ...(tx ? { tx } : {}) } : st)) }))

  const reset = useCallback(() => { busy.current = false; setState(initial) }, [])

  /** Ask the agent for a price on this task. Free, no wallet needed. */
  const getQuote = useCallback(async (agentId: string, task: string, serviceId?: number | null) => {
    set({ phase: 'quoting', error: null })
    lastRequest.current = { agentId, task, serviceId: serviceId ?? null }
    try {
      const quote = await api<HireQuote>('hire/quote', { agentId, task, serviceId: serviceId ?? null })
      set({ phase: 'quoted', quote, intent: null, jobId: null, steps: planSteps(quote) })
      return quote
    } catch (err) {
      const e = err as { code?: string; detail?: string }
      const action = e.code === 'task_incomplete' ? 'Add it to the task above, then ask for a price again.' : 'Try again, or pick another agent.'
      set({ phase: 'error', error: { code: e.code ?? 'quote', title: e.detail ?? 'The agent could not be quoted.', action, retryable: true } })
      return null
    }
  }, [])

  const send = async (c: Call, step?: HireStep['id']): Promise<Hex> => {
    if (step) mark(step, 'active')
    const hash = await writeContract(config, { address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[], chainId: c.chainId })
    if (step) mark(step, 'confirming', hash)
    const r = await waitForTransactionReceipt(config, { hash, chainId: c.chainId })
    if (r.status !== 'success') throw Object.assign(new Error('reverted'), { code: 'reverted' })
    return hash
  }

  /** Run the whole hire from the stored quote. Resumable: steps already done on chain are skipped. */
  const start = useCallback(async (opts: { notifyParams?: Record<string, string | number> } = {}) => {
    const q = state.quote
    if (!q || !address || busy.current) return
    busy.current = true
    set({ phase: 'checking', error: null })
    try {
      if (walletChain !== q.chainId) await switchChain(config, { chainId: q.chainId })
      const [tokenBal, gasBal] = await Promise.all([
        readContract(config, { address: q.token.address, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: q.chainId }),
        getBalance(config, { address, chainId: q.chainId }),
      ])
      const gasPrice = await getGasPrice(config, { chainId: q.chainId }).catch(() => 0n)
      const gasNeeded = state.jobId ? 0n : gasPrice * HIRE_GAS
      const shortfall = { token: tokenBal < BigInt(q.price), gas: gasBal.value === 0n || gasBal.value < gasNeeded }
      set({ balances: { token: tokenBal.toString(), gas: gasBal.value.toString(), gasNeeded: gasNeeded.toString() } })
      if (shortfall.token || shortfall.gas) { set({ phase: 'quoted', shortfall }); busy.current = false; return }
      set({ phase: 'signing', shortfall: null })

      // Quotes last at most 15 minutes; re-quote if this one is about to lapse.
      let quote = q
      let intentNow = state.jobId ? state.intent : null
      if (!state.jobId && quote.expiresAt - Date.now() / 1000 < 60 && lastRequest.current) {
        quote = await api<HireQuote>('hire/quote', lastRequest.current)
        intentNow = null
        set({ quote })
      }
      const intent = intentNow ?? state.intent ?? await api<IntentResponse>('hire/intent', { wallet: address, quoteId: quote.quoteId })
      set({ intent })
      const terms: HireTerms = { chainId: quote.chainId, provider: quote.provider, token: quote.token, price: BigInt(quote.price), priceLabel: quote.priceLabel, agentName: quote.agentName, expiredAt: BigInt(intent.expiredAt), description: intent.description }

      let jobId = state.jobId
      if (!jobId) {
        const createTx = await send(createJobCall(terms), 'createJob')
        mark('createJob', 'done', createTx)
        let bound: { jobId: string } | null = null
        for (let i = 0; i < 6 && !bound; i++) {
          bound = await api<{ jobId: string }>('hire/bind', { intentId: intent.intentId, txHash: createTx }).catch((e: { status?: number }) => {
            if (e.status === 409) return null
            throw e
          })
          if (!bound) await new Promise((r) => setTimeout(r, 3000))
        }
        if (!bound) throw Object.assign(new Error('bind'), { code: 'bind_pending' })
        jobId = bound.jobId
        set({ jobId })
      }

      const allowance = await readContract(config, { address: quote.token.address, abi: erc20Abi, functionName: 'allowance', args: [address, network(quote.chainId).commerce], chainId: quote.chainId })
      const calls = paymentCalls(terms, BigInt(jobId), allowance)
      if (!calls.some((c) => c.step === 'approve')) mark('approve', 'skipped')

      // EIP-5792: one atomic batch for the payment steps, when this wallet supports it here.
      let batched = false
      try {
        const caps = await getCapabilities(config, { account: address, chainId: quote.chainId }) as unknown as Record<string, unknown>
        type Atomic = { status?: string; supported?: boolean } | undefined
        const atomic = (caps?.['atomic'] as Atomic) ?? ((caps?.[String(quote.chainId)] as { atomic?: Atomic } | undefined)?.atomic)
        batched = atomic?.status === 'supported' || atomic?.status === 'ready' || atomic?.supported === true
      } catch { batched = false }

      if (batched) {
        for (const c of calls) mark(c.step, 'active')
        const { id } = await sendCalls(config, {
          chainId: quote.chainId, forceAtomic: true,
          calls: calls.map((c) => ({ to: c.to, data: encodeFunctionData({ abi: c.abi as Abi, functionName: c.functionName, args: c.args as unknown[] }) })),
        })
        for (const c of calls) mark(c.step, 'confirming')
        const res = await waitForCallsStatus(config, { id, timeout: 180_000 })
        if (res.status !== 'success') throw Object.assign(new Error('batch failed'), { code: 'reverted' })
        const tx = res.receipts?.[0]?.transactionHash as Hex | undefined
        for (const c of calls) mark(c.step, 'done', tx)
        set({ batched: true })
      } else {
        for (const c of calls) {
          const tx = await send(c, c.step)
          mark(c.step, 'done', tx)
        }
      }

      mark('notify', 'active')
      await api('hire/notify', { chainId: quote.chainId, jobId, params: opts.notifyParams })
        .then(() => mark('notify', 'done'))
        // The worker retries a lost notify; the job is paid and safe either way.
        .catch(() => mark('notify', 'done'))
      set({ phase: 'done' })
    } catch (err) {
      const e = err as { code?: string; detail?: string }
      const friendly = e.detail ? { code: e.code ?? 'hire', title: e.detail, action: 'Nothing more was charged. Try again.', retryable: true } : friendlyError(err)
      set((s) => ({ phase: 'error', error: friendly, steps: s.steps.map((st) => (st.status === 'active' ? { ...st, status: 'failed' } : st)) }))
    } finally {
      busy.current = false
    }
  }, [state.quote, state.intent, state.jobId, address, walletChain, config])

  /**
   * Read, before any signature, what the wallet holds on the quote's chain and whether it
   * can batch. Safe to call repeatedly; never opens the wallet.
   */
  const precheck = useCallback(async () => {
    const q = state.quote
    if (!q || !address) return
    try {
      const [tokenBal, gasBal, gasPrice] = await Promise.all([
        readContract(config, { address: q.token.address, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: q.chainId }),
        getBalance(config, { address, chainId: q.chainId }),
        getGasPrice(config, { chainId: q.chainId }).catch(() => 0n),
      ])
      const gasNeeded = state.jobId ? 0n : gasPrice * HIRE_GAS
      let batchCapable = false
      try {
        const caps = await getCapabilities(config, { account: address, chainId: q.chainId }) as unknown as Record<string, unknown>
        type Atomic = { status?: string; supported?: boolean } | undefined
        const atomic = (caps?.['atomic'] as Atomic) ?? ((caps?.[String(q.chainId)] as { atomic?: Atomic } | undefined)?.atomic)
        batchCapable = atomic?.status === 'supported' || atomic?.status === 'ready' || atomic?.supported === true
      } catch { batchCapable = false }
      set({
        balances: { token: tokenBal.toString(), gas: gasBal.value.toString(), gasNeeded: gasNeeded.toString() },
        shortfall: { token: tokenBal < BigInt(q.price), gas: gasBal.value === 0n || gasBal.value < gasNeeded },
        batchCapable,
      })
    } catch { /* a failed read shows no balance line; start() checks again before signing */ }
  }, [state.quote, state.jobId, address, config])

  /** Cancel an opened job before paying (registerJob or payment failed). */
  const cancel = useCallback(async () => {
    if (!state.jobId || !state.quote) return
    try {
      set({ phase: 'signing', error: null })
      await send(cancelCall(state.quote.chainId, BigInt(state.jobId)))
      set({ phase: 'idle', jobId: null, intent: null, error: null })
    } catch (err) {
      set({ phase: 'error', error: friendlyError(err) })
    }
  }, [state.jobId, state.quote])

  return { state, getQuote, start, cancel, reset, precheck }
}
