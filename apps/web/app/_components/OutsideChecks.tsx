import { ProvenanceChip } from '@marque/ui'
import { outsideChecks, OUTSIDE_RAW } from '../../lib/outside-checks'
import styles from './capacity.module.css'

export async function OutsideChecks() {
  const { at, summary: s, error } = await outsideChecks()
  return <section className={styles.section} aria-labelledby="outside-heading">
    <div className={styles.heading}><h2 id="outside-heading">Outside checks</h2><ProvenanceChip provenance="MEASURED" /></div>
    {error ? <p>{error} No availability percentage is shown.</p> : !s?.checks ? <p>No outside observations are available yet. The scheduled workflow begins after this change is published and enabled.</p> : <>
      <p>{s.runs.toLocaleString('en-US')} runs, {s.checks.toLocaleString('en-US')} route checks in the last seven days. {((s.share200 ?? 0) * 100).toFixed(2)}% answered 200.</p>
      {s.slowest ? <p>Slowest route p95: {(s.slowest.p95Ms / 1000).toFixed(2)} s for <code>{s.slowest.path}</code>, including the complete response.</p> : null}
      <p>{s.lastFailure ? <>Last failure: <time dateTime={s.lastFailure.at}>{s.lastFailure.at.replace('T', ' ').slice(0, 19)} UTC</time>, <code>{s.lastFailure.path}</code>, {s.lastFailure.status || 'no response'}.</> : 'No failure in the observations available for this window.'}</p>
      <p>Last observation: <time dateTime={s.lastAt!}>{s.lastAt!.replace('T', ' ').slice(0, 19)} UTC</time>. This is a sample of six routes, not continuous uptime.</p>
    </>}
    <p>Log read attempted <time dateTime={at}>{at.replace('T', ' ').slice(0, 19)} UTC</time>. GitHub&apos;s scheduler can run late; a late run is not an outage. <a href={OUTSIDE_RAW}>Raw observations</a></p>
  </section>
}
