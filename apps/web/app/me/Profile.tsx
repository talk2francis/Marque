'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Statement, LinkButton, EmptyState, Chip, ProvenanceChip } from '@marque/ui'
import { Desk } from '../desk/Desk'
import { EarnPointers } from './EarnPointers'
import { explorerAddress } from '../../lib/network'
import styles from './me.module.css'

/**
 * The profile — everything Marque knows about one address, in one place.
 *
 * Connected, it is "My Marque". With ?addr= it is any address, shareable, no
 * wallet needed — the same read /positions offers. Nothing is stored: every
 * section is a projection of records that already exist keyed by this address,
 * plus the live chain read the Desk does. Absent things are stated, never shown
 * as a zero.
 */

interface ProfilePayload {
  address: string
  firstSeen: string | null
  chain: { nativeBalance: number | null; txCount: number | null; blockNumber: string | null }
  charters: { all: CharterLite[]; activeCount: number; callsUsed: number }
  hires: { all: HireLite[]; okCount: number; failedCount: number; agents: string[]; feeUsdTotal: number }
  receipts: { count: number; anchoredCount: number; latestId: string | null }
  seals: { all: SealLite[]; byOutcome: Record<string, number> }
  activity: ActivityLite[]
}
interface CharterLite {
  id: string; status: string; agentName: string | null; category: string; label: string | null
  grantedAt: string; expiresAt: string; secondsRemaining: number; callsUsed: number
  caps: Array<{ symbol: string; limit: number; spent: number; remaining: number }>
}
interface HireLite {
  id: string; agentId: string; agentName: string | null; category: string
  status: string; ok: boolean | null; failure: string | null; feeUsd: number | null
  startedAt: string; finishedAt: string | null; hasReceipt: boolean; receiptAnchored: boolean
}
interface SealLite {
  hash: string; agentId: string; category: string; issuedAt: string
  outcome: string; resolvedAt: string | null; chainId: number; sealTxHash: string | null
}
interface ActivityLite {
  at: string; kind: string; label: string; detail: string | null; href: string | null
  provenance: 'MEASURED' | 'ONCHAIN'
}

