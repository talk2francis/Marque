import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { publicClient } from '@marque/chain'
import { Statement, Chip, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import styles from './status.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Status — what is fresh, what is stale, and how stale',
  description:
    'Real uptime, probe coverage, index freshness in blocks behind head, reference-agent health and the last conformance run. Honest degradation, never a silently stale number.',
}

/**
 * /status — honest degradation.
 *
 * The failure mode this page exists to prevent is a dashboard that is green
 * because it is broken: a number that was true four hours ago rendered
 * identically to one that is true now. So every figure here is stated WITH the
 * time it was measured, and anything past its expected cadence is called stale
 * on the page rather than quietly served.
 *
 * Nothing here is a synthetic uptime percentage. We do not run an external
 * prober against ourselves, so publishing "99.9%" would be a number we did not
 * measure (invariant 4). What we can honestly report is when each moving part
 * last did its job.
 */

const unwrap = (r: unknown): Array<Record<string, unknown>> =>
  ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

/**
 * A query that fails must SAY it failed.
 *
 * This page first shipped with `.catch(() => [])` on every query, and one of
 * them selected a column that does not exist (`key` for what is really
 * `source`). The section rendered with the row simply absent — a status page
 * reporting, in effect, that the indexer does not exist. That is the swallowed
 * -error shape this project has already paid for once, and on a page whose
 * entire job is honest degradation it is the worst possible bug.
 */
interface Queried { rows: Array<Record<string, unknown>>; failed: string | null }

