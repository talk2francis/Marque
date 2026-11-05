'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ProofRow } from '../../lib/proof'
import { OUTSIDE_OPERATOR_LABEL, OUTSIDE_OPERATOR_NOTE } from '../../lib/funder-label'
import styles from './proof.module.css'

const FUNDER = { outside: 'Outside wallet', team: 'Marque team (test)', operator: "The agent's own operator" } as const
const FUNDER_SHORT = { outside: 'Outside', team: 'Team', operator: 'Own operator' } as const
const STATE: Record<string, string> = { OPEN: 'Open', FUNDED: 'Awaiting delivery', SUBMITTED: 'Delivered', COMPLETED: 'Settled', PAID: 'Paid out', REFUNDED: 'Refunded', DISPUTED: 'Disputed', REJECTED: 'Rejected', CANCELLED: 'Cancelled', EXPIRED: 'Expired' }
/** The state filter's groups, in the order a job moves through escrow. */
const STAGES = {
  any: { label: 'Any state', has: () => true },
  waiting: { label: 'Open or awaiting delivery', has: (r: ProofRow) => r.state === 'OPEN' || r.state === 'FUNDED' },
  delivered: { label: 'Delivered, in review', has: (r: ProofRow) => r.state === 'SUBMITTED' || r.state === 'DISPUTED' },
  settled: { label: 'Settled and paid out', has: (r: ProofRow) => r.settled },
  refunded: { label: 'Refunded, expired or cancelled', has: (r: ProofRow) => ['REFUNDED', 'EXPIRED', 'CANCELLED', 'REJECTED'].includes(r.state) },
} as const
type Stage = keyof typeof STAGES
/** A state's tone on the badge: done, moving, stopped. Champagne palette only. */
const tone = (s: string) => (s === 'COMPLETED' || s === 'PAID' ? 'done' : s === 'SUBMITTED' || s === 'FUNDED' || s === 'OPEN' ? 'moving' : 'stopped')
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null)
const PAGE = 40

/**
 * Every row, team jobs included (2 Nov filter pass): search by agent, job or wallet; who paid; network; where the job
 * stands; only jobs with decided chain checks. Funder, network and the scorecard's shortcuts stay in the URL, so each
 * figure above links to exactly the rows it counts.
 */
