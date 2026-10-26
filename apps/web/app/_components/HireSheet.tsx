'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatUnits } from 'viem'
import { ArrowUpRight, Check, Clock, ShieldCheck } from 'lucide-react'
import { useHire, NETWORKS, type HireStep, type HireQuote, type StructuredTask } from '@marque/commerce/client'
import { AgentAvatar } from './AgentAvatar'
import { TaskForm, type TaskValue } from './hire/TaskForm'
import { NoWalletLine } from './pass/NoWalletLine'
import { AddressChip, Badge, Button, ButtonLink, Disclosure, ErrorNote, PriceTag, Sheet, TxStepper, type TxStep } from './ui'
import { toast } from '../../lib/toast'
import { trackJobStep } from '../../lib/track'
import { explorerTx } from '../../lib/network'
import { utcStamp } from '../../lib/time'
import { UNote } from './ui/UNote'
import { DeliverableView } from '../jobs/[chainId]/[jobId]/Deliverable'
import { TermsBeforeQuote } from './terms/TermsCell'
import { PracticeFunds } from './hire/PracticeFunds'

/**
 * The hire sheet (DESIGN-SYSTEM.md 8.5). Opens over any page from `?hire=<agentKey>`,
 * drops into the Chamber (money moves here), and walks a buyer from a task to a paid,
 * working job: task, live price, then every signature named in plain words before the
 * wallet opens (invariant 31). Readable with no wallet up to the price.
 */
interface SheetAgent {
  agentId: string; tokenId: string; registryChainId: number; name: string; category: string | null
  serviceId?: number
  preflight?: { version: 1; freePreview: 'reference_engine' | 'unsupported'; lastFailure: string | null; quotedAt: string | null }
  imageUrl: string | null
  owner: string | null; firstParty: boolean; state: string
  lastQuote: { chainId: number | null; priceLabel: string | null; signed: boolean | null; quotedAt: string | null } | null
  reviewWindowSeconds: number | null; platformFeeBP: number | null; reviewWindowChainId: number
  /** False for an agent that answers free at its own endpoint but takes no paid jobs. */
  sellsJobs?: boolean
  /** The seller's example task when it works from a JSON object (chainhelix). */
  taskExample?: string | null
  /** The same agent on the other network, offered as a network choice. */
  twin?: { agentId: string; chainId: 56 | 97 } | null
}

/** What a free run returned: the agent's own answer, never graded here. */
interface FreeRun { content: Record<string, unknown> | null; text: string | null; latencyMs: number; at: string; assumptions?: string[] }

const NET: Record<number, string> = { 56: 'BSC mainnet', 97: 'BSC testnet' }
const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const VERB: Record<string, string> = { health_factor: 'check', yield: 'find', grid: 'plan', rebalancing: 're-centre', security: 'review' }
const USDT = '0x55d398326f99059fF775485246999027B3197955'

const duration = (s: number) => (s >= 86_400 ? `${Math.round(s / 86_400)} days` : s >= 3600 ? `${Math.round(s / 3600)} hours` : `${Math.round(s / 60)} minutes`)
const bnb = (wei: string) => Number(formatUnits(BigInt(wei), 18))
const tokenAmt = (raw: string, d: number) => Number(formatUnits(BigInt(raw), d)).toLocaleString('en-US', { maximumFractionDigits: 4 })