async function queried(label: string, run: Promise<unknown>): Promise<Queried> {
  try {
    return { rows: unwrap(await run), failed: null }
  } catch (err) {
    return { rows: [], failed: `${label}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

const AGENTS = ['bound', 'lattice', 'sluicegate', 'keel', 'redcell'] as const

/** How long each moving part may go quiet before the page calls it stale. */
const CADENCE_MINUTES: Record<string, number> = {
  'Pool tick watcher': 6,
  'Endpoint probe': 20,
  'Registry ingest': 120,
}

function agoMinutes(iso: string | null): number | null {
  if (iso === null) return null
  return (Date.now() - new Date(iso).getTime()) / 60_000
}

function freshness(label: string, iso: string | null): { text: string; stale: boolean } {
  const mins = agoMinutes(iso)
  if (mins === null) return { text: 'never', stale: true }
  const budget = CADENCE_MINUTES[label]
  const text = mins < 1 ? 'just now' : mins < 60 ? `${Math.round(mins)} min ago` : `${(mins / 60).toFixed(1)} h ago`
  return { text, stale: budget !== undefined && mins > budget }
}

async function agentHealth(): Promise<Array<{ id: string; ok: boolean; ms: number; detail: string }>> {
  const base = process.env['MARQUE_PUBLIC_URL'] ?? 'https://marque.trade'
  return Promise.all(AGENTS.map(async (id) => {
    const started = Date.now()
    try {
      const res = await fetch(`${base}/agents/${id}/health`, {
        cache: 'no-store', signal: AbortSignal.timeout(6000),
      })
      return { id, ok: res.ok, ms: Date.now() - started, detail: res.ok ? 'answers' : `http ${res.status}` }
    } catch (err) {
      return { id, ok: false, ms: Date.now() - started, detail: err instanceof Error ? err.message.slice(0, 60) : 'unreachable' }
    }
  }))
}

export default async function StatusPage() {
  const [head, cursorQ, probesQ, confQ, watchQ, agents] = await Promise.all([
    publicClient().getBlockNumber().then((b) => b.toString()).catch(() => null),
    queried('ingest cursor', db().execute(sql`select source, cursor, updated_at from ingest_cursor order by source`)),
    queried('probe rollup', db().execute(sql`
      with latest as (select distinct on (agent_id) agent_id, liveness from probe order by agent_id, checked_at desc)
      select liveness, count(*)::int as n from latest group by liveness order by n desc
    `)),
    queried('conformance rollup', db().execute(sql`
      select test_id, count(*)::int as runs,
             sum(case when pass then 1 else 0 end)::int as passes,
             max(ran_at) as last_run
      from conformance_result where agent_id not like 'stub:%' group by test_id order by test_id
    `)),
    queried('pool observations', db().execute(sql`
      select count(distinct pool)::int as pools, count(*)::int as observations, max(observed_at) as last_observed
      from pool_tick_observation
    `)),
    agentHealth(),
  ])

  const cursor = cursorQ.rows
  const probes = probesQ.rows
  const conf = confQ.rows
  const watch = watchQ.rows
  const brokenQueries = [cursorQ, probesQ, confQ, watchQ].map((q) => q.failed).filter((f): f is string => f !== null)

  const probeTotal = probes.reduce((n, r) => n + Number(r['n'] ?? 0), 0)

  const watchRow = watch[0]
  const watchFresh = freshness('Pool tick watcher', watchRow?.['last_observed'] ? String(watchRow['last_observed']) : null)
  const ingestRow = cursor[0]
  const ingestFresh = freshness('Registry ingest', ingestRow?.['updated_at'] ? String(ingestRow['updated_at']) : null)
  const lastConf = conf.reduce<string | null>((acc, r) => {
    const t = r['last_run'] ? String(r['last_run']) : null
    return t !== null && (acc === null || t > acc) ? t : acc
  }, null)
  const confFresh = freshness('Conformance', lastConf)
  const downAgents = agents.filter((a) => !a.ok)

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Status</Statement>
          <p className={styles.lede}>
            What each moving part last did, and when. There is no overall green tick here: a
            dashboard that is green because it is broken is worse than no dashboard.
          </p>
          <p className={styles.note}>
            <ProvenanceChip provenance="MEASURED" />
            Read live from the database and the chain on every request. Nothing on this page is
            cached, and no uptime percentage is shown, because we do not run an external prober
            against ourselves and would have to invent one.
          </p>
        </header>

        {brokenQueries.length > 0 && (
          <p className={`${styles.warn} ${styles.stale}`}>
            {brokenQueries.length} of this page&rsquo;s own queries failed, so the sections below
            are incomplete: {brokenQueries.join('; ')}. This is shown rather than rendered as an
            empty section, because a status page that hides its own breakage is worse than none.
          </p>
        )}

        {downAgents.length > 0 && (
          <p className={`${styles.warn} ${styles.stale}`}>
            {downAgents.length} of {agents.length} reference agents did not answer just now:{' '}
            {downAgents.map((a) => a.id).join(', ')}. They are listed below with what happened.
          </p>
        )}

        <section className={styles.section}>
          <h2 className={styles.h2}>Chain and index</h2>
          <table className={styles.table}>
            <thead><tr><th>What</th><th>Value</th><th>Last moved</th><th /></tr></thead>
            <tbody>
              <tr>
                <td>BSC head</td>
                <td className="mono">{head ?? '—'}</td>
                <td className="mono">read just now</td>
                <td>{head === null ? <Chip tone="breach">unreadable</Chip> : <Chip tone="holds">live</Chip>}</td>
              </tr>
              {cursor.map((c) => (
                <tr key={String(c['source'])}>
                  <td className="mono">{String(c['source'])}</td>
                  <td className="mono">{String(c['cursor'])}</td>
                  <td className="mono">{ingestFresh.text}</td>
                  <td>{ingestFresh.stale ? <Chip tone="watch">stale</Chip> : <Chip tone="holds">fresh</Chip>}</td>
                </tr>
              ))}
              <tr>
                <td>Pool tick watcher</td>
                <td className="mono">
                  {watchRow ? `${watchRow['observations']} observations across ${watchRow['pools']} pools` : 'no observations'}
                </td>
                <td className="mono">{watchFresh.text}</td>
                <td>{watchFresh.stale ? <Chip tone="breach">stale</Chip> : <Chip tone="holds">fresh</Chip>}</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.note}>
            The registry index is an offset into 8004scan&rsquo;s listing, not a block height, so
            &ldquo;blocks behind&rdquo; does not describe it. What matters is when it last
            advanced, which is what is shown. The pool watcher IS block-shaped and is the one that
            must not go quiet — the hours-out-of-range figure on{' '}
            <Link href="/pancakeswap">the PancakeSwap Desk</Link> is only as dense as this series.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Probe coverage</h2>
          {probes.length === 0 ? (
            <p className={styles.muted}>No agent has been probed yet.</p>
          ) : (
            <>
              <table className={styles.table}>
                <thead><tr><th>Latest verdict</th><th>Agents</th><th>Share</th></tr></thead>
                <tbody>
                  {probes.map((p) => (
                    <tr key={String(p['liveness'])}>
                      <td>{String(p['liveness'])}</td>
                      <td className="mono">{Number(p['n']).toLocaleString('en-US')}</td>
                      <td className="mono">{((Number(p['n']) / probeTotal) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note}>
                One row per agent, its most recent verdict only. <strong>unbound</strong> is a
                first-class outcome, not an error: the endpoint answers with a valid card that
                declares no endpoint and no skills, so there is nothing to call. A probe that only
                checked for HTTP 200 would count every one of those as healthy.
              </p>
            </>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Reference agents</h2>
          <table className={styles.table}>
            <thead><tr><th>Agent</th><th>Health</th><th>Round trip</th><th>Detail</th></tr></thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.id}</td>
                  <td>{a.ok ? <Chip tone="holds">answers</Chip> : <Chip tone="breach">down</Chip>}</td>
                  <td className="mono">{a.ms} ms</td>
                  <td className="wrap">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>
            Checked on this request, through the public HTTPS path a buyer would use — including
            TLS and the reverse proxy, because a buyer waits for those too.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Conformance</h2>
          {conf.length === 0 ? (
            <p className={styles.muted}>No conformance run has been recorded.</p>
          ) : (
            <>
              <table className={styles.table}>
                <thead><tr><th>Test</th><th>Runs</th><th>Passes</th><th>Last run</th></tr></thead>
                <tbody>
                  {conf.map((c) => (
                    <tr key={String(c['test_id'])}>
                      <td className="mono">{String(c['test_id'])}</td>
                      <td className="mono">{String(c['runs'])}</td>
                      <td className="mono">{String(c['passes'])}</td>
                      <td className="mono">{c['last_run'] ? String(c['last_run']).slice(0, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note}>
                Test stubs are excluded. Every pass recorded so far belongs to a first-party
                reference agent — no third-party agent on BNB Chain has passed an MCS test yet,
                and that is the measured state of the supply rather than a filter.{' '}
                <Link href="/standard">The Standard</Link> lists the failures with their reasons.
                Last run {confFresh.text}.
              </p>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
