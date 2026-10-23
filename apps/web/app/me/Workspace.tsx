'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAccount, useBalance, useConfig, useReadContracts } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { erc20Abi, formatUnits } from 'viem'
import { ArrowUpRight, Copy, Download } from 'lucide-react'
import { friendlyError, NETWORKS, revokeAllowanceCall, type ChainId, type FriendlyError } from '@marque/commerce/client'
import { Button, ButtonLink, ErrorNote, Skeleton, Tabs } from '../_components/ui'
import { useWalletQuest, type WalletHire } from '../_components/shell/useQuest'
import { NoWalletLine } from '../_components/pass/NoWalletLine'
import { MARQUE_PASS_ID } from '../_components/pass/connector'
import { toast } from '../../lib/toast'
import { copyText } from '../../lib/clipboard'
import { explorerTx } from '../../lib/network'
import { savedAgents, watched, saveWatched, hireLimit, setHireLimit, firedAlerts, markFired, SAVED_EVENT, type SavedAgent, type WatchedPosition } from '../../lib/local-watch'
import styles from './workspace.module.css'

/**
 * My Marque (SPEC-WORKSPACE 1, DESIGN-V4 3): where a buyer or a builder comes back to. Any address
 * renders read-only; the connected owner gets the write actions (rate, revoke, reclaim), each signed
 * by their own wallet. Networks are shown side by side, never summed (invariant 32).
 */
const ADDR = /^0x[0-9a-fA-F]{40}$/
type View = 'hiring' | 'building'
type Need = { kind: string; title: string; sentence: string; deadline: string | null; chainId: number | null; jobId: string | null; action: { label: string; href?: string; do?: 'revoke' | 'reclaim' | 'rate'; token?: string }; side: View }
type LogEntry = { at: string | null; chainId: number; kind: string; title: string; jobId: string | null; agent: string | null; amount: string | null; tx: string; key: string }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const net = (c: number) => (c === 56 ? 'Mainnet' : 'Testnet')
const until = (iso: string | null) => {
  if (!iso) return null
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3_600_000)
  return h >= 48 ? `in ${Math.floor(h / 24)} days` : h >= 1 ? `in ${h} h` : `in ${Math.max(1, Math.floor(ms / 60_000))} min`
}
const urgency = (iso: string | null) => { if (!iso) return 'calm'; const h = (Date.parse(iso) - Date.now()) / 3_600_000; return h < 24 ? 'urgent' : h < 72 ? 'soon' : 'calm' }

export function Workspace({ addrParam }: { addrParam: string | null }) {
  const { address: connected, connector } = useAccount()
  const { openConnectModal } = useConnectModal()
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams()
  const address = addrParam ?? connected ?? null
  const own = Boolean(address && connected && address.toLowerCase() === connected.toLowerCase())
  const [view, setView] = useState<View>('hiring')
  useEffect(() => { try { const v = localStorage.getItem('marque:me-view'); if (v === 'building' || v === 'hiring') setView(v) } catch { /* default */ } }, [])
  const pickView = (v: View) => { setView(v); try { localStorage.setItem('marque:me-view', v) } catch { /* fine */ } }
  const tab = params.get('view') ?? (view === 'building' ? 'agents' : 'logbook')
  const setTab = (t: string) => { const p = new URLSearchParams(params.toString()); p.set('view', t); router.replace(`${pathname}?${p.toString()}`, { scroll: false }) }

  if (!address) return <Landing onConnect={openConnectModal} />
  const isPass = own && connector?.id === MARQUE_PASS_ID

  const hiringTabs = [
    { id: 'logbook', label: 'Logbook', content: <Logbook address={address} /> },
    { id: 'jobs', label: 'Jobs', content: <Jobs address={address} /> },
    { id: 'money', label: 'Money', content: <Money address={address} own={own} /> },
    { id: 'watching', label: 'Watching', content: <Watching /> },
  ]
  const buildingTabs = [
    { id: 'agents', label: 'Agents', content: <Agents address={address} /> },
    { id: 'logbook', label: 'Logbook', content: <Logbook address={address} building /> },
  ]
  const tabs = view === 'building' ? buildingTabs : hiringTabs
  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <span className="t-label">My Marque{own ? '' : ' · viewing an address'}</span>
          <div className={styles.toggle} role="radiogroup" aria-label="View">
            {(['hiring', 'building'] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} data-on={view === v || undefined} onClick={() => pickView(v)}>{v === 'hiring' ? 'Hiring' : 'Building'}</button>)}
          </div>
        </div>
        <div className={styles.identity}>
          <button type="button" className={styles.addr} onClick={async () => { if (await copyText(address)) toast({ tone: 'success', title: 'Address copied' }) }} title="Copy address"><span>{short(address)}</span><Copy aria-hidden="true" /></button>
          {isPass ? <span className={styles.tag}>Marque Pass</span> : null}
          {own ? null : <a className={styles.link} href="/me">Back to my wallet</a>}
        </div>
        <Balances address={address} own={own} />
      </header>
      <Dockets address={address} own={own} view={view} />
      <Tabs label="My Marque sections" tabs={tabs} value={tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id} onChange={setTab} />
    </div>
  )
}

