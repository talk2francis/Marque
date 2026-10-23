import Link from 'next/link'
import { Check } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { BRAND } from '@marque/ui'
import { Stars } from '../_components/ui'
import { AgentAvatar } from '../_components/AgentAvatar'
import { TermsHireStateCell, TermsPriceCell } from '../_components/terms/TermsCell'
import type { MarketRow } from '../register/market-model'
import { referenceAgent } from '../../lib/reference-agents'
import { explorerAddress } from '../../lib/network'
import { answersFree, describe, deliveryWords, hireBlocked, isHireable, profileHref, quotedPriceOf } from '../register/market-model'
import styles from './compare.module.css'

/**
 * Agents side by side (shared by /compare and the marketplace's compare sheet).
 *
 * Read like a spec sheet, not a database: one plain question per row, in the order that
 * decides a hire, and the strongest value in a comparable row marked "Best" in moss. A mark
 * is shown only when the values really differ and are measured the same way (same token for
 * prices, measured delivery times, buyer-linked ratings); otherwise no row is marked.
 * Technical identity details sit in a closed section at the end.
 *
 * No hooks and no fetch, so the sheet opens instantly from cards already on screen and the
 * server page can pass link builders. Live prices refresh inside their own cells.
 */
type Better = 'lower' | 'higher'
interface Row {
  key: string
  label: string
  /** A comparable number per agent, or null when it has none. */
  score?: (a: MarketRow) => number | null
  better?: Better
  /** What the Best mark means for this row, for the summary strip. */
  bestWord?: string
  /** Values compete only within one unit (a price's token and network). */
  unit?: (a: MarketRow) => string | null
  render: (a: MarketRow, ctx: Ctx) => ReactNode
}
interface Ctx { hireLink: (a: MarketRow) => string; tryLink: (a: MarketRow) => string; onNavigate?: () => void }

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid trading', yield: 'Yield', health_factor: 'Health factor', security: 'Security',
}
const net = (a: MarketRow) => (a.agentId.startsWith('97:') ? 'BSC testnet (practice)' : 'BSC mainnet')
const dash = <span className={styles.none}>Not yet</span>

