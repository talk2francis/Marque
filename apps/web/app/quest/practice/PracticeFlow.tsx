'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAccount, useBalance, useConnect, useReadContract } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { erc20Abi } from 'viem'
import { NETWORKS } from '@marque/commerce/client'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { PracticeFunds } from '../../_components/hire/PracticeFunds'
import { EXAMPLE_LOAN, EXAMPLE_POSITION, EXAMPLE_POSITION_OWNER } from '../../_components/hire/TaskForm'
import { MARQUE_PASS_ID, passCapableBrowser } from '../../_components/pass/connector'
import { saveBrief, type Brief } from '../../../lib/brief'
import { rememberQuestAddress } from '../../_components/campaign/store'
import styles from './practice.module.css'

/**
 * A free practice hire for Set and Earn, built for a phone: a wallet (a Marque Pass in ten seconds, or any wallet),
 * test tokens from BNB Chain's own faucet (Marque sends nothing), one agent this wallet has not hired yet, and the hire
 * sheet with a ready task. The deposit is timed from the moment this page opened, so the two-minute promise is measured.
 */
interface Pick { agentId: string; tokenId: string | null; name: string; category: string | null; price: string | null; outside: boolean; listed: boolean; reference: boolean; imageUrl: string | null; passed: boolean }
interface Practice { address: string | null; team: boolean; hires: { agents: number; required: { agents: number; marketplaces: number }; marketplaces: string[] } | null; picks: Pick[]; available: number }

