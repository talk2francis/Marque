import { ProvenanceChip } from '@marque/ui'
import record from '../../lib/capacity-record.json'
import styles from './capacity.module.css'

export function Capacity() {
  return <section className={styles.section} aria-labelledby="capacity-heading">
    <div className={styles.heading}><h2 id="capacity-heading">Capacity</h2><ProvenanceChip provenance="MEASURED" /></div>
    <p>The November run missed the latency stop rule from its first stage. A current supported visitor count has not been established. The September launch mix and the November mix with search and cold job rooms are different workloads.</p>
    {record.runs.map(run => <div key={run.release} className={styles.run}>
      <h3><time dateTime={run.date}>{run.date.slice(0, 10)}</time> <code>{run.release}</code></h3>
      <p>{run.method}. {run.stages.every(s => s.completed) ? 'All stages completed.' : 'Every stage aborted. The wrapper continued after aborts; it has been corrected to stop on any unsuccessful stage.'}</p>
      <div className={styles.tableWrap}><table>
        <caption>Observed read requests at each attempted visitor level</caption>
        <thead><tr><th>Visitors</th><th>Requests/s</th><th>Page p95</th><th>API p95</th><th>5xx</th><th>Restarts within stage</th></tr></thead>
        <tbody>{run.stages.map(s => <tr key={s.visitors}>
          <th scope="row">{s.visitors}</th><td>{s.requestsPerSecond.toFixed(2)}</td><td>{(s.pageP95Ms / 1000).toFixed(2)} s</td><td>{(s.apiP95Ms / 1000).toFixed(2)} s</td><td>{(s.error5xxRate * 100).toFixed(2)}%</td><td>{s.restarts}</td>
        </tr>)}</tbody>
      </table></div>
      <p>{run.processRestarts} process restarts across the run{run.betweenStageRestarts ? `, including ${run.betweenStageRestarts} between stages` : ''}. <a href={`https://github.com/talk2francis/Marque/tree/main/docs/evidence/capacity-2026-11-06`}>Raw k6 summaries</a></p>
    </div>)}
    <p>k6 ran on the same box, so these figures include the load generator. Kerb was active for the September run and stopped for November. November began with a host load average of 5.16; it is a brief failed run, not a throughput benchmark. <a href="https://github.com/talk2francis/Marque/blob/main/docs/phase2/LOAD-TEST.md">Method, context and limits</a></p>
  </section>
}