const ROWS: Row[] = [
  {
    key: 'price', label: 'Price per job', better: 'lower', bestWord: 'Lowest price',
    score: (a) => quotedPriceOf(a)?.value ?? null,
    unit: (a) => quotedPriceOf(a)?.unit ?? null,
    render: (a) => <TermsPriceCell agentId={a.agentId} facts={a.commerce} declared={a.priceProvenance === 'CLAIMED' ? a.price : null} />,
  },
  {
    key: 'hire', label: 'Can you hire it now',
    render: (a) => <TermsHireStateCell agentId={a.agentId} facts={a.commerce} blocked={hireBlocked(a)} />,
  },
  {
    key: 'speed', label: 'Delivers in', better: 'lower', bestWord: 'Fastest',
    score: (a) => a.track.delivery.medianSeconds,
    render: (a) => {
      const d = deliveryWords(a.track.delivery.medianSeconds)
      return d ? <><span className={styles.big}>{d}</span><span className={styles.sub}>typical, from {a.track.delivery.samples} paid {a.track.delivery.samples === 1 ? 'job' : 'jobs'}</span></> : <><span>{dash}</span><span className={styles.sub}>no paid jobs to time yet</span></>
    },
  },
  {
    key: 'rating', label: 'Buyer rating', better: 'higher', bestWord: 'Best rated',
    score: (a) => (a.track.available !== false && a.track.verified.count > 0 ? a.track.verified.averageStars : null),
    render: (a) => a.track.available === false
      ? <span className={styles.sub}>Unavailable right now</span>
      : a.track.verified.count > 0
        ? <><span className={styles.rating}><Stars value={a.track.verified.averageStars} count={a.track.verified.count} label={a.track.verified.count === 1 ? 'paying buyer' : 'paying buyers'} /></span><span className={styles.sub}>from buyers who paid for a delivered job</span></>
        : <><span>{dash}</span><span className={styles.sub}>no paying buyer has rated it</span></>,
  },
  {
    key: 'jobs', label: 'Jobs delivered', better: 'higher', bestWord: 'Most jobs delivered',
    score: (a) => (a.track.available === false ? null : a.track.jobs.delivered),
    render: (a) => {
      const j = a.track.jobs
      if (a.track.available === false) return <span className={styles.sub}>Unavailable right now</span>
      if (!j.funded) return <><span>{dash}</span><span className={styles.sub}>no paid jobs yet</span></>
      const issues = [j.refunded ? `${j.refunded} refunded` : null, j.disputed ? `${j.disputed} disputed` : null].filter(Boolean).join(', ')
      return <><span className={styles.big}>{j.delivered}</span><span className={styles.sub}>of {j.funded} paid{issues ? `, ${issues}` : ''}{j.fromTeam ? `, ${j.fromTeam} by ${BRAND.name}'s team` : ''}</span></>
    },
  },
  {
    key: 'test', label: `${BRAND.name}'s test`, better: 'higher', bestWord: 'Passed the test',
    score: (a) => (a.warrant.status === 'warranted' ? 1 : a.warrant.status === 'failed' ? 0 : null),
    render: (a) => a.warrant.status === 'warranted'
      ? <><span className={styles.pass}><Check aria-hidden="true" />Passed</span><span className={styles.sub}>{a.warrant.date ? `on ${a.warrant.date.slice(0, 10)}` : ''}</span></>
      : a.warrant.status === 'failed'
        ? <><span className={styles.fail}>Not passed</span><span className={styles.sub}>{a.warrant.failedField ? `missed ${a.warrant.failedField.replace(/_/g, ' ')}` : 'missed a checked answer'}</span></>
        : <><span>{dash}</span><span className={styles.sub}>not tested yet</span></>,
  },
  {
    key: 'live', label: 'Answering now', better: 'lower', bestWord: 'Quickest to answer',
    score: (a) => (a.liveness === 'live' && a.latencyMs !== null ? a.latencyMs : null),
    render: (a) => a.liveness === 'live'
      ? <><span className={styles.on}><span className={styles.dotOn} aria-hidden="true" />Yes</span>{a.latencyMs !== null ? <span className={styles.sub}>replied in {a.latencyMs} ms</span> : null}</>
      : a.liveness === 'reachable'
        ? <><span>Partly</span><span className={styles.sub}>its card answers</span></>
        : <><span className={styles.sub}>{a.liveness === 'down' ? 'Not answering' : 'Not checked yet'}</span></>,
  },
  {
    key: 'does', label: 'What it does',
    render: (a) => {
      const blurb = describe(a)
      return <><span className={styles.cat}>{a.category && a.category !== 'unclassified' ? CATEGORY_LABEL[a.category] ?? a.category : 'Other'}</span>{blurb ? <span className={styles.blurb}>{blurb}</span> : null}</>
    },
  },
  {
    key: 'who', label: 'Run by',
    render: (a) => a.isReference
      ? <><span>{BRAND.name}</span><a className={styles.sub} href="/register#reference-agents">reference agent, same rules</a></>
      : <><span>Independent builder</span>{a.ownerLabel ? <span className={`${styles.sub} mono`}>{a.ownerLabel}</span> : null}</>,
  },
  { key: 'net', label: 'Network', render: (a) => <span>{net(a)}</span> },
  {
    key: 'try', label: 'Try before paying',
    render: (a, c) => answersFree(a) && profileHref(a)
      ? <a className={`btn btn--sm ${styles.cellBtn}`} href={c.tryLink(a)} onClick={c.onNavigate}>Try free</a>
      : <span className={styles.sub}>Not offered</span>,
  },
]

/** The best agent ids for a row: only when at least two have a value and the values differ. */
function bestOf(row: Row, chosen: MarketRow[]): Set<string> {
  if (!row.score || !row.better) return new Set()
  const vals = chosen.map((a) => ({ id: a.agentId, v: row.score!(a), u: row.unit ? row.unit(a) : '' })).filter((x): x is { id: string; v: number; u: string } => x.v !== null && Number.isFinite(x.v) && x.u !== null)
  if (vals.length < 2) return new Set()
  // A price in U and a price in USDT, or on two networks, are not compared.
  if (new Set(vals.map((x) => x.u)).size > 1) return new Set()
  const top = row.better === 'lower' ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v))
  const winners = vals.filter((x) => x.v === top)
  // Everyone tied: nothing stands out, so nothing is marked.
  if (winners.length === vals.length) return new Set()
  return new Set(winners.map((x) => x.id))
}