function Landing({ onConnect }: { onConnect?: () => void }) {
  const [v, setV] = useState('')
  return (
    <div className={styles.landing}>
      <span className="t-label">My Marque</span>
      <h1>Your jobs, your money and your agents, in one place.</h1>
      <p>Everything here is read from BNB Chain. Look at any wallet, or connect yours to rate, reclaim and revoke.</p>
      <form className={styles.lookup} onSubmit={(e) => { e.preventDefault(); if (ADDR.test(v.trim())) window.location.href = `/me?addr=${v.trim()}` }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Look at any wallet's Marque activity: 0x…" spellCheck={false} aria-label="Wallet address" />
        <Button type="submit" disabled={!ADDR.test(v.trim())}>Look</Button>
      </form>
      <div className={styles.landingActions}>
        <Button variant="primary" onClick={onConnect}>Connect a wallet</Button>
        <NoWalletLine />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- balances */

function Balances({ address, own }: { address: string; own: boolean }) {
  const a = address as `0x${string}`
  const bnb56 = useBalance({ address: a, chainId: 56 }), bnb97 = useBalance({ address: a, chainId: 97 })
  const reads = useReadContracts({ contracts: ([56, 97] as const).flatMap((c) => NETWORKS[c].assets.map((t) => ({ address: t.address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [a] as const, chainId: c }))), query: { refetchInterval: 60_000 } })
  let i = 0
  const rows = ([56, 97] as const).map((c) => ({
    c, native: c === 56 ? bnb56.data : bnb97.data,
    tokens: NETWORKS[c].assets.map((t) => ({ t, v: reads.data?.[i++]?.result as bigint | undefined })),
  }))
  const fmt = (v: bigint | undefined, d: number) => (v === undefined ? null : Number(formatUnits(v, d)).toLocaleString('en-US', { maximumFractionDigits: 4 }))
  return (
    <dl className={styles.balances}>
      {rows.map((r) => (
        <div key={r.c} className={styles.balRow} data-net={r.c}>
          <dt>{net(r.c)}{r.c === 97 ? <span> test tokens</span> : null}</dt>
          <dd>
            <span className={styles.bal}><b>{r.native ? fmt(r.native.value, 18) : <Skeleton w={40} h={12} />}</b> {r.c === 97 ? 'tBNB' : 'BNB'}</span>
            {r.tokens.map(({ t, v }) => <span key={t.address} className={styles.bal}><b>{fmt(v, t.decimals) ?? '·'}</b> {r.c === 97 ? 'test ' : ''}{t.symbol}</span>)}
            {own ? (r.c === 56
              ? <a className={styles.link} href="https://pancakeswap.finance/swap?chain=bsc&outputCurrency=0xcE24439F2D9C6a2289F741120FE202248B666666" target="_blank" rel="noreferrer">Get U<ArrowUpRight aria-hidden="true" /></a>
              : <a className={styles.link} href="https://t.me/bnbchain_official_bot" target="_blank" rel="noreferrer">Get test tokens<ArrowUpRight aria-hidden="true" /></a>) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------------- needs you */

function Dockets({ address, own, view }: { address: string; own: boolean; view: View }) {
  const [items, setItems] = useState<Need[] | null>(null)
  const [team, setTeam] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const config = useConfig()
  const { chainId: walletChain } = useAccount()
  const load = useCallback(() => {
    fetch(`/api/v1/wallet/${address}/needs-you`).then((r) => (r.ok ? r.json() : null)).then((j: { items: Need[]; team: boolean } | null) => { setItems(j?.items ?? []); setTeam(Boolean(j?.team)) }).catch(() => setItems([]))
  }, [address])
  useEffect(() => { load() }, [load])
  const local = useWatchAlerts()
  const list = [...(view === 'hiring' ? local : []), ...(items ?? []).filter((x) => x.side === view)]
  const revoke = async (n: Need) => {
    const chainId = n.chainId as ChainId
    const asset = NETWORKS[chainId].assets.find((a) => a.address.toLowerCase() === n.action.token?.toLowerCase())
    if (!asset) return
    setBusy(n.title)
    try {
      const c = revokeAllowanceCall(chainId, { address: asset.address, symbol: asset.symbol })
      if (walletChain !== chainId) await switchChain(config, { chainId })
      const hash = await writeContract(config, { address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[], chainId })
      await waitForTransactionReceipt(config, { hash, chainId })
      toast({ tone: 'success', title: `${asset.symbol} allowance set to zero`, href: explorerTx(chainId, hash) })
      load()
    } catch (err) { toast({ tone: 'error', title: friendlyError(err).title }) } finally { setBusy(null) }
  }
  return (
    <section className={styles.needs} aria-labelledby="needs-title">
      <h2 id="needs-title" className={styles.h2}>Needs you{items ? <span className={styles.count}>{list.length}</span> : null}</h2>
      {team ? <p className={styles.fine}>A published Marque team wallet: its activity is shown, never counted for Set and Earn.</p> : null}
      {items === null ? <div className={styles.dockets}>{[0, 1, 2].map((i) => <div key={i} className={styles.docket}><Skeleton h={96} /></div>)}</div>
        : list.length === 0 ? <p className={styles.empty}>Nothing needs you. Your jobs, money and agents are below.</p>
          : (
            <div className={styles.dockets} role="list">
              {list.map((n, i) => (
                <article key={`${n.kind}-${n.chainId}-${n.jobId}-${i}`} className={styles.docket} data-urgency={urgency(n.deadline)} role="listitem">
                  <span className={styles.docketNet}>{n.chainId ? net(n.chainId) : 'This device'}</span>
                  <h3>{n.title}</h3>
                  <p>{n.sentence}</p>
                  <div className={styles.docketFoot}>
                    <span className={styles.deadline}>{n.deadline ? until(n.deadline) : ''}</span>
                    {n.action.do === 'revoke' ? (own ? <Button size="sm" variant="danger" loading={busy === n.title} onClick={() => revoke(n)}>{n.action.label}</Button> : null)
                      : n.action.href ? <ButtonLink size="sm" href={n.action.href}>{n.action.label}</ButtonLink> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
    </section>
  )
}

/* ---------------------------------------------------------------- logbook */

const FILTERS: Array<{ id: string; label: string; kinds: string[] | null }> = [
  { id: 'all', label: 'All', kinds: null }, { id: 'payments', label: 'Payments', kinds: ['payment', 'settlement'] },
  { id: 'deliveries', label: 'Deliveries', kinds: ['delivery'] }, { id: 'ratings', label: 'Ratings', kinds: ['rating'] },
]
const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Time not indexed')

function Logbook({ address, building = false }: { address: string; building?: boolean }) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const load = useCallback(async (cursor: string | null) => {
    setLoading(true)
    const r = await fetch(`/api/v1/wallet/${address}/logbook${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`).then((x) => (x.ok ? x.json() : null)).catch(() => null) as { entries: LogEntry[]; next: string | null } | null
    setEntries((e) => (cursor ? [...e, ...(r?.entries ?? [])] : r?.entries ?? [])); setNext(r?.next ?? null); setLoading(false)
  }, [address])
  useEffect(() => { void load(null) }, [load])
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds
  const shown = entries.filter((e) => !kinds || kinds.includes(e.kind))
  const days = useMemo(() => { const m = new Map<string, LogEntry[]>(); for (const e of shown) { const d = dayOf(e.at); m.set(d, [...(m.get(d) ?? []), e]) } return [...m] }, [shown])
  return (
    <div className={styles.logbook}>
      <div className={styles.logTools}>
        <div className={styles.chips} role="radiogroup" aria-label="Filter">{FILTERS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} data-on={filter === f.id || undefined} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
        <a className={styles.link} href={`/api/v1/wallet/${address}/logbook?format=csv`} download><Download aria-hidden="true" />Export CSV</a>
      </div>
      {building ? <p className={styles.fine}>Your hires and their events. Jobs where your agents are paid are listed in Agents.</p> : null}
      {loading && !entries.length ? <div className={styles.skel}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={40} />)}</div>
        : !shown.length ? <p className={styles.empty}>Nothing here yet. Every hire, delivery and rating this wallet makes on Marque is written here, with its transaction.</p>
          : days.map(([day, list]) => (
            <section key={day} className={styles.day}>
              <h3 className={styles.dayHead}>{day}</h3>
              <ol className={styles.log}>
                {list.map((e) => (
                  <li key={e.key} data-kind={e.kind}>
                    <time className={styles.time}>{e.at ? e.at.slice(11, 16) : '··:··'}</time>
                    <span className={styles.event}><b>{e.title}</b>{e.amount ? <span className={styles.amount}>{e.amount}</span> : null}{e.jobId ? <a href={`/jobs/${e.chainId}/${e.jobId}`}>job {e.jobId}</a> : null}</span>
                    <span className={styles.logNet} data-net={e.chainId}>{net(e.chainId)}</span>
                    <a className={styles.tx} href={explorerTx(e.chainId, e.tx)} target="_blank" rel="noreferrer" aria-label="Transaction on BscScan"><ArrowUpRight aria-hidden="true" /></a>
                  </li>
                ))}
              </ol>
            </section>
          ))}
      {next ? <Button size="sm" loading={loading} onClick={() => load(next)}>Show older</Button> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- jobs */

const PLAIN: Record<string, (h: WalletHire) => string> = {
  OPEN: () => 'Opened, not paid', FUNDED: () => 'Paid, waiting for delivery', SUBMITTED: () => 'Delivered, review window open',
  DISPUTED: () => 'Problem reported, being decided', COMPLETED: (h) => `Settled to ${h.agent.name}`, PAID: (h) => `Settled, released to ${h.agent.name}`,
  REFUNDED: () => 'Refunded', CANCELLED: () => 'Cancelled', REJECTED: () => 'Rejected', EXPIRED: () => 'Deadline passed',
}
const JOB_FILTERS: Array<{ id: string; label: string; states: string[] | null }> = [
  { id: 'all', label: 'All', states: null }, { id: 'running', label: 'Running', states: ['OPEN', 'FUNDED'] }, { id: 'review', label: 'In review', states: ['SUBMITTED'] },
  { id: 'done', label: 'Completed', states: ['COMPLETED', 'PAID'] }, { id: 'refunds', label: 'Refunds', states: ['REFUNDED', 'EXPIRED', 'CANCELLED'] }, { id: 'disputed', label: 'Disputed', states: ['DISPUTED', 'REJECTED'] },
]
const amt = (h: WalletHire) => (h.amount && h.token ? `${Number(formatUnits(BigInt(h.amount), h.token.decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${h.chainId === 97 ? 'test ' : ''}${h.token.symbol}` : 'unpaid')

function Jobs({ address }: { address: string }) {
  const main = useWalletQuest(address, 56), practice = useWalletQuest(address, 97)
  const [f, setF] = useState('all')
  const [find, setFind] = useState('')
  const states = JOB_FILTERS.find((x) => x.id === f)?.states
  const groups = ([[56, main], [97, practice]] as const).map(([c, q]) => ({ c, pending: q.isPending, hires: [...(q.data?.hires ?? [])].reverse().filter((h) => !states || states.includes(h.state)) }))
  return (
    <div className={styles.jobsTab}>
      <div className={styles.logTools}>
        <div className={styles.chips} role="radiogroup" aria-label="Job state">{JOB_FILTERS.map((x) => <button key={x.id} type="button" role="radio" aria-checked={f === x.id} data-on={f === x.id || undefined} onClick={() => setF(x.id)}>{x.label}</button>)}</div>
        <form className={styles.find} onSubmit={(e) => { e.preventDefault(); const m = find.trim().match(/^(\d{3,9})$/); if (m) window.location.href = `/jobs/${Number(m[1]) < 10_000 ? 97 : 56}/${m[1]}` }}>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a job by number" inputMode="numeric" aria-label="Job number" />
        </form>
      </div>
      {groups.map((g) => (
        <section key={g.c} className={styles.jobGroup}>
          <h3 className={styles.dayHead}>{g.c === 56 ? 'BSC mainnet' : 'BSC testnet · test tokens, no real value'}</h3>
          {g.pending ? <Skeleton h={48} /> : !g.hires.length ? <p className={styles.fine}>No jobs here.</p> : (
            <ul className={styles.jobList}>
              {g.hires.map((h) => (
                <li key={h.jobKey}>
                  <a href={`/jobs/${h.chainId}/${h.jobId}`} className={styles.jobRow}>
                    <span className={styles.jobAgent}><b>{h.agent.name}</b><span>job {h.jobId}</span></span>
                    <span className={styles.jobState} data-state={h.state}>{(PLAIN[h.state] ?? (() => h.state))(h)}</span>
                    <span className={styles.amount}>{amt(h)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- money */

function Money({ address, own }: { address: string; own: boolean }) {
  const main = useWalletQuest(address, 56), practice = useWalletQuest(address, 97)
  const [limit, setLimit] = useState<string>('')
  useEffect(() => { const l = hireLimit(); setLimit(l === null ? '' : String(l)) }, [])
  const sum = (hs: WalletHire[], states: string[]) => {
    const by = new Map<string, number>()
    for (const h of hs) if (states.includes(h.state) && h.amount && h.token) by.set(h.token.symbol, (by.get(h.token.symbol) ?? 0) + Number(formatUnits(BigInt(h.amount), h.token.decimals)))
    return [...by].map(([sym, v]) => `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${sym}`).join(' · ') || '0'
  }
  return (
    <div className={styles.money}>
      <div className={styles.moneyCols}>
        {([[56, main], [97, practice]] as const).map(([c, q]) => {
          const hs = q.data?.hires ?? []
          return (
            <section key={c} className={styles.moneyCol}>
              <h3 className={styles.dayHead}>{c === 56 ? 'Mainnet' : 'Testnet (test tokens)'}</h3>
              <dl>
                <div><dt>In escrow now</dt><dd>{q.isPending ? '…' : sum(hs, ['FUNDED', 'SUBMITTED', 'DISPUTED'])}</dd></div>
                <div><dt>Released to agents</dt><dd>{q.isPending ? '…' : sum(hs, ['COMPLETED', 'PAID'])}</dd></div>
                <div><dt>Refunded</dt><dd>{q.isPending ? '…' : sum(hs, ['REFUNDED'])}</dd></div>
              </dl>
              <Allowances address={address} chainId={c} own={own} />
            </section>
          )
        })}
      </div>
      <p className={styles.fine}>Every hire approves exactly its price. Marque never asks for a standing allowance.</p>
      {own ? (
        <div className={styles.limit}>
          <label htmlFor="hire-limit">Ask me twice before any single hire above</label>
          <span className={styles.limitInput}><input id="hire-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} onBlur={() => { const v = Number(limit); setHireLimit(limit.trim() && v > 0 ? v : null); toast({ tone: 'success', title: limit.trim() && v > 0 ? `Reminder set at ${v} U` : 'Reminder removed' }) }} placeholder="5" /><span>U</span></span>
          <span className={styles.fine}>A reminder on this device, not a lock on chain.</span>
        </div>
      ) : null}
    </div>
  )
}

function Allowances({ address, chainId, own }: { address: string; chainId: ChainId; own: boolean }) {
  const config = useConfig()
  const { chainId: walletChain } = useAccount()
  const assets = NETWORKS[chainId].assets
  const commerce = NETWORKS[chainId].commerce
  const reads = useReadContracts({ contracts: assets.map((a) => ({ address: a.address, abi: erc20Abi, functionName: 'allowance' as const, args: [address as `0x${string}`, commerce] as const, chainId })), query: { refetchInterval: 30_000 } })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<FriendlyError | null>(null)
  const revoke = async (a: (typeof assets)[number]) => {
    setBusy(a.symbol); setError(null)
    try {
      const c = revokeAllowanceCall(chainId, { address: a.address, symbol: a.symbol })
      if (walletChain !== chainId) await switchChain(config, { chainId })
      const hash = await writeContract(config, { address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[], chainId })
      await waitForTransactionReceipt(config, { hash, chainId })
      toast({ tone: 'success', title: `${a.symbol} allowance set to zero`, body: 'The escrow can no longer take this token until you approve again.', href: explorerTx(chainId, hash) })
      await reads.refetch()
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(null) }
  }
  return (
    <div className={styles.allow}>
      <span className={styles.allowHead}>Approved to BNB Chain&apos;s escrow ({short(commerce)})</span>
      {assets.map((a, i) => {
        const v = reads.data?.[i]?.result as bigint | undefined
        return (
          <div key={a.address} className={styles.allowRow}>
            <span>{chainId === 97 ? 'test ' : ''}{a.symbol}</span>
            <span className={styles.amount}>{v === undefined ? (reads.isError ? 'could not read' : '…') : v === 0n ? '0' : Number(formatUnits(v, a.decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
            <span>{own && v !== undefined && v > 0n ? <Button size="sm" variant="danger" loading={busy === a.symbol} disabled={busy !== null} onClick={() => revoke(a)}>Revoke</Button> : v === 0n ? <span className={styles.fine}>nothing to revoke</span> : null}</span>
          </div>
        )
      })}
      {error ? <ErrorNote error={error} /> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- agents (building) */

interface OwnerAgent { agentKey: string; chainId: number; agentId: string; name: string; category: string | null; listedOnMarque: boolean; quality: { checks: Array<{ id: string; pass: boolean; fix: string | null }> }; jobsReceived: number; jobsPaid: number }
interface QuestBuild { build: { agents: Array<{ chainId: number; tokenId: string; observed: number; checks: Record<string, { state: string; reason: string; next?: { label: string; href: string } | null }> }> } }
const CRIT: Array<[string, string]> = [['registered', 'Registered'], ['card', 'Agent card'], ['probes', 'Answers'], ['hires', '3 hirers'], ['actions', 'Actions'], ['category', 'In category']]

function Agents({ address }: { address: string }) {
  const [owner, setOwner] = useState<OwnerAgent[] | null>(null)
  const [quest, setQuest] = useState<QuestBuild | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/v1/phase2/owner/${address}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setOwner(j?.agents ?? []) }).catch(() => { if (live) setOwner([]) })
    fetch(`/api/v1/quest/${address}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setQuest(j) }).catch(() => undefined)
    return () => { live = false }
  }, [address])
  if (owner === null) return <div className={styles.skel}>{[0, 1].map((i) => <Skeleton key={i} h={88} />)}</div>
  if (!owner.length) return <p className={styles.empty}>You have no agents yet. <a href="/builders">Build one in the Forge</a>.</p>
  return (
    <ul className={styles.agents}>
      {owner.map((a) => {
        const q = quest?.build.agents.find((x) => x.chainId === a.chainId && x.tokenId === a.agentId)
        return (
          <li key={a.agentKey} className={styles.agent}>
            <div className={styles.agentTop}>
              <a href={`/agents/${a.chainId}/${a.agentId}`}><b>{a.name}</b></a>
              <span className={styles.fine}>#{a.agentId} · {net(a.chainId)}</span>
              <span className={styles.pill} data-tone={a.listedOnMarque ? 'good' : undefined}>{a.listedOnMarque ? 'Hireable on Marque' : 'Not hireable yet'}</span>
            </div>
            {q ? (
              <div className={styles.crit} aria-label={`Set and Earn: ${q.observed} of 6 criteria observed`}>
                {CRIT.map(([k, label]) => { const c = k === 'registered' ? (q.checks['registered']?.state === 'observed' && q.checks['listed']?.state === 'observed' ? 'observed' : q.checks['listed']?.state ?? 'not_yet') : q.checks[k]?.state ?? 'not_yet'; return <span key={k} className={styles.critChip} data-state={c} title={q.checks[k]?.reason ?? ''}>{label}</span> })}
                <span className={styles.fine}>{q.observed} of 6 observed</span>
              </div>
            ) : null}
            <div className={styles.agentFoot}>
              <span>Jobs received <b>{a.jobsReceived}</b> · paid out <b>{a.jobsPaid}</b></span>
              <a className={styles.link} href={`/builders/check/${a.chainId}/${a.agentId}`}>Fix report</a>
              <a className={styles.link} href={`/quest/${address}`}>Set and Earn detail</a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ---------------------------------------------------------------- watching */

function useWatchAlerts(): Need[] {
  const [alerts, setAlerts] = useState<Need[]>([])
  useEffect(() => {
    let live = true
    const run = async () => {
      const list = watched()
      const out: Need[] = []
      for (const w of list) {
        const j = await fetch(`/api/v1/positions/${w.address}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { venus?: { healthFactor?: number | null } } | null
        const hf = j?.venus?.healthFactor ?? null
        if (w.hfBelow !== null && hf !== null && hf < w.hfBelow) {
          out.push({ kind: 'watch', title: `${short(w.address)} health factor ${hf.toFixed(2)}`, sentence: `Below your ${w.hfBelow} line. Ask every health factor agent for a repay plan.`, deadline: null, chainId: null, jobId: null, action: { label: 'Get a repay plan', href: '/tender?category=health_factor' }, side: 'hiring' })
          const key = `${w.address}:hf:${new Date().toISOString().slice(0, 13)}`
          if (!firedAlerts().includes(key)) { markFired(key); try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Marque', { body: `${short(w.address)} health factor ${hf.toFixed(2)}, below ${w.hfBelow}` }) } catch { /* no notifications */ } }
        }
      }
      if (live) setAlerts(out)
    }
    void run()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void run() }, 5 * 60_000)
    return () => { live = false; clearInterval(t) }
  }, [])
  return alerts
}

function Watching() {
  const [saved, setSaved] = useState<SavedAgent[]>([])
  const [list, setList] = useState<WatchedPosition[]>([])
  const [addr, setAddr] = useState('')
  const [hf, setHf] = useState('1.30')
  useEffect(() => {
    const sync = () => setSaved(savedAgents())
    sync(); setList(watched())
    window.addEventListener(SAVED_EVENT, sync)
    return () => window.removeEventListener(SAVED_EVENT, sync)
  }, [])
  const add = () => {
    if (!ADDR.test(addr.trim())) return
    const next = [{ address: addr.trim(), hfBelow: Number(hf) > 1 ? Number(hf) : null, lpNearPct: 5, idle: false, addedAt: new Date().toISOString() }, ...list.filter((x) => x.address.toLowerCase() !== addr.trim().toLowerCase())]
    saveWatched(next); setList(next); setAddr('')
  }
  return (
    <div className={styles.watching}>
      <section>
        <h3 className={styles.dayHead}>Saved agents</h3>
        {saved.length ? (
          <ul className={styles.savedList}>{saved.map((a) => <li key={a.agentId}><a href={a.tokenId ? `/agents/${a.chainId}/${a.tokenId}` : `?hire=${encodeURIComponent(a.agentId)}`}><b>{a.name}</b></a><span className={styles.fine}>{net(a.chainId)}</span><a className={styles.link} href={`?hire=${encodeURIComponent(a.agentId)}`}>Hire</a></li>)}</ul>
        ) : <p className={styles.fine}>Tap the star on any agent to keep it here.</p>}
      </section>
      <section>
        <h3 className={styles.dayHead}>Watched positions</h3>
        <form className={styles.watchForm} onSubmit={(e) => { e.preventDefault(); add() }}>
          <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Any wallet 0x…" spellCheck={false} aria-label="Wallet to watch" />
          <label>Alert below HF <input value={hf} onChange={(e) => setHf(e.target.value)} inputMode="decimal" aria-label="Health factor alert line" /></label>
          <Button type="submit" size="sm" disabled={!ADDR.test(addr.trim())}>Watch</Button>
        </form>
        {list.length ? <ul className={styles.savedList}>{list.map((w) => <li key={w.address}><span className={styles.mono}>{short(w.address)}</span><span className={styles.fine}>HF below {w.hfBelow ?? 'off'}</span><a className={styles.link} href={`/positions?addr=${w.address}`}>Positions</a><button type="button" className={styles.textBtn} onClick={() => { const n = list.filter((x) => x.address !== w.address); saveWatched(n); setList(n) }}>Stop</button></li>)}</ul> : null}
        <p className={styles.fine}>Saved on this device. Marque re-reads watched positions every 5 minutes while a Marque tab is open.</p>
      </section>
    </div>
  )
}
