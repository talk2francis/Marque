import { ProvenanceChip } from '@marque/ui'
import { capacityHeadline, loadCapacityRecord } from '../../lib/capacity-record'
import styles from './capacity.module.css'

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`

/**
 * The capacity result at the top of a page (16 Nov 2026): read from the same record as the full Capacity section, so the
 * headline cannot say more than the latest run measured. A latest run that met no target is shown as exactly that.
 */
export async function CapacityHeadline({ anchor = '#capacity-heading' }: { anchor?: string }) {
  const { record } = await loadCapacityRecord()
  const h = capacityHeadline(record.runs)
  if (!h) return null
  return (
    <aside className={styles.headline} aria-label="Capacity, measured">
      <div className={styles.headlineTop}><span className={styles.headlineKicker}>Load tested from outside</span><ProvenanceChip provenance="MEASURED" /></div>
      {h.passed ? <>
        <p className={styles.headlineFigure}><b>{h.visitors}</b> visitors at once, every target met</p>
        <p className={styles.headlineNote}>
          {h.requestsPerSecond.toFixed(0)} requests a second, page p95 {seconds(h.pageP95Ms)}, API p95 {seconds(h.apiP95Ms)}, {h.error5xxRate === 0 ? 'zero server errors' : `${(h.error5xxRate * 100).toFixed(2)}% server errors`}.
          {' '}Stages passed: {h.stages.join(', ')}. Run of {h.date.slice(0, 10)}, from an external runner with the unchanged workload and targets.
        </p>
      </> : <p className={styles.headlineFigure}>The latest run, {h.date.slice(0, 10)}, did not meet its targets.</p>}
      <p className={styles.headlineLinks}><a href={anchor}>Every run, including the misses</a>{h.evidenceUrl ? <> · <a href={h.evidenceUrl}>Raw test evidence</a></> : null}</p>
    </aside>
  )
}
