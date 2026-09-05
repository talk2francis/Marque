import Link from 'next/link'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { readLedger } from '../../../lib/ledger'
import { IntakeForm } from './IntakeForm'
import styles from '../ledger.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Record a manual arm',
  description: 'Paste a hand-run analysis and its measured elapsed time; it is hashed into the benchmark manifest.',
}

/**
 * The manual-arm intake.
 *
 * A human runs the manual arm with a timer and a screen recording. This page
 * takes what they produced verbatim, hashes it, and writes it into the
 * manifest exactly as the agent's answer was hashed. It does not tidy, reword
 * or score the analysis, and it will not accept an elapsed time the analyst
 * did not supply — a defaulted stopwatch is a fabricated measurement.
 */
export default async function IntakePage() {
  const benchmarks = await readLedger().catch(() => [])

  return (
    <>
      <SiteHeader active="ledger" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Record a manual arm</Statement>
          <p className={styles.lede}>
            Paste the analysis you produced by hand, and the time your own stopwatch recorded.
            Both are hashed into the benchmark manifest, the same way the agent&rsquo;s answer
            was hashed, and both are published verbatim.
          </p>
          <p className={styles.note}>
            <Link href="/ledger">The Ledger</Link>
            {' · '}
            <Link href="/ledger/methodology">How this is measured</Link>
          </p>
        </header>

        <section className={styles.section}>
          <p className={styles.warn}>
            Nothing here is scored on submission. Grading happens later and blind, from both
            outputs with their source labels stripped — so this form has no field for how well
            you think you did, and adding one would defeat the design.
          </p>
          <IntakeForm
            benchmarks={benchmarks.map((b) => ({
              id: b.id,
              title: b.title,
              task: b.task,
              manualReps: b.runs.filter((r) => r.arm === 'manual').length,
            }))}
          />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