export function CompareTable({ chosen, hireLink, tryLink, onNavigate }: {
  chosen: MarketRow[]
  hireLink: (a: MarketRow) => string
  tryLink: (a: MarketRow) => string
  onNavigate?: () => void
}) {
  const ctx: Ctx = { hireLink, tryLink, onNavigate }
  const best = new Map(ROWS.map((r) => [r.key, bestOf(r, chosen)]))
  const summary = ROWS.filter((r) => r.bestWord && (best.get(r.key)?.size ?? 0) === 1)
    .map((r) => ({ word: r.bestWord!, name: chosen.find((a) => best.get(r.key)!.has(a.agentId))!.name }))
  const style = { '--compare-count': chosen.length } as CSSProperties

  return (
    <div className={styles.wrap}>
      {summary.length ? (
        <ul className={styles.summary} aria-label="Where each agent stands out">
          {summary.map((s) => <li key={s.word}><span className={styles.summaryWord}>{s.word}</span> {s.name}</li>)}
        </ul>
      ) : null}

      <div className={styles.table} role="table" aria-label="Agents compared" style={style}>
        <div className={styles.headRow} role="row">
          <div className={styles.corner} role="columnheader"><span className={styles.cornerText}>Agent</span></div>
          {chosen.map((a) => (
            <div key={a.agentId} className={styles.agentHead} role="columnheader">
              <AgentAvatar id={a.agentId} name={a.name} category={a.category} reference={a.isReference} imageUrl={a.identity.imageUrl} size={40} />
              <Link href={profileHref(a) ?? '/register'} className={styles.agentName} onClick={onNavigate}>{a.name}</Link>
              {a.isReference ? <span className={styles.refTag}>{BRAND.name} reference</span> : null}
            </div>
          ))}
        </div>

        {ROWS.map((r) => {
          const winners = best.get(r.key)!
          return (
            <div key={r.key} className={styles.row} role="row">
              <div className={styles.label} role="rowheader">{r.label}</div>
              {chosen.map((a) => {
                const isBest = winners.has(a.agentId)
                return (
                  <div key={a.agentId} className={styles.cell} role="cell" data-best={isBest || undefined}>
                    {isBest ? <span className={styles.bestTag}><Check aria-hidden="true" />Best</span> : null}
                    {r.render(a, ctx)}
                  </div>
                )
              })}
            </div>
          )
        })}

        <div className={`${styles.row} ${styles.actionRow}`} role="row">
          <div className={styles.label} role="rowheader">Hire</div>
          {chosen.map((a) => (
            <div key={a.agentId} className={styles.cell} role="cell">
              {isHireable(a) && profileHref(a)
                ? <a className={`btn btn--sm btn--primary ${styles.cellBtn}`} href={hireLink(a)} onClick={onNavigate}>Hire</a>
                : <span className={styles.sub}>{hireBlocked(a)}</span>}
            </div>
          ))}
        </div>
      </div>

      <details className={styles.tech}>
        <summary>Technical details</summary>
        <div className={styles.table} role="table" aria-label="Technical details" style={style}>
          <div className={styles.row} role="row">
            <div className={styles.label} role="rowheader">Ways to call it</div>
            {chosen.map((a) => <div key={a.agentId} className={styles.cell} role="cell"><span className={styles.sub}>{a.interfaces.length ? a.interfaces.map((i) => i.toUpperCase()).join(', ') : 'none listed'}</span></div>)}
          </div>
          <div className={styles.row} role="row">
            <div className={styles.label} role="rowheader">Protocols it declares</div>
            {chosen.map((a) => <div key={a.agentId} className={styles.cell} role="cell"><span className={styles.sub}>{[...a.protocols, ...(a.identity.x402 ? ['x402'] : [])].join(', ') || 'none declared'}</span></div>)}
          </div>
          <div className={styles.row} role="row">
            <div className={styles.label} role="rowheader">On-chain identity</div>
            {chosen.map((a) => <IdentityCell key={a.agentId} a={a} />)}
          </div>
        </div>
      </details>
    </div>
  )
}

function IdentityCell({ a }: { a: MarketRow }) {
  const chain = a.agentId.startsWith('97:') ? 97 : 56
  const ref = a.isReference && chain === 56 ? referenceAgent(a.agentId) : null
  const tokenId = ref ? String(ref.erc8004.tokenId) : a.tokenId
  const ownerAddr = ref ? ref.erc8004.wallet : a.owner
  if (!(tokenId && /^\d+$/.test(tokenId))) return <div className={styles.cell} role="cell"><span className={styles.sub}>no token id in its metadata</span></div>
  return (
    <div className={styles.cell} role="cell">
      <a className={styles.link} href={explorerAddress(chain, ownerAddr ?? '')} target="_blank" rel="noreferrer">ERC-8004 <span className="mono">#{tokenId}</span></a>
      {ownerAddr ? <span className={`${styles.sub} mono`}>{ownerAddr.slice(0, 6)}…{ownerAddr.slice(-4)}</span> : null}
      {a.identityCount > 1 ? <span className={styles.sub}>+{a.identityCount - 1} more by this operator</span> : null}
    </div>
  )
}