/** Map the hook's steps onto the stepper, folding the payment steps into one line when the wallet batches. */
function stepperSteps(steps: HireStep[], chainId: number, batch: boolean): TxStep[] {
  const map = (s: HireStep): TxStep => ({
    id: s.id,
    label: s.label,
    state: s.status === 'todo' ? 'waiting' : s.status === 'active' ? 'wallet' : s.status,
    offchain: s.id === 'notify',
    ...(s.tx ? { txHash: s.tx, chainId } : {}),
    detail: s.status === 'skipped' ? 'Your allowance already covers this price.' : s.status === 'todo' ? s.detail : undefined,
  })
  if (!batch) return steps.map(map)
  const pay = steps.filter((s) => ['registerJob', 'setBudget', 'approve', 'fund'].includes(s.id))
  const rank = (s: HireStep['status']) => ({ failed: 5, active: 4, confirming: 3, todo: 2, skipped: 1, done: 0 }[s])
  const worst = pay.reduce((a, s) => (rank(s.status) > rank(a.status) ? s : a), pay[0]!)
  const allDone = pay.every((s) => s.status === 'done' || s.status === 'skipped')
  const batchStep: TxStep = {
    id: 'batch',
    label: 'Confirm protection, price and payment (one signature)',
    state: allDone ? 'done' : worst.status === 'todo' ? 'waiting' : worst.status === 'active' ? 'wallet' : worst.status === 'skipped' ? 'done' : worst.status,
    calls: pay.filter((s) => s.status !== 'skipped').map((s) => s.label),
    ...(pay.find((s) => s.tx)?.tx ? { txHash: pay.find((s) => s.tx)!.tx!, chainId } : {}),
  }
  return [map(steps[0]!), batchStep, ...steps.filter((s) => s.id === 'notify').map(map)]
}

/** A quote the Tender screen kept for this tab (sessionStorage), if it has more than a minute left. */
function readTenderQuote(tenderId: string, agentId: string): { quote: HireQuote; task: string; structured: StructuredTask | null } | null {
  try {
    const raw = sessionStorage.getItem(`marque:tender:${tenderId}`)
    if (!raw) return null
    const t = JSON.parse(raw) as { task: string; structured: StructuredTask | null; quotes: Record<string, HireQuote> }
    const q = t.quotes?.[agentId]
    if (!q || q.agentId !== agentId || q.expiresAt - Date.now() / 1000 < 60) return null
    return { quote: q, task: t.task, structured: t.structured ?? null }
  } catch { return null }
}

