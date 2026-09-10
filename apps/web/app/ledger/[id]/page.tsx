import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Statement, Chip, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { readBenchmark, type LedgerRun } from '../../../lib/ledger'
import { Reproduce } from './Reproduce'
import { HumanArmEvidence } from '../HumanArmEvidence'
import styles from '../ledger.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await readBenchmark(id).catch(() => null)
  return {
    title: b ? `${b.id} — ${b.title}` : 'Benchmark not found',
    description: b?.method ?? 'A Marque Ledger benchmark.',
  }
}

function ms(n: number): string {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`
}

function money(v: unknown): string {
  return typeof v === 'number' ? `$${v.toFixed(4)}` : '—'
}

function Arm({ run, label }: { run: LedgerRun; label: string }) {
  return (
    <div className={styles.pending}>
      <div className={styles.benchHead}>
        <h3 className={styles.benchTitle}>{label} · repetition {run.rep}</h3>
        {run.scoredBlind && <Chip tone="holds">graded blind</Chip>}
      </div>

      <div className={styles.hashes}>
        <span>output hash <code>{run.outputHash}</code></span>
        <span>manifest hash <code>{run.manifestHash}</code></span>
        {run.blockProvenance ? (
          <span>
            block <code>{run.blockProvenance.originalValue === '0' ? 'not recorded' : run.blockProvenance.originalValue}</code>
            {' → effective '}<code>{run.effectiveBlock}</code>
            {' · ran '}{run.ranAt.slice(0, 19).replace('T', ' ')}Z
          </span>
        ) : (
          <span>block <code>{run.blockNumber === '0' ? 'not recorded' : run.blockNumber}</code> · ran {run.ranAt.slice(0, 19).replace('T', ' ')}Z</span>
        )}
      </div>

      {run.blockProvenance && (
        <p className={styles.note}>
          <ProvenanceChip provenance="MEASURED" />
          Provenance: {run.blockProvenance.reason}
          {run.blockProvenance.sourceTaskHash && (
            <> Source task <code>{run.blockProvenance.sourceTaskHash.slice(0, 14)}…</code>. The raw run row is unchanged.</>
          )}
        </p>
      )}

      <p className={styles.note}>
        <ProvenanceChip provenance="MEASURED" />
        {ms(run.elapsedMs)}. {run.timingMethod}
      </p>

      <p className={styles.note}>
        Cost — gas {money(run.costBreakdown['gasUsd'])}, model {money(run.costBreakdown['llmUsd'])},
        agent fee {money(run.costBreakdown['agentFeeUsd'])}, human time{' '}
        {run.costBreakdown['humanUsd'] === null ? 'n/a' : money(run.costBreakdown['humanUsd'])}.
      </p>

      {run.note && <p className={styles.note}>{run.note}</p>}
      {run.evidenceUrl && (
        <p className={styles.note}>
          <a href={run.evidenceUrl} rel="noreferrer noopener" target="_blank">Screen recording</a>
        </p>
      )}

      <pre className={styles.output}>
        {typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)}
      </pre>
    </div>
  )
}

export default async function BenchmarkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await readBenchmark(id).catch(() => null)
  if (!b) notFound()

  const agent = b.runs.filter((r) => r.arm === 'agent')
  const manual = b.runs.filter((r) => r.arm === 'manual')
  const criteria = (b.rubric['criteria'] ?? []) as Array<{ id?: string; name?: string; standard?: string; points?: number }>
  const totalPoints = criteria.reduce((n, c) => n + (c.points ?? 0), 0)

  return (
    <>
      <SiteHeader active="ledger" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.benchId}>{b.id}</span>
          <Statement as="h1">{b.title}</Statement>
          <p className={styles.lede}>{b.method}</p>
          <p className={styles.note}>
            <Link href="/ledger">Back to the Ledger</Link>
            {' · '}
            <Link href="/ledger/methodology">The method</Link>
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.h2}>The registered task</h2>
          <div className={styles.hashes}>
            <span>task hash <code>{b.taskHash}</code></span>
            <span>input hash <code>{b.inputHash}</code></span>
            <span>
              rubric {b.rubricVersion} <code>{b.rubricHash}</code>, registered{' '}
              {b.rubricRegisteredAt.slice(0, 19).replace('T', ' ')}Z
            </span>
          </div>
          <pre className={styles.output}>{b.task}</pre>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The rubric</h2>
          <p className={styles.note}>
            Registered before either arm ran, and version-hashed so it cannot be quietly rewritten
            once the answers are in. Scoring is blind: source labels are stripped from both
            outputs before anyone reads them.
          </p>
          {criteria.length === 0 ? (
            <p className={styles.muted}>This rubric records no criteria.</p>
          ) : (
            <table className={styles.arms}>
              <thead>
                <tr><th>Criterion</th><th>Points</th><th>What a full-marks answer contains</th></tr>
              </thead>
              <tbody>
                {criteria.map((c, i) => (
                  <tr key={c.id ?? i}>
                    <td>{c.name ?? c.id ?? `c${i + 1}`}</td>
                    <td className="mono">{c.points ?? '—'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: '32ch' }}>{c.standard ?? '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="mono"><strong>{totalPoints}</strong></td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The agent arm</h2>
          {agent.length === 0
            ? <p className={styles.muted}>The agent arm has not run.</p>
            : agent.map((r) => <Arm key={r.id} run={r} label={b.agentName ?? b.agentId} />)}
          <Reproduce benchmarkId={b.id} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The manual arm</h2>
          {manual.length === 0 ? (
            <>
              <p className={styles.warn}>
                Not run yet. A human analyst runs this arm by hand, with a timer and a screen
                recording, and pastes the result into the intake — which hashes it into the
                manifest exactly as the agent&rsquo;s answer was hashed. Until both arms exist
                there is no comparison here, and none is shown. Simulating this arm would be
                trivial and would make every number on this page worthless.
              </p>
              <p className={styles.note}>
                <Link href="/ledger/intake">Record a manual arm</Link>
              </p>
            </>
          ) : (
            <>
              <p className={styles.note}>
                This arm was run by a person, on camera. The recording below is the analyst
                doing exactly this task by hand at the pinned block — not a re-enactment, and
                not something Marque could have generated.
              </p>
              <HumanArmEvidence id={b.id} />
              {manual.map((r) => <Arm key={r.id} run={r} label="Human analyst" />)}
            </>
          )}
        </section>

        {!b.complete && (
          <section className={styles.section}>
            <h2 className={styles.h2}>Outstanding</h2>
            <ul className={styles.pendingList}>
              {b.missing.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
