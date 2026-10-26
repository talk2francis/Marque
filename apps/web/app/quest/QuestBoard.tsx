import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Limits } from '@marque/ui'
import type { QuestResult } from '../../lib/quest-api'
import { explorerTx } from '../../lib/network'
import { DeclaredTick, ShareProgress } from './QuestIslands'
import { RemindersRow } from '../_components/campaign/Reminders'
import { NextStep } from './NextStep'
import styles from './quest.module.css'

/**
 * The organizer's two tracks for one address (SPEC-ADOPTION 2.2). Presentational only, so the
 * server page and the client checker render the same thing. Five states (invariant 33); only
 * Observed is green, Declared never is.
 */
type State = 'observed' | 'not_yet' | 'declared' | 'not_observable' | 'excluded'
type Check = { state: State; reason: string; next?: { label: string; href: string } | null }
type BuildAgent = QuestResult['build']['agents'][number]

const STATE_WORD: Record<State, string> = {
  observed: 'Observed on chain', not_yet: 'Not yet', declared: 'Declared', not_observable: 'Not observable here', excluded: 'Excluded',
}
const CATEGORY_WORD: Record<string, string> = { yield: 'Yield', grid: 'Grid trading', rebalancing: 'Rebalancing', health_factor: 'Health factor' }
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')

