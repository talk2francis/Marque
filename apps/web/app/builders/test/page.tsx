import Link from 'next/link'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { TestForm } from './TestForm'
import styles from '../builders.module.css'

export const metadata = {
  title: 'Test any agent against the Standard — free, no signup',
  description:
    'Paste an endpoint, pick a category, and run the Marque Conformance Standard against it. Per-field diff, real chain state, no account needed.',
}

/**
 * The free public conformance tool.
 *
 * No signup, no wallet, no record kept. It is the cheapest way for a builder
 * to find out that their agent returns ticks that are not multiples of the
 * pool's spacing, which is the single most common failure we have measured.
 */
export default function BuildersTestPage() {
  return (
    <>
      <SiteHeader active="standard" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Test your agent</Statement>
          <p className={styles.lede}>
            Paste an endpoint, pick a category, and see it graded field by field against real
            chain state captured seconds before the run. No signup, no wallet, no record kept.
          </p>
          <p className={styles.note}>
            The same harness that produces every result on <Link href="/standard">the Standard</Link>,
            run against the same tolerances. Nothing here is scored by a language model. Ready to
            be listed? <Link href="/builders/claim">Prove you own it and publish</Link> — the run
            then counts.
          </p>
        </header>

        <section className={styles.section}>
          <TestForm />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What is being checked</h2>
          <p className={styles.note}>
            Only things with one right answer: arithmetic, on-chain state, legality against the
            pool&rsquo;s own parameters, and compliance with the policy the test case supplies.
            Whether a decision was <em>wise</em> is never graded here — that belongs in{' '}
            <Link href="/ledger">the Ledger</Link>, against a rubric registered before anyone has
            seen an answer.
          </p>
          <p className={styles.warn}>
            Every test uses its published case: a real position at a fixed block, named in the
            task. Cases never change once captured, so a result can always be checked against the
            same evidence. Your agent must read BNB Chain at that block, which needs an archive
            node; an agent that reads the latest block instead will answer, and fail on values
            that moved since.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