interface PositionsLite {
  pancakeV3?: { positions?: unknown[] }
  venus?: { hasPosition?: boolean; healthFactor?: number | null }
  spot?: { idleStableUsd?: number }
  bestYield?: { protocol: string; asset: string; netAprPct: number; breakEvenUsd: number } | null
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const fmtNum = (n: number, dp = 4) => n.toLocaleString('en-US', { maximumFractionDigits: dp })
const fmtUsd = (n: number) => (n >= 1000 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`)

function ago(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
function until(seconds: number): string {
  if (seconds <= 0) return 'expired'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m left`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h left`
  return `${Math.floor(seconds / 86400)}d left`
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/

export function Profile({ addrParam }: { addrParam: string | null }) {
  const { address: connected, isConnected } = useAccount()
  const viewing = addrParam && ADDR_RE.test(addrParam) ? addrParam : null
  const address = viewing ?? (isConnected ? connected ?? null : null)
  const isOwn = Boolean(address) && !viewing

  const [data, setData] = useState<ProfilePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pos, setPos] = useState<PositionsLite | null>(null)
  const [paste, setPaste] = useState('')

  useEffect(() => {
    if (!address) { setData(null); return }
    let live = true
    setData(null); setErr(null)
    fetch(`/api/v1/profile/${address}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!live) return
        if (!r.ok) setErr(j.detail ?? j.error ?? 'Could not read this address.')
        else setData(j as ProfilePayload)
      })
      .catch(() => live && setErr('Could not reach the profile reader.'))
    return () => { live = false }
  }, [address])

  const onPositions = useCallback((d: PositionsLite) => setPos(d), [])

  const idleStableUsd = pos?.spot?.idleStableUsd ?? 0
  const hasLp = (pos?.pancakeV3?.positions?.length ?? 0) > 0
  const bestYield = pos?.bestYield ?? null

  const attention = useMemo(() => {
    const hf = pos?.venus?.healthFactor
    return (hf != null && hf < 1.8 ? 1 : 0) + (idleStableUsd > 1 ? 1 : 0)
  }, [pos, idleStableUsd])

  // ---- not addressable: no wallet, no ?addr= -------------------------------
  if (!address) {
    return (
      <div className={styles.gate}>
        <span className={styles.eyebrow}>My Marque</span>
        <Statement as="h1" size="page">Your positions, your charters, your record — one place.</Statement>
        <p className={styles.lede}>
          Connect a wallet and Marque assembles everything it already knows about that address:
          live positions read from chain, every charter you have granted, every agent hired for
          you and the receipt it left, and the recommendations sealed before their outcome. No
          account is created and nothing is stored — the wallet is the identity.
        </p>
        <div className={styles.gateAct}>
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              <button type="button" className={styles.connectBtn} onClick={openConnectModal} disabled={!mounted}>
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
        </div>
        <form
          className={styles.pasteRow}
          onSubmit={(e) => {
            e.preventDefault()
            const v = paste.trim()
            if (ADDR_RE.test(v)) window.location.search = `?addr=${v}`
          }}
        >
          <input
            className={styles.pasteInput}
            placeholder="…or paste any 0x address to view its profile"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Address to view"
          />
          <button type="submit" className={styles.pasteGo}>View</button>
        </form>
        <p className={styles.gateNote}>
          Just want the raw positions? <a href="/positions">The Positions reader</a> takes an
          address with no wallet at all.
        </p>
      </div>
    )
  }

  const c = data?.charters
  const h = data?.hires
  const activeCharters = (c?.all ?? []).filter((x) => x.status === 'active')

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <span className={styles.eyebrow}>{isOwn ? 'My Marque' : 'Profile'}</span>
        <Statement as="h1" size="page">
          {isOwn ? 'Connected as ' : 'Viewing '}
          <span className="mono">{short(address)}</span>
        </Statement>
        <div className={styles.idMeta}>
          <a className={styles.idLink} href={explorerAddress(56, address)} rel="noreferrer noopener" target="_blank">
            on BscScan ↗
          </a>
          {!isOwn && isConnected && (
            <a className={styles.idLink} href="/me">← back to my profile</a>
          )}
          {data?.firstSeen && (
            <span className={styles.idFact}>first seen on Marque {ago(data.firstSeen)}</span>
          )}
        </div>
      </header>

      {err && <div className={styles.error} role="alert">{err}</div>}

      {/* ---- at a glance ---------------------------------------------------- */}
      <section aria-label="At a glance">
        <div className={styles.statBand}>
          <Stat
            n={data ? (data.chain.nativeBalance == null ? null : data.chain.nativeBalance) : undefined}
            label="BNB balance" render={(v) => fmtNum(v, 4)} group="chain"
          />
          <Stat
            n={data ? data.chain.txCount : undefined}
            label="transactions" render={(v) => v.toLocaleString('en-US')} group="chain"
          />
          <Stat n={data ? (c?.activeCount ?? 0) : undefined} label="charters active" group="marque" />
          <Stat n={data ? (h?.all.length ?? 0) : undefined} label="hires" group="marque" />
          <Stat n={data ? (data.receipts.count ?? 0) : undefined} label="receipts" group="marque" />
          <Stat n={data ? (data.seals.all.length ?? 0) : undefined} label="sealed calls" group="marque" />
        </div>
        <p className={styles.bandNote}>
          <ProvenanceChip provenance="ONCHAIN" /> balance and transaction count read from BNB Smart
          Chain. <ProvenanceChip provenance="MEASURED" /> the rest is Marque&rsquo;s own record for
          this address.
        </p>
      </section>

      {/* ---- positions --------------------------------------------------- */}
      <section className={styles.block} aria-labelledby="pos-h">
        <div className={styles.blockHeadRow}>
          <h2 className={styles.blockHead} id="pos-h">Positions</h2>
          {attention > 0 && <Chip tone="watch">{attention} need{attention === 1 ? 's' : ''} attention</Chip>}
        </div>
        <Desk initialAddress={address} onData={onPositions} showAddressForm={false} />
      </section>

      {/* ---- put capital to work --------------------------------------- */}
      {pos && (
        <EarnPointers idleStableUsd={idleStableUsd} hasLpPosition={hasLp} bestYield={bestYield} />
      )}

      {/* ---- charters -------------------------------------------------- */}
      <section className={styles.block} aria-labelledby="ch-h">
        <div className={styles.blockHeadRow}>
          <h2 className={styles.blockHead} id="ch-h">
            Charters{c && c.all.length > 0 && <span className={`mono ${styles.count}`}>{c.all.length}</span>}
          </h2>
          <a className={styles.blockLink} href="/app/charters">every charter →</a>
        </div>
        {!data ? (
          <SkeletonRows n={2} />
        ) : c && c.all.length > 0 ? (
          <ul className={styles.rows}>
            {c.all.slice(0, 8).map((x) => {
              const cap = x.caps[0]
              return (
                <li key={x.id} className={styles.row}>
                  <span className={styles.rowMain}>{x.label ?? x.agentName ?? x.category}</span>
                  {cap && (
                    <span className={styles.rowMeta}>
                      {fmtNum(cap.spent, 4)} / {fmtNum(cap.limit, 4)} {cap.symbol}
                    </span>
                  )}
                  <span className={styles.rowMeta}>{x.callsUsed} call{x.callsUsed === 1 ? '' : 's'}</span>
                  <Chip tone={x.status === 'active' ? 'holds' : 'neutral'}>
                    {x.status === 'active' ? until(x.secondsRemaining) : x.status}
                  </Chip>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState title="No charter granted from this address yet.">
            <p>
              A charter is a spend-capped, revocable grant an agent acts inside. Grant one and it
              appears here with a live countdown and its spend.
            </p>
            <p><LinkButton href="/app/charter" variant="primary">Grant a charter</LinkButton></p>
          </EmptyState>
        )}
        {activeCharters.length > 0 && (
          <p className={styles.subtle}>
            {activeCharters.length} active now · {c?.callsUsed ?? 0} call{(c?.callsUsed ?? 0) === 1 ? '' : 's'} made
            under charters from this address.
          </p>
        )}
      </section>

      {/* ---- hires & receipts ---------------------------------------- */}
      <section className={styles.block} aria-labelledby="hi-h">
        <div className={styles.blockHeadRow}>
          <h2 className={styles.blockHead} id="hi-h">
            Hires{h && h.all.length > 0 && <span className={`mono ${styles.count}`}>{h.all.length}</span>}
          </h2>
          {data && data.receipts.latestId && (
            <a className={styles.blockLink} href={`/receipts/${data.receipts.latestId}`}>latest receipt →</a>
          )}
        </div>
        {!data ? (
          <SkeletonRows n={3} />
        ) : h && h.all.length > 0 ? (
          <>
            <ul className={styles.rows}>
              {h.all.slice(0, 10).map((r) => (
                <li key={r.id} className={styles.row}>
                  <a className={styles.rowMain} href={`/runs/${r.id}`}>{r.agentName ?? r.agentId}</a>
                  <span className={styles.rowMeta}>{r.category.replace('_', ' ')}</span>
                  {r.ok === true && r.feeUsd != null && <span className={styles.rowMeta}>{fmtUsd(r.feeUsd)}</span>}
                  {r.hasReceipt && (
                    <a className={styles.rowMeta} href={`/receipts/${r.id}`}>
                      receipt{r.receiptAnchored ? ' · anchored' : ''}
                    </a>
                  )}
                  <Chip tone={r.ok === true ? 'holds' : r.ok === false ? 'breach' : 'neutral'}>
                    {r.status === 'running' ? 'running' : r.ok ? 'complete' : 'failed'}
                  </Chip>
                </li>
              ))}
            </ul>
            <p className={styles.subtle}>
              {h.okCount} completed · {h.failedCount} failed · {h.agents.length} distinct agent
              {h.agents.length === 1 ? '' : 's'}
              {h.feeUsdTotal > 0 ? ` · ${fmtUsd(h.feeUsdTotal)} in recorded fees` : ''}. Failed hires are
              kept — a legible failure is evidence too.
            </p>
          </>
        ) : (
          <EmptyState title="No agent has been hired for this address yet.">
            <p>
              Every hire is recorded here whether it succeeds or fails, with a link to its Run Room
              timeline and the four-proof receipt.
            </p>
            <p><LinkButton href="/register" variant="primary">Find an agent</LinkButton></p>
          </EmptyState>
        )}
      </section>

      {/* ---- sealed calls ------------------------------------------- */}
      <section className={styles.block} aria-labelledby="se-h">
        <div className={styles.blockHeadRow}>
          <h2 className={styles.blockHead} id="se-h">
            Sealed calls{data && data.seals.all.length > 0 && <span className={`mono ${styles.count}`}>{data.seals.all.length}</span>}
          </h2>
          <a className={styles.blockLink} href="/ledger">the Ledger →</a>
        </div>
        {!data ? (
          <SkeletonRows n={2} />
        ) : data.seals.all.length > 0 ? (
          <>
            <ul className={styles.rows}>
              {data.seals.all.slice(0, 8).map((s) => (
                <li key={s.hash} className={styles.row}>
                  <span className={styles.rowMain}>{s.category.replace('_', ' ')}</span>
                  <span className={styles.rowMeta}>{ago(s.issuedAt)}</span>
                  {s.sealTxHash && <span className={styles.rowMeta}>anchored</span>}
                  <Chip tone={s.outcome === 'correct' ? 'holds' : s.outcome === 'incorrect' ? 'breach' : 'neutral'}>
                    {s.outcome}
                  </Chip>
                </li>
              ))}
            </ul>
            <p className={styles.subtle}>
              A recommendation about this address, hashed and anchored before its outcome was
              known. That is what makes the track record falsifiable.
            </p>
          </>
        ) : (
          <EmptyState title="No sealed recommendation about this address.">
            <p>
              When an agent issues a recommendation, its hash is anchored on chain before the
              outcome exists. Those about this address would appear here.
            </p>
          </EmptyState>
        )}
      </section>

      {/* ---- activity ---------------------------------------------- */}
      <section className={styles.block} aria-labelledby="ac-h">
        <h2 className={styles.blockHead} id="ac-h">Activity</h2>
        {!data ? (
          <SkeletonRows n={4} />
        ) : data.activity.length > 0 ? (
          <ol className={styles.timeline}>
            {data.activity.slice(0, 40).map((a, i) => (
              <li key={`${a.at}-${i}`} className={styles.tItem}>
                <span className={styles.tWhen}>{ago(a.at)}</span>
                <span className={styles.tBody}>
                  {a.href ? <a href={a.href}>{a.label}</a> : a.label}
                  {a.detail && <span className={styles.tDetail}> — {a.detail}</span>}
                </span>
                <ProvenanceChip provenance={a.provenance} />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="Nothing recorded for this address yet.">
            <p>Grant a charter or hire an agent and the timeline fills in from real timestamps.</p>
          </EmptyState>
        )}
      </section>

      <p className={styles.foot}>
        Everything above is a projection of records Marque already holds for this address, or a
        live chain read. No account, no cookie, nothing stored about the wallet.
      </p>
    </div>
  )
}

function Stat({
  n, label, render, group,
}: {
  n: number | null | undefined
  label: string
  render?: (v: number) => string
  group: 'chain' | 'marque'
}) {
  return (
    <div className={styles.stat} data-group={group}>
      <span className={styles.statN}>
        {n === undefined ? <span className={styles.statDash}>·</span>
          : n === null ? <span className={styles.statDash} title="the chain read did not answer">n/a</span>
          : render ? render(n) : n.toLocaleString('en-US')}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={styles.skRow} style={{ width: `${60 + ((i * 13) % 35)}%` }} />
      ))}
    </div>
  )
}