export function StateMark({ state }: { state: State }) {
  return (
    <span className={styles.mark} data-state={state} title={STATE_WORD[state]}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        {state === 'observed' ? <><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="var(--panel)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></> : null}
        {state === 'not_yet' ? <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" /> : null}
        {state === 'declared' ? <><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></> : null}
        {state === 'not_observable' ? <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.4 2.2" /> : null}
        {state === 'excluded' ? <><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3.8 12.2l8.4-8.4" stroke="currentColor" strokeWidth="1.4" /></> : null}
      </svg>
      <span className="sr-only">{STATE_WORD[state]}</span>
    </span>
  )
}

function Dots({ value, of, met }: { value: number; of: number; met: boolean }) {
  return (
    <span className={styles.dots} data-met={met || undefined} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => <i key={i} data-on={i < value || undefined} />)}
    </span>
  )
}

function HireCard({ q }: { q: QuestResult }) {
  const h = q.hire
  const team = q.excluded.team
  const agents = Math.min(h.distinctAgents, h.required.agents)
  const status = team ? 'excluded' : h.status
  const statusLine = status === 'met' ? `Seen on chain: ${h.distinctAgents} different agents across ${h.marketplaces.named.length} marketplaces.`
    : status === 'likely' ? 'Possibly met: one hire’s marketplace is not recorded on chain.'
      : status === 'excluded' ? 'Team wallet: shown here, never counted.'
        : `${h.distinctAgents} of ${h.required.agents} different agents, ${h.marketplaces.named.length} of ${h.required.marketplaces} marketplaces named.`
  const next = q.next.find((n) => n.action === 'hire')
  const s = q.suggestion
  return (
    <section className={styles.track} aria-labelledby="track-hire" data-status={status}>
      <header className={styles.trackHead}>
        <span className={styles.trackLabel} id="track-hire">Hire</span>
        <span className={styles.trackCount}>{agents} of {h.required.agents} different agents</span>
      </header>
      <Dots value={agents} of={h.required.agents} met={status === 'met'} />
      <p className={styles.trackStatus} data-status={status}>{statusLine}</p>
      <div className={styles.markets}>
        <span className={styles.marketsLabel}>Marketplaces</span>
        {h.marketplaces.named.length ? h.marketplaces.named.map((m) => <span key={m} className={styles.marketChip}><StateMark state={team ? 'excluded' : 'observed'} />{m}</span>) : <span className={styles.mutedInline}>none named yet</span>}
        {h.marketplaces.notRecorded ? <span className={styles.marketChip} data-quiet=""><StateMark state="not_observable" />{h.marketplaces.notRecorded} not recorded</span> : null}
      </div>
      {next && !team ? <p className={styles.next}><span>Next</span>{next.label}</p> : null}
      <div className={styles.trackActions}>
        {s && next ? <Link className="btn btn--sm btn--primary" href={s.href} scroll={false}>Hire {s.name ?? 'an agent'}{s.free ? ' free on testnet' : ` · ${s.price}`}</Link> : null}
        <a className="btn btn--sm" href="#marketplaces">See all {q.marketplaces.length} marketplaces</a>
      </div>
    </section>
  )
}

const CRITERIA: Array<{ n: string; title: string; key: string }> = [
  { n: '1', title: 'Registered, owned and listed', key: 'registered' },
  { n: '2', title: 'Agent card at its own domain', key: 'card' },
  { n: '3', title: 'Answers probes', key: 'probes' },
  { n: '4', title: 'Three independent hirers', key: 'hires' },
  { n: '5', title: 'Five actions on three days', key: 'actions' },
  { n: '6', title: 'Actions match the category', key: 'category' },
]

function criterion(a: BuildAgent, key: string): Check {
  const c = a.checks as Record<string, Check>
  if (key !== 'registered') return c[key] ?? { state: 'not_observable', reason: 'Not read.' }
  const reg = c['registered']!, listed = c['listed']!
  if (reg.state !== 'observed') return reg
  return { state: listed.state, reason: `${reg.reason} ${listed.reason}`, next: listed.next ?? null }
}

function BuildCard({ q }: { q: QuestResult }) {
  const team = q.excluded.team
  const a = q.build.agents[0]
  if (!a) {
    return (
      <section className={styles.track} aria-labelledby="track-build">
        <header className={styles.trackHead}>
          <span className={styles.trackLabel} id="track-build">Build</span>
          <span className={styles.trackCount}>0 of 6 criteria</span>
        </header>
        <Dots value={0} of={6} met={false} />
        <p className={styles.trackStatus}>No ERC-8004 agent owned by this wallet on BSC mainnet or testnet.</p>
        <div className={styles.trackActions}><Link className="btn btn--sm btn--primary" href="/builders">Start your agent</Link></div>
      </section>
    )
  }
  const timing = (a.checks as Record<string, Check>)['timing']
  return (
    <section className={styles.track} aria-labelledby="track-build">
      <header className={styles.trackHead}>
        <span className={styles.trackLabel} id="track-build">Build</span>
        <span className={styles.trackCount}>{a.observed} of 6 criteria observed</span>
      </header>
      <Dots value={a.observed} of={6} met={!team && a.observed === 6} />
      <p className={styles.agentLine}>
        <Link href={a.chainId === 97 ? `/agents/97/${a.tokenId}` : `/agents/${a.tokenId}`}>{a.name ?? `Agent #${a.tokenId}`}</Link>
        <span>#{a.tokenId} · {a.chainId === 97 ? 'BSC testnet' : 'BSC mainnet'}</span>
      </p>
      <ol className={styles.checks}>
        {CRITERIA.map((c) => {
          const v = criterion(a, c.key)
          const state = team && v.state === 'observed' ? 'excluded' : v.state
          return (
            <li key={c.key} data-state={state}>
              <StateMark state={state} />
              <div>
                <span className={styles.checkTitle}><span className={styles.checkN}>{c.n}</span>{c.title}</span>
                <span className={styles.checkReason}>{v.reason}</span>
                {v.next && state !== 'observed' && !team ? <Link className={styles.checkNext} href={v.next.href}>{v.next.label}</Link> : null}
              </div>
            </li>
          )
        })}
        {timing ? (
          <li data-state={timing.state}>
            <StateMark state={timing.state} />
            <div>
              <span className={styles.checkTitle}><span className={styles.checkN} aria-hidden="true">·</span>Originality</span>
              <span className={styles.checkReason}>{timing.reason}</span>
            </div>
          </li>
        ) : null}
      </ol>
      {q.build.agents.length > 1 || q.build.more ? <p className={styles.mutedInline}>This wallet owns {q.build.agents.length + q.build.more} agents; the one furthest along is shown. {q.build.agents.slice(1).map((x) => `${x.name ?? `#${x.tokenId}`} ${x.observed}/6`).join(', ')}</p> : null}
    </section>
  )
}

function HireTable({ q }: { q: QuestResult }) {
  if (!q.hire.hires.length) return <p className={styles.empty}>No ERC-8183 hire from this wallet since 1 Oct, on either network.</p>
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Date</th><th>Network</th><th>Agent</th><th>Marketplace</th><th>Counts</th><th>Deposit</th></tr></thead>
        <tbody>
          {q.hire.hires.map((h) => (
            <tr key={`${h.chainId}:${h.jobId}`} data-counts={h.counts || undefined}>
              <td data-label="Date">{day(h.fundedAt ?? h.createdAt)}</td>
              <td data-label="Network">{h.chainId === 97 ? 'Testnet' : 'Mainnet'}</td>
              <td data-label="Agent"><span className={styles.agentCell}>{h.agent.name ?? (h.agent.tokenId ? `#${h.agent.tokenId}` : 'Agent not identified')}<span>job #{h.jobId}</span></span></td>
              <td data-label="Marketplace">{h.marketplaceName ?? <span className={styles.mutedInline}>Not recorded</span>}</td>
              <td data-label="Counts">{q.excluded.team ? <span className={styles.mutedInline}>Team wallet</span> : h.counts ? <span className={styles.yes}><StateMark state="observed" />Counts</span> : <span className={styles.mutedInline}>{h.reason}</span>}</td>
              <td data-label="Deposit">{h.fundedTx ? <a href={explorerTx(h.chainId, h.fundedTx)} target="_blank" rel="noreferrer" className={styles.tx}>{short(h.fundedTx)}<ArrowUpRight aria-hidden="true" /></a> : <span className={styles.mutedInline}>none</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function QuestBoard({ q, shareable = true }: { q: QuestResult; shareable?: boolean }) {
  return (
    <div className={styles.board}>
      {q.excluded.team ? <p className={styles.excluded} role="note"><StateMark state="excluded" />{q.excluded.reason}</p> : null}
      {q.closed ? <p className={styles.closed} role="note">Set and Earn closed on 5 Nov at 12:00 UTC. BNB Chain verifies and announces winners after 13 November.</p> : null}
      <NextStep q={q} />
      <div className={styles.tracks}>
        <HireCard q={q} />
        <BuildCard q={q} />
      </div>

      <section className={styles.section} aria-labelledby="every-hire">
        <h2 id="every-hire" className={styles.h2}>Every hire, from chain</h2>
        <HireTable q={q} />
      </section>

      <section className={styles.rows} aria-label="Registration, reminders and sharing">
        <div className={styles.row}>
          <span className={styles.rowLabel}>Registration with BNB</span>
          <DeclaredTick address={q.address} formUrl={q.registration.formUrl} />
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Reminders</span>
          <RemindersRow address={q.address} />
        </div>
        {shareable ? (
          <div className={styles.row} id="share">
            <span className={styles.rowLabel}>Share your progress</span>
            <ShareProgress address={q.address} agents={Math.min(q.hire.distinctAgents, 3)} markets={Math.min(q.hire.marketplaces.named.length, 2)} build={q.build.agents[0]?.observed ?? 0} />
          </div>
        ) : null}
      </section>

      <section className={styles.fair} aria-label="Fair play">
        <p>One wallet per person. BNB Chain excludes team members of shortlisted marketplaces and wallets that are controlled or funded in common, and makes the final decision.</p>
        <Limits>
          <ul>
            <li>Hires are read from BNB Chain&apos;s ERC-8183 escrow on BSC mainnet and testnet, for every marketplace. A hire counts from its deposit (JobFunded) inside the window, 1 Oct 12:00 UTC to 5 Nov 12:00 UTC. A job that was created but never funded is listed and not counted.</li>
            <li>A marketplace is named only from the job record itself, in this order: Marque&apos;s own hire record, <code>client_ref</code> in the description, a <code>via &lt;domain&gt;</code> in the task, then known envelope formats. Anything else is &ldquo;Not recorded&rdquo;. <Link href="/docs/attribution">How attribution works</Link>.</li>
            <li>Independent hirers: {q.method.independence}</li>
            <li>Listings on other marketplaces, BNB&apos;s registration form and your public repository cannot be seen from chain data, so they show as Not observable here or Declared.</li>
            <li>Read on chain at {new Date(q.observedAt).toISOString().slice(11, 16)} UTC. The same data, for any address: <a href={`/api/v1/quest/${q.address}`}>/api/v1/quest/{short(q.address)}</a>.</li>
          </ul>
        </Limits>
      </section>

      <section className={styles.section} id="marketplaces" aria-labelledby="mk-title">
        <h2 id="mk-title" className={styles.h2}>The nine shortlisted marketplaces</h2>
        <ul className={styles.mkList}>
          {q.marketplaces.map((m) => (
            <li key={m.domain}><a href={m.url} target="_blank" rel="noreferrer">{m.name}<span>{m.domain}</span><ArrowUpRight aria-hidden="true" /></a></li>
          ))}
        </ul>
      </section>

      <details className={styles.tryFour}>
        <summary>Try all four on Marque <span>Optional. Not part of BNB Chain&apos;s rules.</span></summary>
        <ul>
          {q.tryAllFour.map((t) => (
            <li key={t.category} data-done={t.done || undefined}>
              <StateMark state={t.done ? 'observed' : 'not_yet'} />
              <span>{CATEGORY_WORD[t.category] ?? t.category}</span>
              {t.done && t.job ? <Link href={`/jobs/${t.job.chainId}/${t.job.jobId}`}>job #{t.job.jobId}</Link> : <Link href={`/register/${t.category}`}>See agents</Link>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
