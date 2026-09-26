'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { readContract, switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { erc20Abi, type Hex } from 'viem'
import {
  approvalNeeded, approveCall, cancelCall, claimRefundCall, disputeCall, friendlyError, fundCall, NETWORKS,
  registerJobCall, setBudgetCall, useRate, type Call, type ChainId, type FriendlyError,
} from '@marque/commerce/client'
import { Button, ButtonLink, ErrorNote, Modal, StarInput, TxStepper, type TxStep } from '../../../_components/ui'
import { toast } from '../../../../lib/toast'
import { explorerTx } from '../../../../lib/network'
import { utcStamp } from '../../../../lib/time'

/**
 * What the buyer can do from here, by state (DESIGN-SYSTEM.md 8.6). Every write is
 * signed by the wallet that opened the job; the page refreshes from the chain until
 * the job reaches a final state.
 */
export interface JobActionProps {
  chainId: ChainId
  jobId: string
  state: string
  client: string | null
  agentName: string
  agentKey: string | null
  priceLabel: string | null
  resume: { priceRaw: string; token: { address: `0x${string}`; symbol: string; decimals: number; isDefault: boolean }; registered: boolean; budgetSet: boolean } | null
  refundFrom: number | null
  reviewEndsAt: number | null
  submitDeadline: number | null
  rated: { stars: number; tx: string | null } | null
}

const TERMINAL = new Set(['CANCELLED', 'PAID', 'REFUNDED'])

