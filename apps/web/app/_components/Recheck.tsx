'use client'
import { useEffect, useState } from 'react'
import { ProvenanceChip } from '@marque/ui'
import { RecheckResult, type RecheckField } from '../../lib/recheck-schema'
import { Button } from './ui'
import styles from './recheck.module.css'

const shown = (value: RecheckField['now']['value']) => value === null ? 'Unavailable' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 6 }) : value
const utc = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : null

export function Recheck({ chainId, jobId, answerBlock = null, answerAt = null }: { chainId: 56 | 97; jobId: string; answerBlock?: string | null; answerAt?: string | null }) {
  const [result, setResult] = useState<RecheckResult | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()) }, [])
  const run = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/v1/recheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId, jobId }), signal: AbortSignal.timeout(5500) })
      if (!r.ok) throw new Error('This comparison is unavailable just now. The original answer and checks are unchanged. Try again in a minute.')
      const data = RecheckResult.parse(await r.json())
      if (data.chainId !== chainId || data.jobId !== jobId) throw new Error('The comparison did not match this job.')
      setResult(data)
    } catch { setError('The current comparison could not be read or validated. The original answer and checks are unchanged. Try again in a minute.') }
    finally { setBusy(false) }
  }
  const comparable = result?.rows.filter(r => r.stillHolds !== null) ?? []
  const held = comparable.filter(r => r.stillHolds).length
  const age = now && answerAt && Number.isFinite(Date.parse(answerAt)) ? Math.max(0, Math.floor((now - Date.parse(answerAt)) / 3_600_000)) : null
  return <section className={styles.recheck} aria-label={`Current comparison for job ${chainId}:${jobId}`}>
    <div className={styles.heading}>
      <div><h3>Still true today?</h3><p>{answerBlock ? <>Answered at block {answerBlock}{age !== null ? ` · ${age < 1 ? 'less than an hour' : `${age} hours`} ago` : ''}.</> : 'A delivered answer describes an earlier state of the chain.'} Job {jobId} · {chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}.</p></div>
      <Button size="sm" variant="secondary" loading={busy} onClick={() => void run()}>{result ? 'Recheck again' : 'Recheck'}</Button>
    </div>
    <p>Reads current BSC mainnet state without paying or changing the original answer. A comparison can be cached for up to one minute.</p>
    <div aria-live="polite">
      {error ? <p role="status" className={styles.error}>{error}</p> : null}
      {result ? <div className={styles.result}>
        <p><ProvenanceChip provenance="MEASURED" /> {comparable.length ? `${held} of ${comparable.length} comparable fields still hold.` : result.reason ?? 'No comparable current value was available.'}</p>
        <p>Read <time dateTime={result.observedAt}>{utc(result.observedAt)}</time>{result.currentBlock ? ` · BSC mainnet block ${result.currentBlock}` : ''}. Original answer block {result.answerBlock ?? 'not recorded'}.</p>
        {result.rows.length ? <div className={styles.rows}>{result.rows.map(row => <article className={styles.row} key={row.field}>
          <div className={styles.rowTitle}><h4>{row.label}</h4><span data-state={row.stillHolds === null ? 'unknown' : row.stillHolds ? 'holds' : 'changed'}>{row.stillHolds === null ? 'Not compared' : row.stillHolds ? 'Holds' : 'Changed'}</span></div>
          <dl><div><dt>At answer <ProvenanceChip provenance={row.atAnswer.provenance} /></dt><dd>{row.atAnswer.value === null ? 'Not given' : shown(row.atAnswer.value)}{row.unit && row.atAnswer.value !== null ? ` ${row.unit}` : ''}</dd></div><div><dt>Now <ProvenanceChip provenance={row.now.provenance} /></dt><dd>{shown(row.now.value)}{row.unit && row.now.value !== null ? ` ${row.unit}` : ''}</dd></div></dl>
          <p>{row.detail}</p>
        </article>)}</div> : null}
        {result.askAgain ? <a className="btn btn--sm" href={result.askAgain}>Ask again</a> : null}
      </div> : null}
    </div>
  </section>
}
