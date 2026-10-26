'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ProofRow } from '../../lib/proof'
import styles from './proof.module.css'

const FUNDER = { outside: 'Outside buyer', team: 'Marque team (test)', operator: "The agent's own operator" } as const
const STATE: Record<string, string> = { OPEN: 'Open', FUNDED: 'Awaiting delivery', SUBMITTED: 'Delivered', COMPLETED: 'Settled', PAID: 'Paid out', REFUNDED: 'Refunded', DISPUTED: 'Disputed', REJECTED: 'Rejected', CANCELLED: 'Cancelled', EXPIRED: 'Expired' }
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Every row, team jobs included; chips filter by funder and network, mirrored in the URL so the numbers above link here. */
export function ProofTable({ rows }: { rows: ProofRow[] }) {
  const [funder, setFunder] = useState<'all' | keyof typeof FUNDER>('all')
  const [chain, setChain] = useState<'all' | '56' | '97'>('all')
  const [extra, setExtra] = useState<{ settled: boolean; checked: boolean }>({ settled: false, checked: false })
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const f = q.get('funder'); const c = q.get('chain')
    if (f && f in FUNDER) setFunder(f as keyof typeof FUNDER)
    if (c === '56' || c === '97') setChain(c)
    setExtra({ settled: q.get('state') === 'settled', checked: q.get('checked') === '1' })
  }, [])
  const shown = useMemo(() => rows.filter((r) => (funder === 'all' || r.funderClass === funder) && (chain === 'all' || String(r.chainId) === chain)
    && (!extra.settled || r.settled) && (!extra.checked || (r.checks?.decided ?? 0) > 0)), [rows, funder, chain, extra])
  const set = (f: typeof funder, c: typeof chain) => {
    setFunder(f); setChain(c); setExtra({ settled: false, checked: false })
    const q = new URLSearchParams(); if (f !== 'all') q.set('funder', f); if (c !== 'all') q.set('chain', c)
    history.replaceState(null, '', `${q.size ? `?${q}` : window.location.pathname}#jobs`)
  }
  return (
    <section id="jobs" className={styles.jobs} aria-label="Every job">
      <div className={styles.chips} role="group" aria-label="Filter">
        {(['all', 'outside', 'team', 'operator'] as const).map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={funder === f} onClick={() => set(f, chain)}>{f === 'all' ? 'Everyone' : FUNDER[f]} <span>{rows.filter((r) => (f === 'all' || r.funderClass === f) && (chain === 'all' || String(r.chainId) === chain)).length}</span></button>
        ))}
        <span className={styles.sep} aria-hidden="true" />
        {(['all', '56', '97'] as const).map((c) => (
          <button key={c} type="button" className={styles.chip} aria-pressed={chain === c} onClick={() => set(funder, c)}>{c === 'all' ? 'Both networks' : c === '56' ? 'Mainnet' : 'Testnet'}</button>
        ))}
      </div>
      {extra.settled || extra.checked ? <p className={styles.note}>Showing only {extra.settled ? 'completed jobs' : 'jobs with decided chain checks'}. <button type="button" className={styles.linkBtn} onClick={() => set(funder, chain)}>Show all</button></p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Job</th><th>Agent</th><th>Paid by</th><th>State</th><th>Chain checks</th><th>Terms</th><th>Rated</th><th>Acted on</th><th>Escrow</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.chainId}:${r.jobId}`} data-funder={r.funderClass}>
                <td data-label="Job"><a href={`/jobs/${r.chainId}/${r.jobId}`}>#{r.jobId}</a> <span className={styles.net97}>{r.chainId === 97 ? 'testnet' : 'mainnet'}</span></td>
                <td data-label="Agent">{r.agent.name ?? 'Unidentified'}<span className={styles.sub}>{r.operatorClass === 'reference' ? 'Marque reference' : 'Third party'}</span></td>
                <td data-label="Paid by"><span className={styles.funder} data-funder={r.funderClass}>{FUNDER[r.funderClass]}</span><span className={styles.sub}>{short(r.client)}</span></td>
                <td data-label="State">{STATE[r.state] ?? r.state}{r.counted ? <span className={styles.sub}>counted</span> : null}</td>
                <td data-label="Chain checks">{r.checks && r.checks.decided ? `${r.checks.agreed} of ${r.checks.decided} agree` : '·'}</td>
                <td data-label="Terms">{r.terms ? `${r.terms.met} of ${r.terms.of}${r.terms.source === 'standard' ? ' (Standard)' : r.terms.source === 'buyer' ? ' (buyer set)' : ' (signed)'}` : '·'}</td>
                <td data-label="Rated">{r.rated ? 'Yes' : '·'}</td>
                <td data-label="Acted on">{r.act ? (r.act.tx ? <a href={`https://${r.chainId === 97 ? 'testnet.' : ''}bscscan.com/tx/${r.act.tx}`} target="_blank" rel="noreferrer">{r.act.action}</a> : r.act.action) : '·'}</td>
                <td data-label="Escrow">{r.hireTx ? <a href={`https://${r.chainId === 97 ? 'testnet.' : ''}bscscan.com/tx/${r.hireTx}`} target="_blank" rel="noreferrer">payment</a> : null}{r.hireTx ? ' · ' : null}<a href={r.verifyUrl} target="_blank" rel="noreferrer">getJob</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length ? <p className={styles.note}>No job matches this filter.</p> : null}
    </section>
  )
}
