import Link from 'next/link'
import { Statement, Chip, ProvenanceChip, EmptyState } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { readLedger, readSeals, type LedgerBenchmark } from '../../lib/ledger'
import { explorerTx } from '../../lib/network'
import styles from './ledger.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'The Ledger — measured advantage, or none',
  description:
    'Agent against a human analyst on the same task, at the same block, graded blind against a rubric registered before either arm ran. Sealed calls are anchored on chain before their outcome is known.',
}

/**
 * The Ledger.
 *
 * MCS asks whether an agent is correct. The Ledger asks whether it is BETTER —
 * which is a different question, cannot be settled by assertion, and is
 * therefore graded against a rubric that is written and hashed before anybody
 * has seen an answer.
 *
 * The honest state today is that the agent arms have run and the manual arms
 * have not, because a human runs those with a stopwatch. So this page shows
 * the agent arms as recorded and says plainly that no comparison exists yet.
 * A page that filled the other column with an estimate would be the single
 * most damaging thing this project could publish.
 */

function ms(n: number): string {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`
}

function short(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : hash
}

/** The three headline numbers for one arm, or nulls when it has not run. */
function armStats(runs: Array<{ elapsedMs: number; costBreakdown: Record<string, unknown>; scoreTotal: number | null; scoreOutOf: number | null }>) {
  if (runs.length === 0) return { time: null, cost: null, quality: null, rate: null, reps: 0 }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const time = mean(runs.map((r) => r.elapsedMs))

  // Sum only the actual spend lines. humanRateUsdPerHour is an input to the
  // human-cost calc, NOT a cost — adding it inflated the figure (F: it read
  // $313 instead of $41). It is surfaced separately so a reader can re-price.
  const COST_KEYS = ['gasUsd', 'llmUsd', 'agentFeeUsd', 'humanUsd']
  const rowCost = (b: Record<string, unknown>) => COST_KEYS.reduce((a, k) => a + num(b[k]), 0)
  const cost = mean(runs.map((r) => rowCost(r.costBreakdown)))
  const rates = runs.map((r) => num(r.costBreakdown['humanRateUsdPerHour'])).filter((x) => x > 0)
  const rate = rates.length ? mean(rates) : null

  const scored = runs.filter((r) => r.scoreTotal !== null && r.scoreOutOf !== null)
  const first = scored[0]
  const quality = first
    ? { total: mean(scored.map((r) => r.scoreTotal as number)), outOf: first.scoreOutOf as number }
    : null
  return { time, cost, quality, rate, reps: runs.length }
}

function Benchmark({ b }: { b: LedgerBenchmark }) {
  const agent = b.runs.filter((r) => r.arm === 'agent')
  const manual = b.runs.filter((r) => r.arm === 'manual')

  return (
    <article className={styles.bench}>
      <div className={styles.benchHead}>
        <span className={styles.benchId}>{b.id}</span>
        <h3 className={styles.benchTitle}>
          <Link href={`/ledger/${b.id}`}>{b.title}</Link>
        </h3>
        <Chip>{b.category.replace('_', ' ')}</Chip>
        {b.complete
          ? <Chip tone="holds">complete</Chip>
          : <Chip tone="watch">awaiting the manual arm</Chip>}
      </div>

      <p className={styles.note}>
        {b.agentName ?? b.agentId} against a human analyst on the same task, at the same block,
        graded blind against rubric {b.rubricVersion}, registered{' '}
        {new Date(b.rubricRegisteredAt).toISOString().slice(0, 16).replace('T', ' ')}Z — before
        either arm ran.
      </p>

      {(() => {
        const h = armStats(manual)
        const a = armStats(agent)
        const Cell = ({ label, human, agentVal }: { label: string; human: React.ReactNode; agentVal: React.ReactNode }) => (
          <div className={styles.expRow}>
            <span className={styles.expMetric}>{label}</span>
            <span className={styles.expHuman}>{human}</span>
            <span className={styles.expAgent}>{agentVal}</span>
          </div>
        )
        const awaiting = <span className={styles.awaiting}>awaiting the manual arm</span>
        return (
          <div className={styles.experiment}>
            <div className={styles.expHead}>
              <span />
              <span className={styles.expCol}>Human analyst</span>
              <span className={styles.expCol}>{b.agentName ?? 'Agent'}</span>
            </div>
            <Cell
              label="TIME"
              human={h.time === null ? awaiting : <b>{ms(Math.round(h.time))}</b>}
              agentVal={a.time === null ? <span className={styles.muted}>not run</span> : <b>{ms(Math.round(a.time))}</b>}
            />
            <Cell
              label="COST"
              human={h.cost === null ? awaiting : (
                <>
                  <b>${h.cost.toFixed(2)}</b>
                  {h.rate !== null && <span className={styles.muted}> · {ms(Math.round(h.time ?? 0))} @ ${h.rate.toFixed(0)}/h</span>}
                </>
              )}
              agentVal={a.cost === null ? <span className={styles.muted}>—</span> : <b>${a.cost.toFixed(2)}</b>}
            />
            <Cell
              label="QUALITY"
              human={
                h.quality === null
                  ? (h.reps > 0 ? <span className={styles.muted}>blind grade pending</span> : awaiting)
                  : <b>{h.quality.total.toFixed(0)} / {h.quality.outOf}</b>
              }
              agentVal={
                a.quality === null
                  ? <span className={styles.muted}>{a.reps > 0 ? 'blind grade pending' : 'not run'}</span>
                  : <b>{a.quality.total.toFixed(0)} / {a.quality.outOf}</b>
              }
            />
            <p className={styles.expFoot}>
              {a.reps} agent repetition{a.reps === 1 ? '' : 's'} recorded, {h.reps} manual — both by
              hand with a stopwatch. Time and cost are measured facts. The quality score is the one
              piece still open: it is graded blind, by a language model, against the rubric that was
              hashed before either arm ran (<code className="mono">scripts/ledger-grade.mjs</code>),
              and it lands the moment that grader&rsquo;s API is reachable again.
            </p>
          </div>
        )
      })()}

      {!b.complete && (
        <div className={styles.pending}>
          <p className={styles.note}>
            <ProvenanceChip provenance="MEASURED" />
            Not yet a comparison. Still outstanding:
          </p>
          <ul className={styles.pendingList}>
            {b.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {(b.earlierSittings ?? 0) > 0 && (
        <p className={styles.note}>
          {b.earlierSittings} earlier sitting{b.earlierSittings === 1 ? '' : 's'} of this benchmark
          {b.earlierSittings === 1 ? ' is' : ' are'} kept but not published here: each read
          different chain state, so its repetitions are not interchangeable with these.
        </p>
      )}

      <div className={styles.actions}>
        <Link href={`/ledger/${b.id}`}>Full manifests, rubric and raw outputs</Link>
      </div>
    </article>
  )
}

export default async function LedgerPage() {
  const [benchmarks, seals] = await Promise.all([
    readLedger().catch(() => [] as LedgerBenchmark[]),
    readSeals(200).catch(() => []),
  ])

  const anchored = seals.filter((s) => s.sealTxHash)
  const resolved = seals.filter((s) => s.outcome !== 'unresolved')

  return (
    <>
      <SiteHeader active="ledger" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">The Ledger</Statement>
          <p className={styles.lede}>
            The Standard asks whether an agent is correct. The Ledger asks whether it is better
            than doing the work yourself — same task, same block, graded blind against a rubric
            that was written and hashed before either arm ran.
          </p>
          <p className={styles.lede}>
            <Link href="/ledger/methodology">Read the method in full</Link>, including how the
            arms are timed, how cost is itemized, and what would make a result void.
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.h2}>Benchmarks</h2>
          {benchmarks.length === 0 ? (
            <EmptyState title="No benchmark has been registered yet.">
              <p>Benchmarks appear here once their rubric is registered, before any arm runs.</p>
            </EmptyState>
          ) : (
            benchmarks.map((b) => <Benchmark key={b.id} b={b} />)
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Sealed calls</h2>
          <p className={styles.note}>
            Every recommendation a Marque agent issues is hashed and written on chain at the
            moment it is issued, together with the rule that will decide it. The rule cannot be
            softened afterwards to make a call look right.
          </p>
          {seals.length === 0 ? (
            <p className={styles.muted}>No call has been sealed yet.</p>
          ) : (
            <>
              <table className={styles.arms}>
                <thead>
                  <tr><th>Agent</th><th>Issued</th><th>Block</th><th>Outcome</th><th>Anchor</th></tr>
                </thead>
                <tbody>
                  {seals.slice(0, 20).map((s) => (
                    <tr key={s.hash}>
                      <td className="mono">{s.agentId}</td>
                      <td className="mono">{s.issuedAt.slice(0, 16).replace('T', ' ')}Z</td>
                      <td className="mono">{s.blockNumber}</td>
                      <td>
                        {s.outcome === 'unresolved'
                          ? <span className={styles.muted}>unresolved</span>
                          : <Chip tone={s.outcome === 'correct' ? 'holds' : 'breach'}>{s.outcome}</Chip>}
                      </td>
                      <td className="mono">
                        {s.sealTxHash
                          ? <a href={explorerTx(s.chainId, s.sealTxHash)} rel="noreferrer noopener" target="_blank">{short(s.sealTxHash)}</a>
                          : <span className={styles.muted}>not anchored</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.warn}>
                {anchored.length} of {seals.length} sealed calls are anchored on chain.{' '}
                {resolved.length === 0
                  ? 'None has reached its resolution window yet, so no call has an outcome.'
                  : `${resolved.length} of them ${resolved.length === 1 ? 'has' : 'have'} reached its resolution window.`}{' '}
                That is far too few to support a win rate, so none is shown. A percentage computed
                over a handful of calls is a number that looks like evidence and is not.
              </p>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
