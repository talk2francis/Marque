'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { getPublicClient, sendTransaction, switchChain, waitForTransactionReceipt } from '@wagmi/core'
import { formatEther } from 'viem'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { friendlyError, type FriendlyError } from '@marque/commerce/client'
import { Button, ButtonLink, ErrorNote, Skeleton } from '../../../../_components/ui'
import { explorerTx } from '../../../../../lib/network'
import styles from './act.module.css'

/**
 * The plan screen (SPEC-ACT 5). The agent decided; Marque rebuilt the action from its allowlist, re-read
 * the position at the current block and simulated it. The user signs from the wallet that holds the
 * position; Marque holds no authority. Afterwards the outcome is measured on chain and recorded.
 */
interface PlanState { block: string; healthFactor: number | null; debtUsd: number; weightedUsd: number; market: { borrowed: number; supplied: number; walletBalance: number } }
type PlanOk = {
  ok: true; action: 'repay' | 'supply'; user: string
  market: { vToken: string; symbol: string; decimals: number; priceUsd: number }
  amount: number; amountUsd: number; bounds: { min: number; max: number }
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; kind: string; words: string }>
  before: PlanState; predicted: PlanState; gas: string[]; readAt: string
  agent: { atBlock: string | null; healthFactor: number | null; repayUsd: number | null; target: number | null }
  stale: { reason: string; agentSays: string; nowNeeds: string } | null; capped: string | null
}
type PlanResp = { plan: PlanOk | { ok: false; code: string; reason: string }; token: string | null; agentName: string | null }

