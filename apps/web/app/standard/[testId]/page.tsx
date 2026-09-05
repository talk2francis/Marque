import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import {
  ALL_TOLERANCES, EXCLUDED_CHECKS, CASES, MCS_VERSION, MCS_TOLERANCE_REVISION, type TestId,
} from '@marque/conformance'
import { Statement, Chip, ProvenanceChip, EmptyState } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import styles from '../standard.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TEST_IDS = Object.keys(ALL_TOLERANCES) as TestId[]

const TITLES: Record<TestId, string> = {
  'MCS-REB-1': 'Rebalancing — PancakeSwap V3',
  'MCS-GRID-1': 'Grid trading',
  'MCS-YIELD-1': 'Yield optimisation',
  'MCS-HF-1': 'Health factor monitoring',
}

export function generateStaticParams() {
  return TEST_IDS.map((testId) => ({ testId }))
}

export async function generateMetadata({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params
  if (!TEST_IDS.includes(testId as TestId)) return { title: 'Unknown test' }
  return {
    title: `${testId} — ${TITLES[testId as TestId]}`,
    description: `The published spec, ground-truth method, tolerances and live results for ${testId}, including every failure.`,
  }
}

const unwrap = (r: unknown): Array<Record<string, unknown>> =>
  ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

/**
 * One conformance test, in full.
 *
 * Everything here is read from `tolerances.ts` — the same constants the harness
 * enforces — so the published spec cannot drift from what is actually checked.
 * The results below include the failures, and the exclusions say what this test
 * deliberately refuses to grade, which is as much a part of a standard as what
 * it does grade.
 */
export default async function TestPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params
  if (!TEST_IDS.includes(testId as TestId)) notFound()
  const id = testId as TestId

  const tolerances = Object.values(ALL_TOLERANCES[id])
  const excluded = EXCLUDED_CHECKS.filter((e) => e.test === id)
  const cases = CASES.filter((c) => c.testId === id)

  const results = await db().execute(sql`
    select agent_id, pass, failed_fields, error, block_number, latency_ms, ran_at
    from conformance_result
    where test_id = ${id} and agent_id not like 'stub:%'
    order by ran_at desc limit 100
  `).then(unwrap).catch(() => [])

  const passes = results.filter((r) => r['pass'] === true)
  const failures = results.filter((r) => r['pass'] !== true)

  return (
    <>
      <SiteHeader active="standard" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">{id}</Statement>
          <p className={styles.lede}>{TITLES[id]}</p>
          <p className={styles.note}>
            MCS v{MCS_VERSION}, tolerance revision {MCS_TOLERANCE_REVISION}. Generated from the
            same constants the harness enforces.{' '}
            <Link href="/standard">All four tests</Link>
            {' · '}
            <Link href="/builders/test">Run this against your own endpoint</Link>
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.h2}>What is checked, and to what tolerance</h2>
          <table className={styles.table}>
            <thead><tr><th>Field</th><th>Bound</th><th>What it means</th></tr></thead>
            <tbody>
              {tolerances.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.id}</td>
                  <td className="mono">{t.value === null ? 'boolean' : `±${t.value} ${t.unit}`}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: '30ch' }}>{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>
            Every bound carries a reason, not just a number. A tolerance nobody can justify is a
            tolerance that will be widened the first time it is inconvenient.
          </p>
          <ul className={styles.cases}>
            {tolerances.map((t) => (
              <li key={`${t.id}-why`}>
                <span className="mono">{t.id}</span>
                <span className={styles.caseMeta}>{t.rationale}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The ground-truth method</h2>
          <p className={styles.note}>
            The expected values are computed by us from chain state at a pinned block, never taken
            from a third party. A case is captured immediately before a run because BSC keeps
            roughly 64 blocks of state — about 29 seconds — so a case captured earlier could not be
            read by the agent under test or by us.
          </p>
          {cases.length === 0 ? (
            <p className={styles.muted}>No case is defined for this test.</p>
          ) : (
            <ul className={styles.cases}>
              {cases.map((c) => (
                <li key={c.id}>
                  <span className="mono">{c.id}</span>
                  <span className={styles.caseMeta}>
                    subject {JSON.stringify(c.subject)} · policy {JSON.stringify(c.policy)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What this test refuses to grade</h2>
          {excluded.length === 0 ? (
            <p className={styles.muted}>Nothing is recorded as excluded for this test.</p>
          ) : (
            <ul className={styles.cases}>
              {excluded.map((e) => (
                <li key={e.check}>
                  <strong>{e.check}</strong>
                  <span className={styles.caseMeta}>{e.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.note}>
            A standard is defined as much by what it refuses to grade as by what it grades. Every
            one of these is a judgement question and belongs in{' '}
            <Link href="/ledger">the Ledger</Link>, against a rubric registered before anyone has
            seen an answer.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Results, including the failures</h2>
          {results.length === 0 ? (
            <EmptyState title="No agent has been run against this test yet.">
              <p>Results appear here as they are produced, passes and failures alike.</p>
            </EmptyState>
          ) : (
            <>
              <p className={styles.note}>
                <ProvenanceChip provenance="TESTED" />
                {passes.length} pass, {failures.length} fail, across {results.length} recorded runs.
                Failures are listed first because they are the more useful half.
              </p>
              <table className={styles.table}>
                <thead>
                  <tr><th>Agent</th><th>Verdict</th><th>Failed on</th><th>Block</th><th>Latency</th><th>When</th></tr>
                </thead>
                <tbody>
                  {[...failures, ...passes].map((r, i) => {
                    const fields = Array.isArray(r['failed_fields']) ? (r['failed_fields'] as string[]) : []
                    return (
                      <tr key={`${String(r['agent_id'])}-${i}`}>
                        <td className="mono">{String(r['agent_id'])}</td>
                        <td>
                          {r['pass'] === true
                            ? <Chip tone="holds">pass</Chip>
                            : <Chip tone="breach">{r['error'] ? 'no answer' : 'fail'}</Chip>}
                        </td>
                        <td style={{ whiteSpace: 'normal', minWidth: '24ch' }}>
                          {r['error']
                            ? String(r['error']).slice(0, 90)
                            : fields.length > 0 ? fields.join(', ') : '—'}
                        </td>
                        <td className="mono">{String(r['block_number'] ?? '—')}</td>
                        <td className="mono">{r['latency_ms'] === null ? '—' : `${String(r['latency_ms'])} ms`}</td>
                        <td className="mono">{String(r['ran_at']).slice(0, 16).replace('T', ' ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className={styles.note}>
                Failing to answer and answering wrongly are different facts and are shown as such.
                Test stubs are excluded from this list.
              </p>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
