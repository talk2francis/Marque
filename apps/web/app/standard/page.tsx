import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { marked } from 'marked'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { Statement, Chip, DataCell, EmptyState, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import styles from './standard.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'MCS v1.0 — the Marque Conformance Standard',
  description: 'The published, deterministic standard every agent on Marque is tested against.',
}

/**
 * The published standard.
 *
 * Rendered from `docs/standard/MCS-v1.0.md`, which is itself GENERATED from
 * `packages/conformance/src/tolerances.ts`. Nothing on this page is written by
 * hand, so what a reader sees cannot drift from what the harness enforces —
 * which is the entire reason the standard is credible.
 *
 * Live results are read from the database and shown above the spec, including
 * the failures. A standard that only published its passes would be marketing.
 */

interface ResultRow { [k: string]: unknown }
const unwrap = (r: unknown): ResultRow[] =>
  ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as ResultRow[]

async function loadStandard(): Promise<string | null> {
  // Resolved relative to the repo root so it works from the standalone bundle.
  const candidates = [
    join(process.cwd(), 'docs', 'standard', 'MCS-v1.0.md'),
    join(process.cwd(), '..', '..', 'docs', 'standard', 'MCS-v1.0.md'),
    '/root/marque/docs/standard/MCS-v1.0.md',
  ]
  for (const path of candidates) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      continue
    }
  }
  return null
}

export default async function StandardPage() {
  const [markdown, results, cases] = await Promise.all([
    loadStandard(),
    db().execute(sql`
      select test_id, agent_id, pass, failed_fields, ran_at, error, block_number, latency_ms
      from conformance_result
      where agent_id not like 'stub:%'
      order by ran_at desc limit 200
    `).then(unwrap).catch(() => []),
    db().execute(sql`
      select test_id, id, block_number, ground_truth_hash, captured_at
      from conformance_case where active = true order by test_id
    `).then(unwrap).catch(() => []),
  ])

  const byTest = new Map<string, { pass: number; fail: number; errored: number }>()
  for (const r of results) {
    const id = String(r['test_id'])
    const acc = byTest.get(id) ?? { pass: 0, fail: 0, errored: 0 }
    if (r['pass'] === true) acc.pass++
    else acc.fail++
    if (r['error']) acc.errored++
    byTest.set(id, acc)
  }

  const html = markdown ? await marked.parse(markdown) : null

  return (
    <>
      <SiteHeader active="standard" />
      <main className={styles.page}>
      <header className={styles.head}>
        <Statement as="h1">MCS v1.0</Statement>
        <p className={styles.lede}>
          The Marque Conformance Standard. Every check below is executed by deterministic code
          against numbers we compute ourselves from chain state. No language model grades a
          conformance test.
        </p>
        <p className={styles.lede}>
          This page is generated from the same constants the harness enforces, so the published
          standard cannot drift from what is actually checked.{' '}
          <ProvenanceChip provenance="TESTED" />
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.h2}>Results so far</h2>
        {results.length === 0 ? (
          <EmptyState title="No third-party agent has been run against the standard yet.">
            <p>
              Results appear here as they are produced, passes and failures alike. A standard
              that published only its passes would be marketing.
            </p>
          </EmptyState>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr><th>Test</th><th>Case</th><th>Block</th><th>Passed</th><th>Failed</th></tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const acc = byTest.get(String(c['test_id'])) ?? { pass: 0, fail: 0, errored: 0 }
                  return (
                    <tr key={String(c['id'])}>
                      <td className="mono">
                        <a href={`/standard/${String(c['test_id'])}`}>{String(c['test_id'])}</a>
                      </td>
                      <td className="mono">{String(c['id'])}</td>
                      <td className="mono">{String(c['block_number'])}</td>
                      <td><DataCell align="left">{acc.pass}</DataCell></td>
                      <td><DataCell align="left">{acc.fail}</DataCell></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className={styles.note}>
              <ProvenanceChip provenance="MEASURED" /> {results.length} runs recorded against real
              third-party agents. Of those, {results.filter((r) => r['error']).length} could not be
              reached or exposed no interface we could address — recorded as a failure to answer,
              which is distinct from answering wrongly.
            </p>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Live cases</h2>
        {cases.length === 0 ? (
          <p className={styles.muted}>No case has been captured yet.</p>
        ) : (
          <ul className={styles.cases}>
            {cases.map((c) => (
              <li key={String(c['id'])}>
                <Chip>{String(c['test_id'])}</Chip>
                <span className="mono">{String(c['id'])}</span>
                <span className={styles.caseMeta}>
                  block <span className="mono">{String(c['block_number'])}</span>
                  {' · ground truth '}
                  <span className="mono">{String(c['ground_truth_hash']).slice(0, 18)}…</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>
          Ground truth is frozen at capture, so every agent is graded on byte-identical inputs.
          The block number and hash are published here so anyone with an archive node can verify
          the snapshot against the chain itself.
        </p>
      </section>

      <section className={styles.section}>
        {html ? (
          /*
           * Safe: this Markdown is generated by our own build from
           * packages/conformance/src/tolerances.ts and committed to the repo.
           * AGENTS.md forbids rendering raw HTML from AGENT METADATA — untrusted
           * third-party input — which this is not. No agent-supplied string
           * reaches this element.
           */
          <article className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <EmptyState title="The generated standard could not be read.">
            <p>
              It lives at <span className="mono">docs/standard/MCS-v1.0.md</span> and is produced
              by <span className="mono">pnpm standard</span>. Rather than reproduce it from memory
              here, this page shows nothing.
            </p>
          </EmptyState>
        )}
      </section>
    </main>
      <SiteFooter />
    </>
  )
}