const n = (v: number, dp = 2) => (v !== 0 && Math.abs(v) < 10 ** -dp ? v.toLocaleString('en-US', { maximumSignificantDigits: 4 }) : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
// Above 100 a health factor carries no information (a dust remainder of interest makes it huge).
const hf = (v: number | null) => (v === null ? 'no debt' : v > 100 ? 'over 100' : v.toFixed(3))

export function ActPlan({ chainId, jobId, agentName }: { chainId: 56 | 97; jobId: string; agentName: string }) {
  const config = useConfig()
  const { address, chainId: walletChain } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [resp, setResp] = useState<PlanResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [hashes, setHashes] = useState<string[]>([])
  const [error, setError] = useState<FriendlyError | null>(null)
  const [done, setDone] = useState<{ after: PlanState; confirmedBlock: string } | null>(null)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const load = useCallback(async (amt: number | null) => {
    if (!address) return
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/v1/act/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId, jobId, user: address, amount: amt }) })
      const j = (await r.json()) as PlanResp & { detail?: string }
      if (!r.ok) setResp({ plan: { ok: false, code: 'unavailable', reason: j.detail ?? 'The plan could not be built just now.' }, token: null, agentName })
      else { setResp(j); if (j.plan.ok) setAmount(String(Number(j.plan.amount.toPrecision(10)))) }
    } catch { setResp({ plan: { ok: false, code: 'unavailable', reason: 'The plan could not be built just now.' }, token: null, agentName }) } finally { setLoading(false) }
  }, [address, chainId, jobId, agentName])
  useEffect(() => { void load(null) }, [load])

  // Network fee: the simulated gas at the current gas price, on BSC mainnet.
  useEffect(() => {
    const p = resp?.plan
    if (!p || !p.ok) return
    let live = true
    ;(async () => {
      const pc = getPublicClient(config, { chainId: 56 })
      const price = await pc?.getGasPrice().catch(() => null)
      if (live && price) setFee(Number(formatEther(p.gas.reduce((s, g) => s + BigInt(g), 0n) * price)).toLocaleString('en-US', { maximumSignificantDigits: 2 }))
    })()
    return () => { live = false }
  }, [resp, config])

  if (!address) {
    return (
      <div className={styles.panel}>
        <p className={styles.lede}>Connect the wallet that holds the position. You sign every step; Marque holds no authority over it.</p>
        <Button variant="primary" onClick={openConnectModal}>Connect a wallet</Button>
      </div>
    )
  }
  if (!resp || (loading && !resp.plan.ok)) return <div className={styles.panel}><Skeleton h={28} w="60%" /><Skeleton h={18} w="80%" /><Skeleton h={120} /></div>
  const p = resp.plan
  if (!p.ok) {
    return (
      <div className={styles.panel} data-refused="">
        <h2 className={styles.headline}>Nothing to sign</h2>
        <p className={styles.lede}>{p.reason}</p>
        <ButtonLink href={`/jobs/${chainId}/${jobId}`}>Back to the job</ButtonLink>
      </div>
    )
  }

  const ago = Math.max(0, Math.round((now - Date.parse(p.readAt)) / 1000))
  const sign = async () => {
    if (!resp.token) return
    setError(null); setRecordError(null)
    const got: string[] = []
    try {
      if (walletChain !== 56) await switchChain(config, { chainId: 56 })
      for (const c of p.calls) {
        setBusy(c.kind)
        const hash = await sendTransaction(config, { to: c.to, data: c.data, chainId: 56 })
        const r = await waitForTransactionReceipt(config, { hash, chainId: 56 })
        if (r.status !== 'success') throw new Error('The transaction reverted on chain.')
        got.push(hash); setHashes([...got])
      }
      setBusy('record')
      const o = await fetch('/api/v1/act/outcome', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: resp.token, txHashes: got }) })
      const oj = (await o.json()) as { ok: boolean; after?: PlanState; confirmedBlock?: string; reason?: string }
      if (oj.ok && oj.after) setDone({ after: oj.after, confirmedBlock: oj.confirmedBlock! })
      else setRecordError(oj.reason ?? 'The outcome could not be recorded. Your transactions are on chain either way.')
    } catch (e) { setError(friendlyError(e)) } finally { setBusy(null) }
  }

  if (done) {
    return (
      <div className={styles.panel} data-done="">
        <h2 className={styles.headline}>Done.</h2>
        <p className={styles.result}>
          {p.action === 'repay'
            ? <>Your health factor is now <b>{hf(done.after.healthFactor)}</b>, read at block {Number(done.after.block).toLocaleString('en-US')}.</>
            : <>Your Venus {p.market.symbol} supply is now <b>{n(done.after.market.supplied, 4)}</b>, read at block {Number(done.after.block).toLocaleString('en-US')}.</>}
        </p>
        <dl className={styles.outcome}>
          <div><dt>Before</dt><dd>{p.action === 'repay' ? `HF ${hf(p.before.healthFactor)}` : `${n(p.before.market.supplied, 4)} ${p.market.symbol}`} <span>block {Number(p.before.block).toLocaleString('en-US')}</span></dd></div>
          <div><dt>After</dt><dd>{p.action === 'repay' ? `HF ${hf(done.after.healthFactor)}` : `${n(done.after.market.supplied, 4)} ${p.market.symbol}`} <span>block {Number(done.after.block).toLocaleString('en-US')}</span></dd></div>
          <div><dt>Predicted</dt><dd>{p.action === 'repay' ? `HF ${hf(p.predicted.healthFactor)}` : `${n(p.predicted.market.supplied, 4)} ${p.market.symbol}`}</dd></div>
          <div><dt>Transactions</dt><dd>{hashes.map((h) => <a key={h} href={explorerTx(56, h)} target="_blank" rel="noreferrer">{h.slice(0, 10)}…<ArrowUpRight aria-hidden="true" /></a>)}</dd></div>
        </dl>
        <p className={styles.fine}>Recorded on {agentName}&apos;s track record as an acted-on outcome. Both reads are from chain.</p>
        <div className={styles.actions}><ButtonLink variant="primary" href={`/jobs/${chainId}/${jobId}#rate`}>Rate {agentName}</ButtonLink><ButtonLink href={`/jobs/${chainId}/${jobId}`}>Back to the job</ButtonLink></div>
      </div>
    )
  }

  const verb = p.action === 'repay' ? 'Repay' : 'Supply'
  return (
    <div className={styles.panel}>
      <div className={styles.top}><span className="t-label">Act on {agentName}&apos;s answer</span><span className={styles.net}>BSC mainnet</span></div>
      <h2 className={styles.headline}>{verb} {n(p.amount, 4)} {p.market.symbol} {p.action === 'repay' ? `of your Venus ${p.market.symbol} borrow` : `to Venus`}</h2>
      <p className={styles.result}>
        {p.action === 'repay'
          ? <>Your health factor goes from <b>{hf(p.before.healthFactor)}</b> to <b>{hf(p.predicted.healthFactor)}</b>.</>
          : <>Your Venus {p.market.symbol} supply goes from <b>{n(p.before.market.supplied, 4)}</b> to <b>{n(p.predicted.market.supplied, 4)}</b>.</>}
      </p>
      <p className={styles.checked}>Checked against block {Number(p.before.block).toLocaleString('en-US')}, {ago < 90 ? `${ago} seconds` : `${Math.round(ago / 60)} minutes`} ago.{p.agent.target ? <> {agentName} recommended a target of {p.agent.target}{p.agent.atBlock ? <> at block {Number(p.agent.atBlock).toLocaleString('en-US')}</> : null}.</> : null}</p>
      {p.stale ? <p className={styles.stale}>{p.stale.reason} At the current block it needs {p.stale.nowNeeds} ({agentName} said {p.stale.agentSays}).</p> : null}
      {p.capped ? <p className={styles.stale}>{p.capped}</p> : null}
      {p.action === 'repay' && p.amount >= p.before.market.borrowed * 0.999 ? <p className={styles.fine}>This repays the whole {p.market.symbol} borrow as read now. Interest accrues every block, so a few millionths of {p.market.symbol} may remain until repaid.</p> : null}

      <p className={styles.sub}>You will sign {p.calls.length === 2 ? 'two things' : `${p.calls.length} things`}:</p>
      <ol className={styles.calls}>
        {p.calls.map((c, i) => (
          <li key={i} data-done={hashes[i] ? '' : undefined} data-busy={busy === c.kind || undefined}>
            <span className={styles.callN}>{i + 1}</span><span>{c.words}</span><span className={styles.kind}>({c.kind})</span>
            {hashes[i] ? <a href={explorerTx(56, hashes[i]!)} target="_blank" rel="noreferrer" className={styles.tx}>{hashes[i]!.slice(0, 10)}…</a> : null}
          </li>
        ))}
      </ol>
      <p className={styles.fine}>Network fee: {fee ? `about ${fee} BNB` : 'shown by your wallet'}.</p>

      <div className={styles.adjust}>
        <label>Amount<span className={styles.amountIn}><input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} aria-describedby="act-bounds" />{p.market.symbol}</span></label>
        <span id="act-bounds" className={styles.fine}>up to {n(p.bounds.max, 4)}</span>
        <Button size="sm" loading={loading} onClick={() => void load(Number(amount) > 0 ? Number(amount) : null)}><RefreshCw aria-hidden="true" />Re-check</Button>
      </div>
      <p className={styles.own}>{p.action === 'repay' ? 'This repays your own debt only.' : 'This supplies from your wallet to your own Venus balance only.'} Nothing is sent to {agentName}, Marque or anyone else.</p>
      {error ? <ErrorNote error={error} /> : null}
      {recordError ? <p className={styles.stale}>{recordError}</p> : null}
      <div className={styles.actions}>
        <Button variant="primary" loading={busy !== null} disabled={loading || !resp.token} onClick={sign}>{busy === 'record' ? 'Measuring the result' : `${verb} and sign`}</Button>
        <ButtonLink href={`/jobs/${chainId}/${jobId}`}>Not now</ButtonLink>
      </div>
      <details className={styles.limits}>
        <summary>Limits</summary>
        <p>The simulation is a prediction at this block; prices and interest move between blocks. Marque holds no authority: each step is a transaction you sign. Approvals are for the exact amount, never unlimited.</p>
      </details>
    </div>
  )
}
