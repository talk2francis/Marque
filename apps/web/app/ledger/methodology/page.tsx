import Link from 'next/link'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { BENCHMARKS } from '@marque/ledger'
import styles from '../ledger.module.css'

export const metadata = {
  title: 'Ledger methodology',
  description:
    'How Marque measures whether an agent beats doing the work by hand: pre-registered rubrics, blind grading, real wall clock, itemized cost, and what makes a result void.',
}

/**
 * The method, published in full.
 *
 * A benchmark whose method is not public is a marketing claim. Everything here
 * is what the code actually does — where the product falls short of the method,
 * it says so on this page rather than quietly narrowing the claim.
 */
export default function MethodologyPage() {
  return (
    <>
      <SiteHeader active="ledger" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">How the Ledger measures</Statement>
          <p className={styles.lede}>
            The Standard asks whether an agent is correct, and settles it by assertion. The Ledger
            asks whether an agent is better than doing the work yourself, which cannot be settled
            by assertion — so it is settled by a rubric written before anyone has seen an answer.
          </p>
          <p className={styles.note}><Link href="/ledger">Back to the Ledger</Link></p>
        </header>

        <div className={styles.prose}>
          <h2>The shape of a benchmark</h2>
          <p>
            A benchmark is one task, put to two arms: a Marque agent, and a human analyst working
            by hand. Both answer the same task, which is meant to be pinned to the same block.
            Each arm is run twice, because a single run is an anecdote.
          </p>
          <p>
            That intent is not the same as the evidence. The agent arm records the block it read;
            the human arm, run by hand, recorded none. Until a run carries its own block, the
            benchmark reports what it has rather than claiming a same-block comparison — which is
            why every card on the Ledger currently lists what is still missing.
          </p>
          <p>
            Before either arm runs, four things are frozen and hashed: the task, the inputs, the
            rubric, and the rubric&rsquo;s version. Those hashes are published on the benchmark
            page. A rubric that can be edited after the answers arrive is not a rubric, so the
            registration timestamp is recorded and never touched by a re-run.
          </p>

          <h2>Blind grading</h2>
          <p>
            Both outputs have their source labels stripped before scoring. The grader sees two
            answers and the rubric, and does not know which arm produced which. The runner is
            deliberately incapable of scoring: an arm graded at the moment it was produced would
            be graded with the label in plain sight, which is the failure mode the whole design
            exists to avoid.
          </p>

          <h2>Timing</h2>
          <p>
            Wall clock, always, never an estimate. The agent arm is timed around the same public
            HTTPS request a buyer would make — including TLS, the reverse proxy and the SSRF
            guard, because a buyer waits for those too, and excluding them would flatter the
            agent. The manual arm is timed by the analyst&rsquo;s own stopwatch, and the analyst
            states in their own words how they measured it. That statement is published with the
            result.
          </p>

          <h2>Cost</h2>
          <p>
            Itemized, never a single figure: gas, model spend, agent fee, and human time as
            separate lines, with the hourly rate recorded so a reader can re-price the result
            against their own. Where a line is genuinely zero it is zero, and where it is unknown
            it is not filled in. The agent arms below spent no gas and no model budget, because
            the engines are deterministic arithmetic over chain reads — that is why those lines
            read zero rather than unknown.
          </p>

          <h2>Sittings</h2>
          <p>
            Re-running an arm does not overwrite the previous run. Each sitting is recorded
            separately, named for the block it started at, and the Ledger publishes the latest
            one. Earlier sittings are kept and counted, because a run is a measurement we made
            and cannot recreate. Two sittings read different chain state, so their repetitions
            are not interchangeable and are never pooled or chosen between.
          </p>
          <p>
            The <em>reproduce</em> button on a benchmark page runs the agent arm live against
            today&rsquo;s block. It is recorded as a reproduction and is deliberately excluded
            from the published result — otherwise anyone could replace a registered comparison by
            pressing a button.
          </p>

          <h2>Sealed calls</h2>
          <p>
            Separately from the benchmarks, every recommendation a Marque agent issues is hashed
            and written to <code>MarqueRegistry.sealCall</code> at the moment it is issued. The
            rule that will decide the call is written into the same payload, before the outcome
            is known, so it cannot be softened later to make a call look right. A scorer resolves
            each call against subsequent chain state once its window has elapsed.
          </p>
          <p>
            An agent profile shows the count, the window, how many have resolved, and the
            breakdown of outcomes. It never shows a bare win rate. With a handful of calls a
            percentage is a number that looks like evidence and is not, so a small sample is
            labelled as one rather than rounded into a headline.
          </p>

          <h2>What makes a result void</h2>
          <ul>
            <li>A rubric edited after either arm ran. The hash would change and the mismatch is public.</li>
            <li>An arm whose block cannot be read by the other arm, so the two answered different states.</li>
            <li>A manual arm without a stated timing method, or without its elapsed time.</li>
            <li>Any arm we simulated. The manual arm is run by a human or it does not exist.</li>
          </ul>

          <h2>What is not settled here</h2>
          <p>
            The Ledger measures judgement, speed and cost. It does not measure correctness — that
            is the <Link href="/standard">Standard</Link>, and a check belongs there only if it
            can be written as an assertion with a numeric tolerance. Nothing that requires an
            opinion is ever graded as conformance, and nothing with one right answer is ever
            graded here.
          </p>

          <h2>The benchmarks</h2>
          <ul>
            {BENCHMARKS.map((b) => (
              <li key={b.id}>
                <Link href={`/ledger/${b.id}`}><code>{b.id}</code></Link> — {b.title}
                {b.mandatory ? '' : ' (stretch)'}
              </li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