export function HireSheet() {
  const params = useSearchParams()
  const agentId = params.get('hire')
  const selectedService = params.get('serviceId')
  const tryFirst = params.get('try') === '1'
  const router = useRouter()
  const pathname = usePathname()
  const { address, isConnected, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { state, getQuote, adoptQuote, start, cancel, reset, precheck } = useHire()
  const tenderId = params.get('tender')
  const [agent, setAgent] = useState<SheetAgent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [task, setTask] = useState<TaskValue>({ task: '', ready: false, missing: null })
  const [spotBnb, setSpotBnb] = useState<number | null>(null)
  const [job, setJob] = useState<{ state: string | null; submittedAt: string | null } | null>(null)
  const [free, setFree] = useState<FreeRun | null>(null)
  const [trying, setTrying] = useState(false)
  const [tryError, setTryError] = useState<string | null>(null)
  const announced = useRef<string | null>(null)

  /** Run the task on the agent's free face: no wallet, no quote, nothing on chain. */
  const runFree = useCallback(async () => {
    if (!agentId || !task.ready) return
    setTrying(true)
    setTryError(null)
    setFree(null)
    try {
      const r = await fetch('/api/v1/hire/try', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId, task: task.task, serviceId: agent?.serviceId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'The free run did not complete. Try again in a minute.')
      setFree(j as FreeRun)
    } catch (e) {
      setTryError(e instanceof Error ? e.message : 'The free run did not complete. Try again in a minute.')
    } finally {
      setTrying(false)
    }
  }, [agentId, agent?.serviceId, task])

  useEffect(() => {
    if (!agentId) return
    reset()
    setAgent(null)
    setLoadError(null)
    setJob(null)
    setFree(null)
    setTryError(null)
    announced.current = null
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(() => controller.abort(), 15_000)
    const signal = controller.signal
    fetch(`/api/v1/hire/agent?agentId=${encodeURIComponent(agentId)}${selectedService !== null ? `&serviceId=${encodeURIComponent(selectedService)}` : ''}${tryFirst ? '&try=1' : ''}`, { signal })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.detail ?? 'This agent cannot be hired right now.')
        if (active) setAgent(j)
        // Hire from a Tender row: reuse that exact quote while it is still valid (SPEC-SUPPLY 5).
        const held = tenderId ? readTenderQuote(tenderId, agentId) : null
        if (active && held) {
          setTask({ task: held.task, ready: true, missing: null, structured: held.structured })
          adoptQuote(held.quote, { task: held.task, structured: held.structured })
        }
        // Hire from an assistant's plan_hire link: the exact quote Marque sealed for this task (SPEC-ACCESS 3.2).
        const sealed = params.get('held')
        if (active && !held && sealed) {
          fetch('/api/v1/hire/held', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ held: sealed }) })
            .then((r) => (r.ok ? r.json() : null))
            .then((h: { quote: HireQuote; task: string } | null) => {
              if (!active || !h || h.quote.agentId !== agentId) return
              setTask({ task: h.task, ready: true, missing: null, structured: null })
              adoptQuote(h.quote, { task: h.task, structured: null })
            })
            .catch(() => undefined)
        }
      })
      .catch((e: Error) => {
        if (active) setLoadError(signal.aborted ? 'The agent details took too long to load. Try again.' : e.message)
      })
      .finally(() => clearTimeout(timer))
    setSpotBnb(null)
    fetch('/api/v1/spot?symbol=BNB', { signal }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (active) setSpotBnb(typeof j?.price === 'number' ? j.price : null) }).catch(() => undefined)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [agentId, selectedService, tryFirst, loadAttempt]) // reset is stable

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString())
    next.delete('hire')
    next.delete('try')
    next.delete('serviceId')
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [params, pathname, router])

  const q = state.quote
  // Balances and batch support are read as soon as there is a price and a wallet: before any signature.
  useEffect(() => { if (q && address) void precheck() }, [q?.quoteId, address, walletChain]) // precheck reads the latest state

  // After payment the sheet becomes the head of the Job Room: watch the job until it is delivered.
  useEffect(() => {
    if (state.phase !== 'done' || !q || !state.jobId) return
    let stop = false
    const poll = async () => {
      try {
        const r = await fetch(`/api/v1/phase2/job/${q.chainId}/${state.jobId}`, { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          if (!stop) setJob({ state: j.state ?? null, submittedAt: j.events?.find((e: { name: string }) => e.name === 'JobSubmitted')?.at ?? null })
        }
      } catch { /* keep polling */ }
    }
    void poll()
    const t = setInterval(poll, 5000)
    return () => { stop = true; clearInterval(t) }
  }, [state.phase, state.jobId, q])

  useEffect(() => {
    if (state.phase === 'done' && q && state.jobId && announced.current !== state.jobId) {
      announced.current = state.jobId
      trackJobStep('funded', q.chainId, state.jobId)
      toast({ tone: 'success', title: 'Paid into escrow', body: `${q.priceLabel} is held until ${q.agentName} delivers.`, href: `/jobs/${q.chainId}/${state.jobId}`, hrefLabel: 'Open the job room' })
    }
  }, [state.phase, state.jobId, q])

  const delivered = job?.state && ['SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID'].includes(job.state)
  useEffect(() => {
    if (delivered && q && state.jobId) trackJobStep('delivered', q.chainId, state.jobId)
    if (delivered && q && state.jobId) toast({ tone: 'success', title: `${q.agentName} delivered`, body: 'Open the job room to read it and rate it.', href: `/jobs/${q.chainId}/${state.jobId}`, hrefLabel: 'Open the job room' })
  }, [delivered]) // announce once

  const signing = state.phase === 'signing' || state.phase === 'checking'
  const chainId = q?.chainId ?? agent?.lastQuote?.chainId ?? agent?.reviewWindowChainId ?? 56
  const refundDate = useMemo(() => (state.intent ? utcStamp(state.intent.refundAfter) : null), [state.intent])
  const steps = useMemo(() => stepperSteps(state.steps, chainId, Boolean(state.batchCapable) || state.batched), [state.steps, chainId, state.batchCapable, state.batched])
  const wrongChain = Boolean(q && isConnected && walletChain !== q.chainId)
  const short = state.shortfall

  if (!agentId) return null
  const verb = VERB[agent?.category ?? ''] ?? 'do'
  const gasBnb = state.balances ? bnb(state.balances.gasNeeded) : null

  const primary = (() => {
    if (!agent) return null
    if (state.phase === 'done' && q) return <ButtonLink href={`/jobs/${q.chainId}/${state.jobId}`} variant="primary" block>Open the job room</ButtonLink>
    if (!q) {
      const sells = agent.sellsJobs !== false
      // Try-first mode leads with the free run until there is an answer; after it, the price.
      if (((tryFirst && !free) || !sells) && agent.firstParty) {
        return (
          <Button variant="primary" block disabled={!task.ready || trying} loading={trying} onClick={runFree}>
            {free ? 'Run it free again' : 'Run it free'}
          </Button>
        )
      }
      return (
        <Button variant="primary" block disabled={!sells || !task.ready || state.phase === 'quoting'} loading={state.phase === 'quoting'} onClick={() => getQuote(agent.agentId, task.task, agent.serviceId, task.structured)}>
          Get a live price
        </Button>
      )
    }
    if (!isConnected) return (
      <>
        <Button variant="primary" block onClick={openConnectModal}>Connect a wallet to hire</Button>
        <NoWalletLine className="hs-nowallet" chainId={state.quote?.chainId === 56 ? 56 : 97} />
      </>
    )
    if (signing) return <Button variant="primary" block loading>Continue in wallet</Button>
    if (state.jobId && state.phase === 'error') return <Button variant="primary" block onClick={() => start()}>Continue the hire</Button>
    if (short?.token || short?.gas) return <Button variant="primary" block onClick={() => precheck()}>Check my balance again</Button>
    return (
      <Button variant="primary" block onClick={() => start()}>
        {wrongChain ? `Switch to ${NET[q.chainId]} and hire` : `Hire ${q.agentName} for ${q.priceLabel}`}
      </Button>
    )
  })()

  return (
    <Sheet
      open
      onClose={() => { if (!signing) close() }}
      label={`${tryFirst && agent?.firstParty && !q ? 'Try' : 'Hire'} ${agent?.name ?? 'an agent'}`}
      surface="chamber"
      title={<span className="t-label">{tryFirst && agent?.firstParty && !q ? 'Try free' : 'Hire'} · {NET[chainId] ?? 'BNB Chain'}</span>}
      footer={agent ? (
        <div className="hs-foot">
          {primary}
          {!q && task.missing && !task.ready ? <p className="hs-fine">{task.missing}</p> : null}
          {!q && agent.firstParty && agent.sellsJobs !== false && task.ready && !trying && state.phase !== 'quoting' ? (
            tryFirst && !free
              ? <button type="button" className="hs-quiet" onClick={() => getQuote(agent.agentId, task.task, agent.serviceId, task.structured)}>Skip the free run and get a live price</button>
              : !free ? <button type="button" className="hs-quiet" onClick={runFree}>Try it free first (no wallet)</button> : null
          ) : null}
          {q && !signing && state.phase !== 'done' && !state.jobId ? <button type="button" className="hs-quiet" onClick={reset}>Change the task</button> : null}
          {state.jobId && state.phase === 'error' ? <button type="button" className="hs-quiet" onClick={cancel}>Cancel open job {state.jobId}</button> : null}
        </div>
      ) : null}
    >
      {loadError ? <ErrorNote error={{ title: loadError, action: 'Retry loading, or choose another agent from the marketplace.' }} action={<><Button size="sm" onClick={() => setLoadAttempt((n) => n + 1)}>Retry loading</Button><ButtonLink href="/register" size="sm">Open the marketplace</ButtonLink></>} /> : null}
      {!agent && !loadError ? <div className="hs-loading" aria-busy="true"><span className="skel" style={{ height: 44, width: 44, borderRadius: 10 }} /><span className="skel" style={{ height: 18, width: '50%' }} /></div> : null}

      {agent ? (
        <div className="hs">
          <header className="hs-agent">
            <AgentAvatar id={agent.agentId} name={agent.name} category={agent.category} reference={agent.firstParty} imageUrl={agent.imageUrl} size={44} />
            <div className="hs-agent-txt">
              <h2 className="hs-name">{agent.name}</h2>
              <p className="hs-meta">{CAT[agent.category ?? ''] ?? 'Agent'} · ERC-8004 #{agent.tokenId}</p>
            </div>
            {agent.firstParty ? <Badge kind="reference" /> : null}
          </header>
          {agent.twin ? (
            <div className="hs-net" role="radiogroup" aria-label="Network for this hire">
              {([56, 97] as const).map((c) => {
                const on = agent.registryChainId === c
                return (
                  <button key={c} type="button" role="radio" aria-checked={on} data-on={on || undefined} data-lane={c === 56 ? 'main' : 'practice'}
                    onClick={() => {
                      if (on || !agent.twin) return
                      const next = new URLSearchParams(params.toString()); next.set('hire', agent.twin.agentId); next.delete('serviceId')
                      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
                    }}>
                    <b>{c === 56 ? 'Mainnet' : 'Testnet'}</b><span>{c === 56 ? 'real money' : 'free practice, counts for Set and Earn'}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          {agent.registryChainId === 97 ? (
            <p className="hs-lane" role="note">BSC testnet · test tokens, no real value · counts for Set and Earn.{isConnected && walletChain !== 97 ? ' Your wallet will switch to BSC testnet for this hire only.' : ''}</p>
          ) : null}

          {!agent.firstParty ? <p className="hs-fine">Service {agent.serviceId ?? 'unknown'}. Free execution has not been verified for this outside service. Requesting a price does not commission work or authorize payment.</p> : null}
          {!q && agent.preflight?.lastFailure ? <p className="hs-fine">{agent.preflight.lastFailure === 'expired_or_unproven' ? 'The stored price expired or lacks current validity evidence.' : 'The last stored price did not pass its checks.'} A fresh quote is required.</p> : null}
          {!q && state.error ? <ErrorNote error={state.error} /> : null}

          {state.phase === 'done' && q ? (
            <section className="hs-done" aria-live="polite">
              <div className="hs-done-head">
                <span className="hs-done-ico" data-state={delivered ? 'done' : 'working'}>{delivered ? <Check /> : <Clock />}</span>
                <div>
                  <h3>{delivered ? `${q.agentName} delivered` : state.notification === 'accepted' ? `${q.agentName} accepted the work request` : 'Job funded; provider response pending'}</h3>
                  <p>{delivered
                    ? `Job ${state.jobId} is delivered. Read the answer and rate it in the job room.`
                    : `Job ${state.jobId} is funded. Your ${q.priceLabel} is held in BNB Chain's escrow. Funding is separate from delivery and payment release.`}</p>
                  {!delivered && state.notification !== 'accepted' ? <p>{state.notification === 'rejected' ? 'The provider rejected the work request. Open the job room for its current state and refund date.' : 'Provider acceptance has not been confirmed. Open the job room to follow delivery, retry status and the refund date.'}</p> : null}
                </div>
              </div>
              {refundDate && !delivered ? <p className="hs-note">If it does not deliver, you can reclaim the payment from {refundDate}.</p> : null}
              <TxStepper steps={steps} label="Hire steps" />
            </section>
          ) : (
            <>
              <section className="hs-block" aria-labelledby="hs-1">
                <h3 id="hs-1" className="hs-h"><span className="hs-n">1</span>What should {agent.name} {verb}?</h3>
                {q ? (
                  <p className="hs-task">{task.task || 'Your task'}</p>
                ) : (
                  <TaskForm category={agent.category} agentName={agent.name} onChange={setTask} disabled={state.phase === 'quoting'} taskExample={agent.taskExample} />
                )}
              </section>

              {(free || trying || tryError) && !q ? (
                <section className="hs-block hs-free" aria-labelledby="hs-free" aria-live="polite">
                  <h3 id="hs-free" className="hs-h"><span className="hs-n hs-n--free">F</span>Free answer</h3>
                  {trying ? <p className="hs-note">Asking {agent.name} at its own endpoint. Nothing is signed or paid.</p> : null}
                  {tryError ? <ErrorNote error={{ title: tryError, action: 'Change the task or try again. A paid hire is not affected.' }} /> : null}
                  {free ? (
                    <>
                      <p className="hs-note">
                        {agent.name} answered in {free.latencyMs < 1000 ? `${free.latencyMs} ms` : `${(free.latencyMs / 1000).toFixed(1)} s`}, free, at its own endpoint.
                        {agent.firstParty ? ' A paid job runs the same engine and posts this answer on chain with a hash.' : ' This is the agent\'s own reply, shown as it gave it; Marque has not graded it.'}
                      </p>
                      {free.assumptions && free.assumptions.length > 0 ? (
                        <div className="hs-assume"><p>Settings your task left out, and what it used:</p><ul>{free.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
                      ) : null}
                      <div className="hs-free-body">
                        {free.content ? <DeliverableView category={agent.category} content={free.content} /> : <p className="hs-free-text">{free.text}</p>}
                      </div>
                      {agent.sellsJobs === false ? <p className="hs-note">{agent.name} does not take paid jobs through BNB Chain&apos;s escrow, so there is no Hire here.</p> : null}
                    </>
                  ) : null}
                </section>
              ) : null}

              {agent.sellsJobs === false ? null : (
              <section className="hs-block" aria-labelledby="hs-2">
                <h3 id="hs-2" className="hs-h"><span className="hs-n">2</span>Price</h3>
                {q ? (
                  <div className="hs-price">
                    <p className="hs-note">{q.signed === true ? `Signed by ${q.agentName} for this exact task.` : q.signed === false ? 'Unsigned quote: the provider matches the selected identity. This does not prove signed acceptance of your task.' : 'Signature evidence unavailable. Request a fresh quote.'} {q.expirySource === 'server_assigned' ? 'The acceptance deadline is assigned by Marque because the provider omitted one.' : 'The displayed expiry limits when this quote can be used.'}</p>
                    <div className="hs-price-row">
                      <PriceTag amount={q.priceLabel.split(' ')[0]!} token={q.token.symbol} source={{ kind: 'quote', expiresAt: q.expiresAt * 1000 }} />
                      {q.estimatedCompletionSeconds ? <span className="hs-eta">delivers in about {q.estimatedCompletionSeconds < 120 ? `${q.estimatedCompletionSeconds} s` : duration(q.estimatedCompletionSeconds)}<span className="hs-eta-src">agent&apos;s estimate</span></span> : null}
                    </div>
                    {q.token.symbol === 'U' ? <UNote /> : null}
                    {q.criteria && q.criteria.texts.length ? (
                      <div className="hs-terms">
                        <p><b>Terms Marque checks after delivery</b> · {q.criteria.signed ? `signed by ${q.agentName} with this price` : `set by you, not signed by ${q.agentName}`}</p>
                        <ul>{q.criteria.texts.map((t) => <li key={t}>{t}</li>)}</ul>
                      </div>
                    ) : null}
                    <dl className="hs-facts">
                      <div><dt>Escrow fee</dt><dd>{agent.platformFeeBP === null ? 'unknown' : `${agent.platformFeeBP / 100}%`}</dd></div>
                      <div><dt>Network fees</dt><dd>{gasBnb !== null ? `up to ${gasBnb.toFixed(5)} ${q.chainId === 97 ? 'tBNB, test BNB with no value' : 'BNB'}${spotBnb && q.chainId !== 97 ? ` (about $${(gasBnb * spotBnb).toFixed(2)})` : ''}` : 'paid in BNB, shown by your wallet'}</dd></div>
                      <div><dt>If it does not deliver</dt><dd>{refundDate ? `Reclaim your payment from ${refundDate}` : agent.reviewWindowSeconds ? `Reclaim your payment once the job's deadline passes, about ${duration(agent.reviewWindowSeconds)} after you pay` : 'Reclaim your payment once the job\'s deadline passes'}</dd></div>
                    </dl>
                    {q.assumptions && q.assumptions.length > 0 ? (
                      <div className="hs-assume">
                        <p>Your task left some settings out. {q.agentName} will use these, and its answer says so:</p>
                        <ul>{q.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="hs-note">
                    No wallet needed to see the price. {agent.name} prices your exact task, and the quote holds for a few minutes.
                    <TermsBeforeQuote agentId={agent.agentId} network={(id) => NET[id ?? 56] ?? 'BNB Smart Chain'} />
                  </p>
                )}
              </section>
              )}

              {q ? (
                <section className="hs-block" aria-labelledby="hs-3">
                  <h3 id="hs-3" className="hs-h"><span className="hs-n">3</span>Pay and hire</h3>
                  {isConnected && address ? (
                    <div className="hs-wallet" data-short={short?.token || short?.gas ? '' : undefined}>
                      <AddressChip value={address} chainId={q.chainId} label="You" />
                      {state.balances ? (
                        <>
                          <span className="hs-bal" data-ok={!short?.token}>{short?.token ? '' : <Check aria-hidden="true" />}{tokenAmt(state.balances.token, q.token.decimals)} {q.chainId === 97 ? 'test ' : ''}{q.token.symbol}</span>
                          <span className="hs-bal" data-ok={!short?.gas}>{short?.gas ? '' : <Check aria-hidden="true" />}{bnb(state.balances.gas).toFixed(4)} {q.chainId === 97 ? 'tBNB' : 'BNB'} for fees</span>
                        </>
                      ) : <span className="hs-bal">Reading balances…</span>}
                    </div>
                  ) : null}
                  {q.chainId === 97 && address && (short?.token || short?.gas) ? (
                    <PracticeFunds address={address} needGas={Boolean(short?.gas)} needToken={Boolean(short?.token)} onDone={() => { void precheck() }} />
                  ) : null}
                  {short?.token && q.chainId !== 97 ? (
                    <ErrorNote
                      error={{ title: `You need ${q.priceLabel} and have ${state.balances ? tokenAmt(state.balances.token, q.token.decimals) : '0'} ${q.token.symbol}.`, action: `Swap USDT for ${q.token.symbol} on PancakeSwap, then check again.` }}
                      action={<ButtonLink size="sm" href={`https://pancakeswap.finance/swap?chain=bsc&inputCurrency=${USDT}&outputCurrency=${q.token.address}`} external>Swap to {q.token.symbol}<ArrowUpRight /></ButtonLink>}
                    />
                  ) : null}
                  {short?.gas && q.chainId !== 97 ? (
                    <ErrorNote error={{ title: 'Add a little BNB for network fees.', action: `This hire needs up to ${gasBnb?.toFixed(5) ?? 'a little'} BNB on ${NET[q.chainId]}. Send some to this wallet, then check again.` }} />
                  ) : null}
                  <TxStepper steps={steps} label="Hire steps" onRetry={() => start()} />
                  {state.error && !state.steps.some((s) => s.status === 'failed') ? <ErrorNote error={state.error} /> : null}
                  {state.error && state.steps.some((s) => s.status === 'failed') ? <p className="hs-note">{state.error.title} {state.error.action}</p> : null}
                  <Disclosure summary={<span className="hs-controls"><ShieldCheck aria-hidden="true" />Your controls</span>}>
                    <ul className="hs-list">
                      <li>You approve exactly {q.priceLabel}, never an open-ended allowance.</li>
                      <li>The money sits in BNB Chain&apos;s ERC-8183 escrow contract <AddressChip value={NETWORKS[q.chainId].commerce} chainId={q.chainId} />, not with Marque.</li>
                      <li>Until you pay, you can cancel the job; it costs only the network fee.</li>
                      <li>If {q.agentName} does not deliver, you reclaim the payment after the deadline{refundDate ? ` (${refundDate})` : ''}.</li>
                      <li>After delivery you have a review window to report a problem before payment is released.</li>
                      <li>You can revoke any leftover allowance to zero in <a className="link" href="/me#controls">My Marque</a>. Money already in escrow is not affected.</li>
                    </ul>
                  </Disclosure>
                </section>
              ) : null}
            </>
          )}
          {state.phase === 'done' && q && state.steps.find((s) => s.id === 'fund')?.tx ? (
            <p className="hs-fine">Payment <a className="link link--chain" href={explorerTx(q.chainId, state.steps.find((s) => s.id === 'fund')!.tx!)} target="_blank" rel="noreferrer">on BscScan</a>. Marque never holds your funds or keys.</p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}
