import { MeasureRule } from '@marque/ui'
import { Badge } from '../../_components/ui'
import { utcStamp } from '../../../lib/time'
import type { StoreTest } from '../../../lib/storefront'
import styles from './agent-page.module.css'

/** A warrant is re-earned after this long (the marketplace's WARRANT_TTL_MS). */
const RETEST_MS = 72 * 3_600_000
const n = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) >= 1000 ? Number(v).toLocaleString('en-US') : v)

/**
 * The Warrant card (SPEC-WORKSPACE 3.3, DESIGN-V4 5): a certificate for a passed MCS test, the one
 * ceremonial surface on an agent page. A failed run renders the same frame as a plain Test report
 * with the first failing assertion in words. Every value comes from the stored conformance row.
 */
export function WarrantCard({ test, category }: { test: StoreTest | null; category: string | null }) {
  if (!test) {
    return (
      <section className={styles.warrant} data-kind="none" aria-label="Marque test">
        <div className={styles.warrantInner}>
          <div className={styles.warrantTop}><span className={styles.warrantTitleQuiet}>Not tested yet</span><Badge kind="untested" /></div>
          <p className={styles.warrantLine}>{category ? 'Marque has not run its published test against this agent. A warrant is dated and earned, never assumed.' : 'This agent has no category Marque can test yet.'}</p>
          <a className={styles.warrantLink} href="/standard">How the Standard works</a>
        </div>
      </section>
    )
  }
  const asserts = test.diffs.length ? test.diffs : test.failedFields.map((field) => ({ field, pass: false, expected: '', actual: '', tolerance: '', missing: false }))
  const passed = asserts.filter((a) => a.pass).length
  const total = asserts.length
  const at = test.ranAt ? utcStamp(test.ranAt) : null
  const due = test.ranAt ? new Date(Date.parse(test.ranAt) + RETEST_MS) : null
  const stale = due ? due.getTime() < Date.now() : false
  const reproduce = `/standard/${test.testId}`

  if (test.pass) {
    return (
      <section className={styles.warrant} data-kind="pass" aria-label={`Warranted: passed ${test.testId}`}>
        <div className={styles.warrantInner}>
          <div className={styles.warrantTop}>
            <span className={styles.warrantTitle}>Warranted</span>
            <a className={styles.warrantId} href={reproduce}>{test.testId}</a>
          </div>
          <p className={styles.warrantLine}>Passed {passed} of {total} assertions</p>
          <p className={styles.warrantMeta}>{test.block ? <>at block <span className="mono">{Number(test.block).toLocaleString('en-US')}</span></> : 'block not recorded'}{at ? <> · {at}</> : null}</p>
          {total ? <MeasureRule value={passed} lower={0} upper={total} state="holds" animate={false} label={`${passed} of ${total} assertions passed`} className={styles.warrantRule} /> : null}
          <ul className={styles.asserts}>{asserts.map((a) => <li key={a.field} data-pass={a.pass || undefined}>{a.field}</li>)}</ul>
          <div className={styles.warrantFoot}>
            <span className={stale ? styles.warrantDue : undefined}>{due ? `${stale ? 'Retest was due' : 'Retest due'} ${utcStamp(due.toISOString())}` : null}</span>
            <a className={styles.warrantLink} href={reproduce}>Reproduce</a>
          </div>
        </div>
      </section>
    )
  }

  const first = asserts.find((a) => !a.pass)
  const sentence = test.error
    ? 'The endpoint did not return an answer Marque could grade. The result is kept, not hidden.'
    : first
      ? first.missing
        ? `Failed ${test.testId} on ${first.field}: the answer did not state it${first.expected ? ` (expected ${n(first.expected)})` : ''}.`
        : `Failed ${test.testId} on ${first.field}: expected ${n(first.expected) || 'a value'}, got ${n(first.actual) || 'nothing'}${first.tolerance ? ` (tolerance ${first.tolerance})` : ''}.`
      : `Failed ${test.testId}.`
  return (
    <section className={styles.warrant} data-kind="fail" aria-label={`Test report: failed ${test.testId}`}>
      <div className={styles.warrantInner}>
        <div className={styles.warrantTop}>
          <span className={styles.warrantTitleQuiet}>Test report</span>
          <a className={styles.warrantId} href={reproduce}>{test.testId}</a>
        </div>
        <p className={styles.warrantLine}>{sentence}</p>
        <p className={styles.warrantMeta}>{total ? `${passed} of ${total} assertions held` : 'No assertion could be graded'}{test.block ? <> · block <span className="mono">{Number(test.block).toLocaleString('en-US')}</span></> : null}{at ? <> · {at}</> : null}</p>
        {total ? <MeasureRule value={passed} lower={0} upper={total} state="neutral" animate={false} label={`${passed} of ${total} assertions held`} className={styles.warrantRule} /> : null}
        <ul className={styles.asserts}>{asserts.map((a) => <li key={a.field} data-pass={a.pass || undefined} data-fail={!a.pass || undefined}>{a.field}</li>)}</ul>
        <div className={styles.warrantFoot}>
          <span>Hire is not gated on the test. The result is shown so you can decide.</span>
          <a className={styles.warrantLink} href={reproduce}>Reproduce</a>
        </div>
      </div>
    </section>
  )
}
