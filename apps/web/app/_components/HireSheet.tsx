'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useHire, explorerTx, type HireStep } from '@marque/commerce/client'
import styles from './HireSheet.module.css'

/**
 * The hire sheet (P2-02 minimal; P2-08 restyles). Opens over any page from
 * `?hire=<agentId>`. Readable without a wallet up to the price; every signature is
 * named in plain words before the wallet opens (AGENTS invariant 31).
 */
interface SheetAgent {
  agentId: string; tokenId: string; registryChainId: number; name: string; category: string | null
  owner: string | null; firstParty: boolean; state: string
  lastQuote: { chainId: number | null; priceLabel: string | null; signed: boolean | null; quotedAt: string | null } | null
}

const PRESET: Record<string, string> = {
  yield: 'Where should 1000 USDT earn the most on BNB Chain right now, after switching costs?',
  grid: 'Plan a grid for BNB/USDT between 550 and 700 with 500 USDT, stop below 520.',
  rebalancing: 'My PancakeSwap V3 position has drifted out of range. What range and swaps restore it?',
  health_factor: 'What is the health factor of Venus account 0x... and what repay restores it to 2.5?',
  security: 'Review token 0x... for risky approvals and privileged functions.',
}

const NET: Record<number, string> = { 56: 'BSC mainnet', 97: 'BSC testnet' }
const U_FAUCET = 'https://united-coin-u.github.io/u-faucet/'
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

