'use client'
import { formatUnits } from 'viem'
import { ProvenanceChip } from '@marque/ui'
import type { DemandReport } from '../../lib/builder-demand'
import styles from './demand.module.css'

const price = (raw: string | null, symbol: string | null, decimals: number | null) => raw === null ? 'No price recorded' : decimals === null ? `${raw} raw units${symbol ? ` (${symbol})` : ''}` : `${formatUnits(BigInt(raw), decimals)} ${symbol ?? 'token units'}`
const labels = { won: 'Won', lost: 'Another quote was funded', did_not_quote: 'Did not quote', not_funded: 'No hire recorded' }
export function DemandRows({ report, onPage, busy }: { report: DemandReport; onPage: (cursor: string) => void; busy: boolean }) {
  return <section className={styles.demand} aria-label="Recorded quote comparisons">
    <h4>Recorded quote comparisons</h4>
    <p><ProvenanceChip provenance="MEASURED" /> Last 30 days, since {report.since.slice(0, 10)}. Read {report.observedAt.replace('T', ' ').slice(0, 19)} UTC. Showing {report.rows.length} of {report.total} recorded comparisons for this identity.</p>
    <p>These are quote observations, including operator or team activity, not a count of independent demand. A cheaper price does not prove why a buyer chose an agent. No buyer wallet or task text is shown.</p>
    {!report.rows.length ? <p>No Tender price comparison was recorded for this identity in this window.</p> : <ol className={styles.rows}>{report.rows.map(row => {
      const job = row.ownJob ?? row.selectedJob
      return <li key={row.id}>
        <div className={styles.head}><strong>{labels[row.outcome]}</strong><span>{row.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'} · {row.category.replaceAll('_', ' ')}</span><time dateTime={row.at}>{row.at.replace('T', ' ').slice(0, 19)} UTC</time></div>
        <p>{row.detail}{row.latencyMs !== null ? ` Quote response: ${row.latencyMs} ms.` : ''}</p>
        <dl><div><dt>Your recorded price</dt><dd>{price(row.priceRaw, row.tokenSymbol, row.tokenDecimals)}</dd></div>{row.selectedJob ? <div><dt>Another funded quote</dt><dd>{price(row.selectedJob.priceRaw, row.selectedJob.tokenSymbol, row.selectedJob.tokenDecimals)}</dd></div> : null}</dl>
        {row.selectedJob?.quoteAt ? <p>That price was quoted <time dateTime={row.selectedJob.quoteAt}>{row.selectedJob.quoteAt.replace('T', ' ').slice(0, 19)} UTC</time>. {row.selectedJob.name ?? 'Agent identity'}.</p> : null}
        <p>Badges at quote time: not recorded. Current badges are not substituted for a historical snapshot.</p>
        {job ? <a href={`/jobs/${job.chainId}/${job.jobId}`}>Open funded job {job.jobId}</a> : null}
      </li>
    })}</ol>}
    <div className={styles.pages}><button type="button" className="btn btn--sm" disabled={busy} onClick={() => onPage('0')}>First page</button>{report.nextCursor ? <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onPage(report.nextCursor!)}>Next comparisons</button> : null}</div>
  </section>
}