export function JobActions(p: JobActionProps) {
  const router = useRouter()
  const config = useConfig()
  const { address, isConnected, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { state: rateState, rate } = useRate()
  const [stars, setStars] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<FriendlyError | null>(null)
  const [steps, setSteps] = useState<TxStep[] | null>(null)
  const [confirmDispute, setConfirmDispute] = useState(false)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => { setNow(Math.floor(Date.now() / 1000)); const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000); return () => clearInterval(t) }, [])
  // The page is the chain's view of the job: re-read it until nothing more can happen.
  useEffect(() => {
    if (TERMINAL.has(p.state)) return
    const t = setInterval(() => router.refresh(), 8000)
    return () => clearInterval(t)
  }, [p.state, router])

  const isClient = Boolean(address && p.client && address.toLowerCase() === p.client.toLowerCase())
  const refundable = now !== null && p.refundFrom !== null && now >= p.refundFrom && (p.state === 'FUNDED' || p.state === 'EXPIRED')
  const disputable = now !== null && p.reviewEndsAt !== null && now < p.reviewEndsAt && p.state === 'SUBMITTED'
  const late = now !== null && p.submitDeadline !== null && now > p.submitDeadline && p.state === 'FUNDED'
  const canRate = ['SUBMITTED', 'COMPLETED', 'PAID', 'DISPUTED'].includes(p.state) && !p.rated && rateState.phase !== 'done'

  const send = async (c: Call, id: string) => {
    if (walletChain !== c.chainId) await switchChain(config, { chainId: c.chainId })
    setSteps((s) => s?.map((x) => (x.id === id ? { ...x, state: 'wallet' } : x)) ?? null)
    const hash = await writeContract(config, { address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[], chainId: c.chainId })
    setSteps((s) => s?.map((x) => (x.id === id ? { ...x, state: 'confirming', txHash: hash, chainId: c.chainId } : x)) ?? null)
    const r = await waitForTransactionReceipt(config, { hash, chainId: c.chainId })
    if (r.status !== 'success') throw Object.assign(new Error('reverted'), { code: 'reverted' })
    setSteps((s) => s?.map((x) => (x.id === id ? { ...x, state: 'done' } : x)) ?? null)
    return hash as Hex
  }

  const run = async (what: string, fn: () => Promise<Hex | void>, success: { title: string; body: string }) => {
    setBusy(what); setError(null)
    try {
      const tx = await fn()
      toast({ tone: 'success', ...success, ...(tx ? { href: explorerTx(p.chainId, tx) } : {}) })
      router.refresh()
    } catch (err) {
      const f = friendlyError(err)
      setError(f)
      setSteps((s) => s?.map((x) => (x.state === 'wallet' || x.state === 'confirming' ? { ...x, state: 'failed', error: f } : x)) ?? null)
    } finally { setBusy(null) }
  }

  /** Finish an opened, unpaid job: protection, price, exact allowance, payment, then tell the agent. */
  const resume = () => run('resume', async () => {
    const r = p.resume!
    const price = BigInt(r.priceRaw)
    const label = p.priceLabel ?? `${r.token.symbol}`
    const allowance = await readContract(config, { address: r.token.address, abi: erc20Abi, functionName: 'allowance', args: [address!, NETWORKS[p.chainId].commerce], chainId: p.chainId })
    const need = approvalNeeded(allowance, price)
    const plan: Array<{ id: string; call: Call } | null> = [
      r.registered ? null : { id: 'registerJob', call: registerJobCall(p.chainId, BigInt(p.jobId)) },
      r.budgetSet ? null : { id: 'setBudget', call: setBudgetCall(p.chainId, BigInt(p.jobId), price, label) },
      need === null ? null : { id: 'approve', call: approveCall(p.chainId, r.token, need, label) },
      { id: 'fund', call: fundCall(p.chainId, BigInt(p.jobId), price, label) },
    ]
    const todo = plan.filter((x): x is { id: string; call: Call } => x !== null)
    setSteps([...todo.map((x) => ({ id: x.id, label: x.call.label, state: 'waiting' as const })), { id: 'notify', label: `Ask ${p.agentName} to start`, state: 'waiting', offchain: true }])
    let last: Hex | undefined
    for (const x of todo) last = await send(x.call, x.id)
    setSteps((s) => s?.map((x) => (x.id === 'notify' ? { ...x, state: 'wallet' } : x)) ?? null)
    await fetch('/api/v1/hire/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: p.chainId, jobId: p.jobId }) }).catch(() => undefined)
    setSteps((s) => s?.map((x) => (x.id === 'notify' ? { ...x, state: 'done' } : x)) ?? null)
    return last
  }, { title: 'Paid into escrow', body: `${p.agentName} has been asked to start.` })

  const one = (id: string, call: Call, success: { title: string; body: string }) => run(id, async () => {
    setSteps([{ id, label: call.label, state: 'waiting' }])
    return send(call, id)
  }, success)

  const submitRating = async () => {
    if (!address || !stars) return
    const tx = await rate({ chainId: p.chainId, jobId: p.jobId, wallet: address, stars, comment: comment.trim() || undefined })
    if (tx) { toast({ tone: 'success', title: 'Rated on chain', body: `${stars} of 5 for ${p.agentName}, from your wallet.`, href: explorerTx(p.chainId, tx) }); router.refresh() }
  }

  const hireAgain = p.agentKey ? <ButtonLink href={`/register?hire=${encodeURIComponent(p.agentKey)}`}>Hire {p.agentName} again</ButtonLink> : null
  const hireOther = <ButtonLink href="/register">Hire another agent</ButtonLink>

  const needsWallet = !TERMINAL.has(p.state) || canRate
  const gate = !isConnected ? (
    <div className="ja-gate"><p>Connect the wallet that opened this job to act on it.</p><Button variant="primary" onClick={openConnectModal}>Connect wallet</Button></div>
  ) : !isClient ? (
    <p className="ja-note">Only the wallet that opened this job ({p.client ? `${p.client.slice(0, 6)}…${p.client.slice(-4)}` : 'unknown'}) can act on it. You are connected as {address!.slice(0, 6)}…{address!.slice(-4)}.</p>
  ) : null

  return (
    <div className="ja">
      {needsWallet && gate ? gate : null}

      {isClient && p.state === 'OPEN' ? (
        <div className="ja-row">
          {p.resume ? <Button variant="primary" loading={busy === 'resume'} disabled={busy !== null} onClick={resume}>Finish paying {p.priceLabel ?? ''}</Button> : null}
          <Button variant="danger" loading={busy === 'cancel'} disabled={busy !== null} onClick={() => one('cancel', cancelCall(p.chainId, BigInt(p.jobId)), { title: 'Job cancelled', body: 'Nothing was charged.' })}>Cancel job</Button>
        </div>
      ) : null}

      {isClient && refundable ? (
        <div className="ja-row">
          <Button variant="primary" loading={busy === 'refund'} disabled={busy !== null} onClick={() => one('refund', claimRefundCall(p.chainId, BigInt(p.jobId)), { title: 'Payment reclaimed', body: `${p.priceLabel ?? 'Your payment'} is back in your wallet.` })}>Reclaim {p.priceLabel ?? 'your payment'}</Button>
        </div>
      ) : null}
      {p.state === 'FUNDED' && late && !refundable && p.refundFrom ? <p className="ja-note">{p.agentName} has not delivered in time. You can reclaim your payment from {utcStamp(p.refundFrom * 1000)}.</p> : null}

      {isClient && disputable ? (
        <div className="ja-row">
          <Button variant="quiet" onClick={() => setConfirmDispute(true)} disabled={busy !== null}>Report a problem</Button>
        </div>
      ) : null}

      {isClient && canRate ? (
        <div className="ja-rate">
          <span className="t-label">Rate {p.agentName}</span>
          <StarInput value={stars} onChange={setStars} legend={`Rate ${p.agentName}`} disabled={rateState.phase === 'preparing' || rateState.phase === 'signing'} />
          <textarea className="taskform-text ja-comment" rows={2} maxLength={280} placeholder="What was good or bad about it? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button variant="primary" disabled={!stars || rateState.phase === 'preparing' || rateState.phase === 'signing'} loading={rateState.phase === 'preparing' || rateState.phase === 'signing'} onClick={submitRating}>
            {stars ? `Rate ${stars} of 5 on chain` : 'Choose a rating'}
          </Button>
          <p className="ja-fine">Your wallet signs the rating to BNB Chain&apos;s ERC-8004 reputation registry. It counts as a verified-buyer rating because you paid for this job.</p>
          {rateState.error ? <ErrorNote error={rateState.error} /> : null}
        </div>
      ) : null}

      {['COMPLETED', 'PAID'].includes(p.state) || (p.state === 'SUBMITTED' && !disputable && !canRate) ? <div className="ja-row">{hireAgain}</div> : null}
      {['REFUNDED', 'REJECTED', 'CANCELLED'].includes(p.state) ? <div className="ja-row">{hireOther}</div> : null}

      {steps ? <TxStepper steps={steps} label="Transactions" /> : null}
      {error && !steps?.some((s) => s.state === 'failed') ? <ErrorNote error={error} /> : null}

      <Modal open={confirmDispute} onClose={() => setConfirmDispute(false)} title="Report a problem with this delivery?"
        footer={<><Button onClick={() => setConfirmDispute(false)}>Keep the delivery</Button><Button variant="danger" onClick={() => { setConfirmDispute(false); void one('dispute', disputeCall(p.chainId, BigInt(p.jobId)), { title: 'Problem reported', body: 'Independent voters will decide. Payment stays in escrow meanwhile.' }) }}>Report a problem</Button></>}>
        <p className="ja-note">This opens a dispute on BNB Chain&apos;s escrow. Independent voters decide; if they reject the delivery you are refunded, otherwise {p.agentName} is paid. Payment stays in escrow until then. It costs only the network fee.</p>
      </Modal>
    </div>
  )
}