function useCountdown(until: number | null) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!until) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])
  if (!until || now === null) return null
  const s = Math.max(0, Math.floor(until - now / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function StepRow({ s, chainId }: { s: HireStep; chainId: number }) {
  return (
    <li className={`${styles.step} ${styles[`step_${s.status}`] ?? ''}`}>
      <span className={styles.stepDot} aria-hidden="true" />
      <span className={styles.stepText}>
        <span className={styles.stepLabel}>{s.label}{s.status === 'skipped' ? ' (not needed)' : ''}</span>
        <span className={styles.stepDetail}>{s.detail}</span>
      </span>
      {s.tx && <a className={styles.stepTx} href={explorerTx(chainId, s.tx)} target="_blank" rel="noreferrer">View</a>}
    </li>
  )
}

export function HireSheet() {
  const params = useSearchParams()
  const agentId = params.get('hire')
  const router = useRouter()
  const pathname = usePathname()
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { state, getQuote, start, cancel, reset } = useHire()
  const [agent, setAgent] = useState<SheetAgent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [task, setTask] = useState('')
  const countdown = useCountdown(state.quote?.expiresAt ?? null)

  useEffect(() => {
    if (!agentId) return
    reset()
    setAgent(null)
    setLoadError(null)
    fetch(`/api/v1/hire/agent?agentId=${encodeURIComponent(agentId)}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.detail ?? 'This agent cannot be hired right now.')
        setAgent(j)
        setTask(PRESET[j.category ?? ''] ?? '')
      })
      .catch((e: Error) => setLoadError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable in intent; re-run only for a new agent
  }, [agentId])

  const close = () => {
    const next = new URLSearchParams(params.toString())
    next.delete('hire')
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  useEffect(() => {
    if (!agentId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state.phase !== 'signing') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const q = state.quote
  const chainId = q?.chainId ?? agent?.lastQuote?.chainId ?? 56
  const refundDate = useMemo(() => (state.intent ? new Date(state.intent.refundAfter).toUTCString().replace(' GMT', ' UTC') : null), [state.intent])
  if (!agentId) return null
  const signing = state.phase === 'signing' || state.phase === 'checking'

  return (
    <div className={styles.overlay} role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !signing) close() }}>
      <aside className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="hire-title">
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>Hire through ERC-8183 escrow on {NET[chainId] ?? 'BNB Chain'}</p>
            <h2 id="hire-title" className={styles.title}>{agent?.name ?? 'Loading agent'}</h2>
            {agent && (
              <p className={styles.meta}>
                ERC-8004 #{agent.tokenId}{agent.category ? `, ${agent.category.replace('_', ' ')}` : ''}
                {agent.firstParty ? ', Marque reference agent' : ''}
              </p>
            )}
          </div>
          <button type="button" className={styles.close} onClick={close} disabled={signing} aria-label="Close">Close</button>
        </header>

        {loadError && <p className={styles.error}>{loadError}</p>}

        {agent && state.phase !== 'done' && (
          <section className={styles.block}>
            <label className={styles.label} htmlFor="hire-task">What should {agent.name} do?</label>
            <textarea id="hire-task" className={styles.task} rows={3} maxLength={1200} value={task} disabled={!!q}
              onChange={(e) => setTask(e.target.value)} />
            {!q && (
              <button type="button" className="btn btn--primary" disabled={task.trim().length < 3 || state.phase === 'quoting'}
                onClick={() => getQuote(agent.agentId, task.trim())}>
                {state.phase === 'quoting' ? 'Asking the agent for a price' : 'Get a live price'}
              </button>
            )}
            {!q && agent.lastQuote?.priceLabel && (
              <p className={styles.note}>Last live quote: {agent.lastQuote.priceLabel} on {NET[agent.lastQuote.chainId ?? 56]}. Prices come only from the agent.</p>
            )}
          </section>
        )}

        {q && state.phase !== 'done' && (
          <section className={styles.block}>
            <div className={styles.price}>
              <span className={`mono ${styles.priceValue}`}>{q.priceLabel}</span>
              <span className={styles.priceNote}>
                Live quote from {q.agentName}, {q.signed ? 'signed by its registered wallet' : 'naming its registered wallet as payee'}
                {countdown ? `, valid ${countdown}` : ''}
              </span>
            </div>
            <dl className={styles.facts}>
              <dt>Network</dt><dd>{NET[q.chainId]}</dd>
              <dt>Paid to</dt><dd className="mono">{short(q.provider)} (the agent&apos;s ERC-8004 wallet)</dd>
              <dt>Held by</dt><dd>BNB Chain&apos;s ERC-8183 escrow contract until delivery</dd>
              <dt>If nothing is delivered</dt><dd>{refundDate ? `You can reclaim it after ${refundDate}` : 'You can reclaim it after the job expires; the date is set when the job opens'}</dd>
            </dl>
          </section>
        )}

        {q && state.steps.length > 0 && (
          <section className={styles.block}>
            <p className={styles.label}>Your wallet will ask you to sign, in this order</p>
            <ol className={styles.steps}>{state.steps.map((s) => <StepRow key={s.id} s={s} chainId={q.chainId} />)}</ol>
            {state.batched && <p className={styles.note}>Your wallet signed the payment steps as one batch.</p>}
          </section>
        )}

        {state.shortfall && q && (
          <section className={`${styles.block} ${styles.warn}`}>
            {state.shortfall.token && (
              <p>You need {q.priceLabel} in this wallet on {NET[q.chainId]}.{' '}
                {q.chainId === 97
                  ? <a href={U_FAUCET} target="_blank" rel="noreferrer">Get test U from the faucet</a>
                  : <a href={`https://pancakeswap.finance/swap?chain=bsc&inputCurrency=0x55d398326f99059fF775485246999027B3197955&outputCurrency=${q.token.address}`} target="_blank" rel="noreferrer">Swap for {q.token.symbol} on PancakeSwap</a>}
              </p>
            )}
            {state.shortfall.gas && <p>You also need a little BNB on {NET[q.chainId]} to pay network fees.</p>}
          </section>
        )}

        {state.error && (
          <section className={`${styles.block} ${styles.errorBox}`} role="alert">
            <p className={styles.errorTitle}>{state.error.title}</p>
            <p>{state.error.action}</p>
            {state.jobId && <button type="button" className="btn btn--quiet btn--sm" onClick={cancel}>Cancel job {state.jobId} (nothing is charged)</button>}
          </section>
        )}

        {state.phase === 'done' && q && (
          <section className={`${styles.block} ${styles.done}`}>
            <h3 className={styles.doneTitle}>Job {state.jobId} is paid and {q.agentName} is working</h3>
            <p>Your {q.priceLabel} is held in escrow. The agent delivers on chain, usually within {q.estimatedCompletionSeconds ? `${Math.max(1, Math.round(q.estimatedCompletionSeconds / 60))} minutes` : 'minutes'}.</p>
            {refundDate && <p className={styles.note}>If it does not deliver, you can reclaim the payment after {refundDate}.</p>}
            <a className="btn btn--primary" href={`/jobs/${q.chainId}/${state.jobId}`}>Open the job</a>
          </section>
        )}

        {q && state.phase !== 'done' && (
          <footer className={styles.foot}>
            {!isConnected ? (
              <button type="button" className="btn btn--primary" onClick={openConnectModal}>Connect a wallet to hire</button>
            ) : (
              <button type="button" className="btn btn--primary" disabled={signing} onClick={() => start()}>
                {signing ? 'Follow the steps in your wallet' : state.jobId ? 'Continue the hire' : `Hire ${q.agentName} for ${q.priceLabel}`}
              </button>
            )}
            <p className={styles.fine}>Marque never holds your funds or keys. Every approval is for the exact price.</p>
          </footer>
        )}
      </aside>
    </div>
  )
}