const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid trading', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
// The task each category gets, ready to send and editable in the sheet. Accounts and positions are real and public.
const BRIEF: Record<string, Brief> = {
  health_factor: { category: 'health_factor', address: EXAMPLE_LOAN, targetHf: 2.5 },
  rebalancing: { category: 'rebalancing', positionId: EXAMPLE_POSITION, address: EXAMPLE_POSITION_OWNER },
  yield: { category: 'yield', asset: 'USDT', amount: 1000 },
  grid: { category: 'grid', pair: 'BNB', capitalUsd: 500, bandPct: 0.1 },
  // CAKE, PancakeSwap's token on BSC.
  security: { category: 'security', token: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' },
}
const TEST_U = NETWORKS[97].assets.find((a) => a.symbol === 'U') ?? null
const START_KEY = 'marque:practice:start'
const secs = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` }

export function PracticeFlow() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { address } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { openConnectModal } = useConnectModal()
  const [capable, setCapable] = useState<boolean | null>(null)
  const [data, setData] = useState<Practice | null>(null)
  const [failed, setFailed] = useState(false)
  const [funded, setFunded] = useState<{ jobId: string; ms: number | null } | null>(null)
  // After mount only: the server's wallet config has no Pass connector (see NoWalletLine).
  const pass = capable ? connectors.find((c) => c.id === MARQUE_PASS_ID) : undefined
  const wallet = (address ?? null) as `0x${string}` | null

  useEffect(() => {
    setCapable(passCapableBrowser())
    try { if (!sessionStorage.getItem(START_KEY)) sessionStorage.setItem(START_KEY, String(Date.now())) } catch { /* timing only */ }
  }, [])
  useEffect(() => { if (wallet) rememberQuestAddress(wallet) }, [wallet])

  const load = useCallback(() => {
    setFailed(false)
    fetch(`/api/v1/practice${wallet ? `?address=${wallet}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Practice) => setData(j))
      .catch(() => setFailed(true))
  }, [wallet])
  useEffect(() => { load() }, [load])

  // The deposit, as the hire sheet reports it in this tab: time it from when this page first opened.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ step: string; chainId: number; jobId: string }>).detail
      if (d?.step !== 'funded' || d.chainId !== 97) return
      let start: number | null = null
      try { start = Number(sessionStorage.getItem(START_KEY)) || null; sessionStorage.removeItem(START_KEY) } catch { /* no timing */ }
      setFunded({ jobId: d.jobId, ms: start ? Date.now() - start : null })
      load()
    }
    window.addEventListener('marque:funnel', on)
    return () => window.removeEventListener('marque:funnel', on)
  }, [load])

  const gas = useBalance({ address: wallet ?? undefined, chainId: 97, query: { enabled: Boolean(wallet), refetchInterval: 10_000 } })
  const u = useReadContract({ address: TEST_U?.address as `0x${string}` | undefined, abi: erc20Abi, functionName: 'balanceOf', args: wallet ? [wallet] : undefined, chainId: 97, query: { enabled: Boolean(wallet && TEST_U), refetchInterval: 10_000 } })
  const needGas = gas.data ? gas.data.value === 0n : false
  const needToken = typeof u.data === 'bigint' ? u.data === 0n : false
  const funds = !wallet ? 'todo' : gas.isLoading || u.isLoading ? 'reading' : needGas || needToken ? 'todo' : 'done'

  const hire = (p: Pick) => {
    const b = p.category ? BRIEF[p.category] : null
    if (b) saveBrief(b)
    const next = new URLSearchParams(params.toString())
    next.set('hire', p.agentId)
    router.push(`${pathname}?${next}`, { scroll: false })
  }

  const done = data?.hires ? Math.min(data.hires.agents, 3) : 0
  const left = data?.hires ? Math.max(0, 3 - data.hires.agents) : 3
  const progressHref = wallet ? `/quest/${wallet}` : '/quest'
  const step = useMemo(() => (!wallet ? 1 : funds !== 'done' ? 2 : 3), [wallet, funds])

  return (
    <div className={styles.flow}>
      {funded ? (
        <section className={styles.funded} role="status">
          <b>Paid into escrow on BSC testnet, job {funded.jobId}.</b>
          <span>{funded.ms !== null ? `${secs(funded.ms)} from opening this page to the deposit.` : 'Deposit confirmed.'} The agent is working; its answer appears in the job room, where you rate it.</span>
          <div className={styles.fundedActions}>
            <a className="btn btn--sm btn--primary" href={`/jobs/97/${funded.jobId}`}>Open the job room</a>
            <a className="btn btn--sm" href={progressHref}>See your progress</a>
            {wallet ? <a className="btn btn--sm" href={`/quest/${wallet}#share`}>Share your progress</a> : null}
          </div>
        </section>
      ) : null}

      <ol className={styles.steps}>
        <li data-state={wallet ? 'done' : 'now'}>
          <span className={styles.n} aria-hidden="true">1</span>
          <div className={styles.body}>
            <h2 className={styles.h}>Your wallet</h2>
            {wallet ? (
              <p className={styles.p}>Hiring from <span className="mono">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>. Use the wallet you registered with BNB Chain for Set and Earn.</p>
            ) : (
              <>
                <p className={styles.p}>Hires count for the wallet that pays. A Marque Pass is a wallet made from your fingerprint or face: nothing to install, about ten seconds.</p>
                <div className={styles.actions}>
                  {capable !== false ? <button type="button" className="btn btn--primary" disabled={isPending || !pass} onClick={() => { if (pass) connect({ connector: pass, chainId: 97 }) }}>{isPending ? 'Waiting for your passkey…' : 'Create a Marque Pass'}</button> : null}
                  <button type="button" className="btn" onClick={openConnectModal}>Use my own wallet</button>
                </div>
              </>
            )}
          </div>
        </li>

        <li data-state={funds === 'done' ? 'done' : step === 2 ? 'now' : 'todo'}>
          <span className={styles.n} aria-hidden="true">2</span>
          <div className={styles.body}>
            <h2 className={styles.h}>Free test tokens</h2>
            {!wallet ? <p className={styles.p}>Test BNB for the network fee and test U for the price. They have no value; BNB Chain gives them out free.</p>
              : funds === 'reading' ? <p className={styles.p}>Reading your test balances…</p>
                : funds === 'done' ? <p className={styles.p}>Your wallet holds test BNB and test U.</p>
                  : <PracticeFunds address={wallet} needGas={needGas} needToken={needToken} onDone={() => { void gas.refetch(); void u.refetch() }} />}
          </div>
        </li>

        <li data-state={step === 3 ? 'now' : 'todo'}>
          <span className={styles.n} aria-hidden="true">3</span>
          <div className={styles.body}>
            <h2 className={styles.h}>Pick an agent you have not hired</h2>
            {data?.hires ? <p className={styles.p}>{done} of 3 different agents so far{left ? `; ${left} to go` : ''}. Each pick below would be a new one.</p> : <p className={styles.p}>Each one below is hireable on BSC testnet right now.</p>}
            {failed ? <p className={styles.p} role="alert">The list could not be read just now. <button type="button" className={styles.link} onClick={load}>Try again</button></p>
              : !data ? <p className={styles.p} role="status">Reading who is hireable now…</p>
                : data.team ? <p className={styles.p}>This is a published Marque team wallet. Its hires are shown, never counted.</p>
                  : !data.picks.length ? <p className={styles.p}>This wallet has hired every agent hireable on testnet right now. <a href="/register?lane=practice">See the practice lane</a>.</p>
                    : (
                      <ul className={styles.picks}>
                        {data.picks.map((p) => (
                          <li key={p.agentId} className={styles.pick}>
                            <AgentAvatar id={p.agentId} name={p.name} imageUrl={p.imageUrl} category={p.category} reference={p.reference} size={44} />
                            <div className={styles.pickBody}>
                              <span className={styles.pickName}>{p.name}</span>
                              <span className={styles.pickMeta}>
                                {(p.category && CAT[p.category]) || 'Other'}
                                {p.price ? ` · ${p.price.replace(/ U$/, ' test U')}` : ''}
                              </span>
                              <span className={styles.chips}>
                                <span className={styles.chip}>{p.listed ? 'Built by an outside builder' : p.outside ? 'Third-party agent' : 'Marque reference agent'}</span>
                                {p.passed ? <span className={styles.chip} data-tone="pass">Passed its test</span> : null}
                              </span>
                            </div>
                            <button type="button" className="btn btn--sm btn--primary" disabled={funds !== 'done'} onClick={() => hire(p)} aria-label={`Hire ${p.name} free on testnet`}>Hire free</button>
                          </li>
                        ))}
                      </ul>
                    )}
            {data && data.available > data.picks.length ? <p className={styles.fine}>{data.available} agents qualify; three are shown, outside builds first, in an order that rotates every ten minutes.</p> : null}
          </div>
        </li>

        <li data-state="todo">
          <span className={styles.n} aria-hidden="true">4</span>
          <div className={styles.body}>
            <h2 className={styles.h}>Read the answer, rate it</h2>
            <p className={styles.p}>The job room shows the answer, checked against the chain where its category allows, and asks for your rating. Then come back to <a href={progressHref}>your progress</a>.</p>
          </div>
        </li>
      </ol>
      <p className={styles.fine}>Practice hires use BNB Chain&apos;s ERC-8183 escrow on BSC testnet, from your own wallet. Marque never pays for, sponsors or arranges a hire, and holds no funds or keys.</p>
    </div>
  )
}
