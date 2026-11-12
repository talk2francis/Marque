import { ProvenanceChip } from '@marque/ui'
import { capacityStagePassed, loadCapacityRecord } from '../../lib/capacity-record'
import styles from './capacity.module.css'

export async function Capacity() {
  const { record, source } = await loadCapacityRecord()
  const runs = [...record.runs].sort((a, b) => b.date.localeCompare(a.date))
  const latest = runs[0]!
  const passed = latest.stages.filter(capacityStagePassed).map(stage => stage.visitors)
  return <section className={styles.section} aria-labelledby="capacity-heading">
    <div className={styles.heading}><h2 id="capacity-heading">Capacity</h2><ProvenanceChip provenance="MEASURED" /></div>
    {source === 'bundled' ? <p>The current capacity record is unavailable. These are the bundled historical observations.</p> : null}
    <p>{passed.length ? `The latest recorded run met its targets at ${passed.join(', ')} concurrent virtual visitors with its stated workload.` : 'The latest recorded run did not establish a supported concurrent visitor count.'} A completed stage can still miss its latency targets. The September launch mix and the November mix with search and cold job rooms are different workloads.</p>
    <p>Targets: page p95 below 0.8 seconds, API p95 below 1.5 seconds, fewer than 0.5% server errors, no worker restarts and a completed hold. Brief aborted attempts do not establish sustained requests per second.</p>
    {runs.map(run => <div key={`${run.date}:${run.release}`} className={styles.run}>
      <h3><time dateTime={run.date}>{run.date.slice(0, 10)}</time> <code>{run.release}</code></h3>
      <p>{run.method}. {run.note ?? (run.stages.every(stage => stage.completed) ? 'All holds completed; target results are shown separately.' : 'At least one hold did not complete.')}</p>
      <div className={styles.tableWrap}><table>
        <caption>Observed read requests at each attempted virtual visitor target</caption>
        <thead><tr><th>Target visitors</th><th>Requests/s</th><th>Page p95</th><th>API p95</th><th>5xx</th><th>Restarts</th><th>Hold completed</th><th>Targets met</th></tr></thead>
        <tbody>{run.stages.map(stage => <tr key={stage.visitors}>
          <th scope="row">{stage.visitors}{stage.peakVus !== undefined ? ` (peak ${stage.peakVus})` : ''}</th>
          <td>{stage.requestsPerSecond.toFixed(2)}</td><td>{(stage.pageP95Ms / 1000).toFixed(2)} s</td><td>{(stage.apiP95Ms / 1000).toFixed(2)} s</td>
          <td>{(stage.error5xxRate * 100).toFixed(2)}%</td><td>{stage.restarts}</td><td>{stage.completed ? 'Yes' : 'No'}</td><td>{capacityStagePassed(stage) ? 'Yes' : 'No'}</td>
        </tr>)}</tbody>
      </table></div>
      <p>{run.processRestarts} process restarts across the run{run.betweenStageRestarts ? `, including ${run.betweenStageRestarts} between stages` : ''}. <a href={run.evidenceUrl ?? 'https://github.com/talk2francis/Marque/tree/main/docs/evidence/capacity-2026-11-06'}>Test evidence</a></p>
    </div>)}
    <p>The September and 6 November generators ran on the server being tested. The 11 November generator ran externally. Generator location, cold reads and admission limits affect comparisons. <a href="https://github.com/talk2francis/Marque/blob/main/docs/phase2/LOAD-TEST.md">Method, context and limits</a></p>
  </section>
}