export function ProofTable({ rows }: { rows: ProofRow[] }) {
  const [funder, setFunder] = useState<'all' | keyof typeof FUNDER>('all')
  const [chain, setChain] = useState<'all' | '56' | '97'>('all')
  const [stage, setStage] = useState<Stage>('any')
  const [checked, setChecked] = useState(false)
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => {
    const u = new URLSearchParams(window.location.search)
    const f = u.get('funder'); const c = u.get('chain')
    if (f && f in FUNDER) setFunder(f as keyof typeof FUNDER)
    if (c === '56' || c === '97') setChain(c)
    if (u.get('state') === 'settled') setStage('settled')
    setChecked(u.get('checked') === '1')
  }, [])
  useEffect(() => { setLimit(PAGE) }, [funder, chain, stage, checked, q])
  const sync = (f: typeof funder, c: typeof chain) => {
    const u = new URLSearchParams(); if (f !== 'all') u.set('funder', f); if (c !== 'all') u.set('chain', c)
    history.replaceState(null, '', `${u.size ? `?${u}` : window.location.pathname}#jobs`)
  }
  const pickFunder = (f: typeof funder) => { setFunder(f); sync(f, chain) }
  const pickChain = (c: typeof chain) => { setChain(c); sync(funder, c) }
  const needle = q.trim().toLowerCase().replace(/^#/, '')
  const base = useMemo(() => rows.filter((r) => (chain === 'all' || String(r.chainId) === chain) && STAGES[stage].has(r) && (!checked || (r.checks?.decided ?? 0) > 0)
    && (!needle || r.jobId === needle || (r.agent.name ?? '').toLowerCase().includes(needle) || r.client.toLowerCase().includes(needle))), [rows, chain, stage, checked, needle])
  const shown = useMemo(() => base.filter((r) => funder === 'all' || r.funderClass === funder), [base, funder])
  const count = (f: typeof funder) => base.filter((r) => f === 'all' || r.funderClass === f).length
  const filtered = funder !== 'all' || chain !== 'all' || stage !== 'any' || checked || needle !== ''
  const clear = () => { setFunder('all'); setChain('all'); setStage('any'); setChecked(false); setQ(''); sync('all', 'all') }
  return (
    <section id="jobs" className={styles.jobs} aria-label="Every job">
      <div className={styles.bar}>
        <label className={styles.search}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" strokeLinecap="round" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agent, job number or wallet" aria-label="Search jobs" spellCheck={false} />
        </label>
        <div className={styles.seg} role="radiogroup" aria-label="Network">
          {(['all', '56', '97'] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={chain === c} onClick={() => pickChain(c)}>{c === 'all' ? 'Both networks' : c === '56' ? 'Mainnet' : 'Testnet'}</button>
          ))}
        </div>
        <select className={styles.select} value={stage} onChange={(e) => setStage(e.target.value as Stage)} aria-label="Where the job stands">
          {(Object.keys(STAGES) as Stage[]).map((k) => <option key={k} value={k}>{STAGES[k].label}</option>)}
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>With chain checks</span>
        </label>
      </div>
      <div className={styles.paidBy} role="radiogroup" aria-label="Paid by">
        <div className={styles.tabs}>
          {(['all', 'outside', 'team', 'operator'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={funder === f} className={styles.tabBtn} onClick={() => pickFunder(f)}>
              {f === 'all' ? 'Everyone' : FUNDER_SHORT[f]}<span>{count(f)}</span>
            </button>
          ))}
        </div>
        <span className={styles.resultCount} role="status" aria-live="polite">
          {shown.length} {shown.length === 1 ? 'job' : 'jobs'}{filtered ? <> · <button type="button" className={styles.linkBtn} onClick={clear}>Clear filters</button></> : null}
        </span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Job</th><th>Agent</th><th>Paid by</th><th>State</th><th>Chain checks</th><th>Terms</th><th>Rated</th><th>Acted on</th><th>Escrow</th></tr></thead>
          <tbody>
            {shown.slice(0, limit).map((r) => (
              <tr key={`${r.chainId}:${r.jobId}`} data-funder={r.funderClass}>
                <td data-label="Job"><a href={`/jobs/${r.chainId}/${r.jobId}`}>#{r.jobId}</a><span className={styles.sub}>{r.chainId === 97 ? 'Testnet' : 'Mainnet'}{r.createdAt ? ` · ${day(r.createdAt)}` : ''}</span></td>
                <td data-label="Agent">{r.agent.name ?? 'Identity not linked'}<span className={styles.sub}>{r.agent.agentKey ? r.operatorClass === 'reference' ? 'Marque reference' : 'Third party' : 'On-chain job; agent identity not established'}</span></td>
                <td data-label="Paid by"><span className={styles.funder} data-funder={r.funderClass} title={r.alsoOperator ? OUTSIDE_OPERATOR_NOTE : undefined}>{r.alsoOperator ? OUTSIDE_OPERATOR_LABEL : FUNDER[r.funderClass]}</span><span className={styles.sub}>{short(r.client)}</span></td>
                <td data-label="State"><span className={styles.state} data-tone={tone(r.state)}>{STATE[r.state] ?? r.state}</span>{r.counted ? <span className={styles.sub}>counted for Set and Earn</span> : null}</td>
                <td data-label="Chain checks">{r.checks && r.checks.decided ? <span data-all={r.checks.agreed === r.checks.decided || undefined} className={styles.checks}>{r.checks.agreed} of {r.checks.decided} agree</span> : <span className={styles.none}>none</span>}</td>
                <td data-label="Terms">{r.terms ? `${r.terms.met} of ${r.terms.of}${r.terms.source === 'standard' ? ' (Standard)' : r.terms.source === 'buyer' ? ' (buyer set)' : ' (signed)'}` : <span className={styles.none}>none</span>}</td>
                <td data-label="Rated">{r.rated ? 'Yes' : <span className={styles.none}>no</span>}</td>
                <td data-label="Acted on">{r.act ? (r.act.tx ? <a href={`https://${r.chainId === 97 ? 'testnet.' : ''}bscscan.com/tx/${r.act.tx}`} target="_blank" rel="noreferrer">{r.act.action}</a> : r.act.action) : <span className={styles.none}>no</span>}</td>
                <td data-label="Escrow">{r.hireTx ? <a href={`https://${r.chainId === 97 ? 'testnet.' : ''}bscscan.com/tx/${r.hireTx}`} target="_blank" rel="noreferrer">payment</a> : null}{r.hireTx ? ' · ' : null}<a href={r.verifyUrl} target="_blank" rel="noreferrer">getJob</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length ? <p className={styles.note}>No job matches these filters. <button type="button" className={styles.linkBtn} onClick={clear}>Clear filters</button></p> : null}
      {shown.length > limit ? <button type="button" className={styles.more} onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more of {shown.length - limit}</button> : null}
      {rows.some(r => !r.agent.agentKey) ? <details className={styles.note}><summary>Why some agent identities are not linked</summary><p>The job and its answer remain available on chain. A hire through Marque names the agent directly; a shared payment wallet alone cannot identify which agent delivered an outside job.</p></details> : null}
    </section>
  )
}
