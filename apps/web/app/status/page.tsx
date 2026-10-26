import Link from 'next/link'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db, cachedProjection } from '@marque/db'
import { publicClient } from '@marque/chain'
import { tierFreshness } from '@marque/probe'
import { indexerStatus, questStats, campaignChainId } from '@marque/commerce'
import { Statement, Chip, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import styles from './status.module.css'
import { withDeadline } from '../../lib/deadline'
import { cursorReading, serviceReconciliationQuery, statusCursorsQuery } from '../../lib/status-cursors'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Status: what is fresh, what is stale, and how stale',
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
    return { rows: unwrap(await withDeadline(run, 5000)), failed: null }
  } catch (err) {
    return { rows: [], failed: `${label}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

const AGENTS = ['bound', 'lattice', 'sluicegate', 'keel', 'redcell', 'tidemark'] as const

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

/**
 * Everything the page reads, gathered once and kept as a Redis projection (D13): the page
 * answers from the last good gather at once and refreshes it in the background, and it says
 * how old that gather is. Ages are recomputed per request from the stored timestamps.
 */
async function gatherStatus() {
  const [head, cursorQ, probesQ, confQ, watchQ, usageQ, agents, tiers, quest, questTotals, reconciliationQ] = await Promise.all([
    withDeadline(publicClient().getBlockNumber(), 5000).then((b) => b.toString()).catch(() => null),
    queried('operational cursors', db().execute(statusCursorsQuery())),
    queried('probe rollup', db().execute(sql`
      with latest as (
        select distinct on (agent_id) agent_id, last_liveness as liveness
        from probe_schedule where last_checked_at is not null
        order by agent_id, last_checked_at desc
      )
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
    queried('product usage', db().execute(sql`
      select name, count(*)::int as n, min(at) as since from product_event group by name
    `)),
    agentHealth(),
    withDeadline(tierFreshness(), 5000).catch(() => null),
    withDeadline(indexerStatus(), 4000).catch(() => null),
    withDeadline(questStats(campaignChainId()), 4000).catch(() => null),
    queried('service reconciliation', db().execute(serviceReconciliationQuery())),
  ])
  return JSON.parse(JSON.stringify({ head, cursorQ, probesQ, confQ, watchQ, usageQ, agents, tiers, quest, questTotals, reconciliationQ })) as {
    head: typeof head; cursorQ: typeof cursorQ; probesQ: typeof probesQ; confQ: typeof confQ; watchQ: typeof watchQ; usageQ: typeof usageQ
    agents: typeof agents; tiers: typeof tiers; quest: typeof quest; questTotals: typeof questTotals; reconciliationQ: typeof reconciliationQ
  }
}

function measuredAt(iso: string, ago: string) {
  return <time dateTime={iso} title={`${iso.replace('T', ' ').slice(0, 19)} UTC`}>{ago}</time>
}

export default async function StatusPage() {
  // Incidents the alerts worker has paged and not yet seen recover (ops/marque-alerts.mjs), in its own words.
  const openIncidents = (() => {
    try {
      const st = JSON.parse(readFileSync(process.env['MARQUE_ALERTS_STATE'] ?? '/root/.marque/alerts-state.json', 'utf8')) as { signals?: Record<string, { alerted?: boolean; detail?: string; since?: number | null }> }
      return Object.entries(st.signals ?? {}).filter(([, v]) => v.alerted).map(([id, v]) => ({ id, detail: v.detail ?? '', since: v.since ?? null }))
    } catch { return [] as Array<{ id: string; detail: string; since: number | null }> }
  })()
  const projection = await cachedProjection('status:v4', gatherStatus, { freshMs: 30_000, timeoutMs: 6_000, staleWhileRevalidate: true })
    .catch(async () => ({ value: await gatherStatus(), computedAt: new Date().toISOString(), ageMs: 0, stale: false }))
  const { head, cursorQ, probesQ, confQ, watchQ, usageQ, agents, tiers, quest, questTotals, reconciliationQ } = projection.value
  const measuredAgo = projection.ageMs < 90_000 ? `${Math.max(1, Math.round(projection.ageMs / 1000))} s ago` : `${Math.round(projection.ageMs / 60_000)} min ago`
  let keeper: { at: string; keeper: string; settlesLastHour: number; capPerHour: number; chains: Record<string, { balanceBnb: string | null; floorBnb: string; submittedBound: number; due: number }> } | null = null
  try { keeper = JSON.parse(readFileSync(process.env.KEEPER_STATUS ?? '/root/.marque/keeper/status.json', 'utf8')) } catch { keeper = null }
  const cursor = cursorQ.rows
  const probes = probesQ.rows
  const conf = confQ.rows
  const watch = watchQ.rows
  const brokenQueries = [cursorQ, probesQ, confQ, watchQ, reconciliationQ].map((q) => q.failed).filter((f): f is string => f !== null)

  const probeTotal = probes.reduce((n, r) => n + Number(r['n'] ?? 0), 0)

  const watchRow = watch[0]
  const watchFresh = freshness('Pool tick watcher', watchRow?.['last_observed'] ? String(watchRow['last_observed']) : null)
  const reconciliation = reconciliationQ.rows[0]
  const lastConf = conf.reduce<string | null>((acc, r) => {
    const t = r['last_run'] ? String(r['last_run']) : null
    return t !== null && (acc === null || t > acc) ? t : acc
  }, null)
  const confFresh = freshness('Conformance', lastConf)
  const downAgents = agents.filter((a) => !a.ok)

  // Real-world usage (P10.5J) — anonymous product events, counted, with the
  // window stated. Never extrapolated.
  const USAGE_LABEL: Record<string, string> = {
    marketplace_search: 'marketplace searches',
    position_read: 'positions read',
    agent_profile_view: 'agent profiles opened',
    compare_add: 'agents added to a comparison',
    preflight_run: 'preflights run',
    hire_started: 'hires started',
    hire_completed: 'hires settled',
    charter_granted: 'charters granted',
    charter_revoked: 'charters revoked',
    builder_test_run: 'independent agent tests',
    third_party_listing: 'third-party listings',
    judge_flow_completed: 'judge walkthroughs finished',
  }
  const USAGE_ORDER = [
    'builder_test_run', 'marketplace_search', 'position_read', 'agent_profile_view',
    'compare_add', 'preflight_run', 'hire_started', 'hire_completed',
    'charter_granted', 'charter_revoked', 'third_party_listing', 'judge_flow_completed',
  ]
  const usage = usageQ.rows
  const usageSince = usage.reduce<string | null>((a, r) => {
    const s = r['since'] ? String(r['since']) : null
    return s !== null && (a === null || s < a) ? s : a
  }, null)
  const usageRows = USAGE_ORDER
    .map((name) => ({ name, label: USAGE_LABEL[name], n: Number(usage.find((r) => r['name'] === name)?.['n'] ?? 0) }))
    .filter((r) => r.n > 0)
  const usageTotal = usageRows.reduce((s, r) => s + r.n, 0)

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
            Read from the database and the chain {measuredAt(projection.computedAt, measuredAgo)}, and
            refreshed at most every 30 seconds. No uptime percentage is shown, because we do not run
            an external prober against ourselves and would have to invent one.
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

        {openIncidents.length > 0 && (
          <section className={styles.section} aria-labelledby="incidents-h">
            <h2 id="incidents-h" className={styles.h2}>Open incidents</h2>
            <ul className={styles.incidents}>
              {openIncidents.map((i) => <li key={i.id}><b>{i.id.replace(/_/g, ' ')}</b>: {i.detail}{i.since ? `, since ${new Date(i.since).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}</li>)}
            </ul>
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.h2}>Real-world usage</h2>
          {usageQ.failed ? (
            <p className={`${styles.warn} ${styles.stale}`}>The usage query failed: {usageQ.failed}</p>
          ) : usageRows.length === 0 ? (
            <p className={styles.note}>
              No product events recorded yet. They are anonymous: an event name and, at most, a
              category or a count. No IP, no wallet, no cookie, no third-party analytics.
            </p>
          ) : (
            <>
              <p className={styles.note}>
                <ProvenanceChip provenance="MEASURED" />
                {usageTotal.toLocaleString('en-US')} anonymous product events
                {usageSince ? `, since ${new Date(usageSince).toISOString().slice(0, 10)}` : ''}. No
                PII: an event name and, at most, a category or a count. Counted, never extrapolated.
              </p>
              <table className={styles.table} tabIndex={0} aria-label="Anonymous product usage">
                <thead><tr><th>What</th><th>Count</th></tr></thead>
                <tbody>
                  {usageRows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.label}</td>
                      <td className="mono">{r.n.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Chain and index</h2>
          <table className={styles.table} tabIndex={0} aria-label="Chain and index checkpoints">
            <thead><tr><th>What</th><th>Value</th><th>Last moved</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td>BSC head</td>
                <td className="mono">{head ?? 'n/a'}</td>
                <td className="mono">read just now</td>
                <td>{head === null ? <Chip tone="breach">unreadable</Chip> : <Chip tone="holds">live</Chip>}</td>
              </tr>
              {cursor.map((c) => {
                const reading = cursorReading(String(c['source']), c['updated_at'])
                return (
                  <tr key={String(c['source'])}>
                    <td>{reading.label}</td>
                    <td className="mono">{String(c['cursor'])}</td>
                    <td className="mono">{reading.text}</td>
                    <td>{reading.stale ? <Chip tone="watch">stale</Chip> : <Chip tone="holds">fresh</Chip>}</td>
                  </tr>
                )
              })}
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
          {reconciliation && !reconciliationQ.failed && (
            <p className={styles.note}>
              Service reconciliation: {String(reconciliation['snapshots'])} stored identity snapshots,{' '}
              {String(reconciliation['attempts'])} identities with a recorded refresh attempt,{' '}
              {String(reconciliation['pending'])} URI updates pending. Last successful snapshot:{' '}
              {reconciliation['last_snapshot'] ? new Date(String(reconciliation['last_snapshot'])).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'never'}.
              {' '}These are reconciliation checkpoints, separate from agent liveness. Per-identity checkpoints remain stored.
            </p>
          )}
          <p className={styles.note}>
            The registry index is an offset into 8004scan&rsquo;s listing, not a block height, so
            &ldquo;blocks behind&rdquo; does not describe it. What matters is when it last
            advanced, which is what is shown. The pool watcher IS block-shaped and is the one that
            must not go quiet: the hours-out-of-range figure on{' '}
            <Link href="/pancakeswap">the PancakeSwap Desk</Link> is only as dense as this series.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Quest index</h2>
          {quest === null && <p className={`${styles.warn} ${styles.stale}`}>The quest index could not be read just now.</p>}
          <table className={styles.table} tabIndex={0} aria-label="Quest index progress">
            <thead><tr><th>Chain</th><th>Indexed to</th><th>Head</th><th>Behind</th><th>Status</th></tr></thead>
            <tbody>
              {(quest ?? []).map((q) => (
                <tr key={q.chainId}>
                  <td>{q.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}</td>
                  <td className="mono">{q.cursorBlock ?? 'not started'}</td>
                  <td className="mono">{q.headBlock ?? 'unreadable'}</td>
                  <td className="mono">{q.lagBlocks === null ? 'unknown' : `${q.lagBlocks} blocks`}</td>
                  <td>{q.lagBlocks === null ? <Chip tone="breach">unknown</Chip> : q.lagBlocks > 200 ? <Chip tone="breach">behind</Chip> : <Chip tone="holds">current</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {keeper && Object.entries(keeper.chains).map(([c, k]) => (
            <p key={c} className={styles.note}>
              Keeper <span className="mono">{keeper.keeper}</span> on chain {c}: {k.submittedBound} delivered Marque jobs in their review window, {k.due} due to settle,{' '}
              {keeper.settlesLastHour} settled in the last hour (cap {keeper.capPerHour}); balance {k.balanceBnb ?? 'unreadable'} BNB, alarm below {k.floorBnb}. Last run {keeper.at}.
            </p>
          ))}
          {questTotals ? (
            <p className={styles.note}>
              Marque stretch quest on chain {questTotals.chainId}, locally eligible activity only: {questTotals.walletsWithHire} wallets hired,{' '}
              {Object.entries(questTotals.hiresPerCategory).map(([c, n]) => `${n} ${c.replace('_', ' ')}`).join(', ')};{' '}
              {questTotals.delivered} delivered, {questTotals.ratings} rated. Excluded (team, self, duplicate or not on Marque):{' '}
              {questTotals.excluded.hires} hires. Per wallet: <span className="mono">/api/v1/phase2/wallet/&lt;address&gt;</span>.
            </p>
          ) : <p className={styles.note}>Quest activity totals could not be read just now.</p>}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Probe freshness</h2>
          {tiers === null ? (
            <p className={styles.muted}>The probe schedule could not be read just now.</p>
          ) : (
            <>
              <table className={styles.table} tabIndex={0} aria-label="Probe freshness by tier">
                <thead><tr><th>Tier</th><th>Services</th><th>Fresh</th><th>Window</th><th>Oldest check</th></tr></thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.tier}>
                      <td>{t.tier === 'T0' ? 'Marque reference agents' : 'Agents in a category'}</td>
                      <td className="mono">{t.services.toLocaleString('en-US')}</td>
                      <td className="mono">{t.services ? `${t.fresh.toLocaleString('en-US')} (${((t.fresh / t.services) * 100).toFixed(1)}%)` : '0'}</td>
                      <td className="mono">{t.freshWithinMinutes} min</td>
                      <td className="mono">{t.oldestCheckAt ? new Date(t.oldestCheckAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note}>
                Every declared service has a place in the probe schedule. Reference agents are
                re-probed every 5 minutes and agents classified into a category every 30. Other
                answering services are re-checked every 12 hours, new ones as soon as they appear,
                and dead ones back off from an hour to three days. None is ever dropped.
              </p>
            </>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Probe coverage</h2>
          {probes.length === 0 ? (
            <p className={styles.muted}>No agent has been probed yet.</p>
          ) : (
            <>
              <table className={styles.table} tabIndex={0} aria-label="Latest probe coverage">
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
                One row per agent, the most recent verdict across its services. <strong>unbound</strong> is a
                first-class outcome, not an error: the endpoint answers with a valid card that
                declares no endpoint and no skills, so there is nothing to call. A probe that only
                checked for HTTP 200 would count every one of those as healthy.
              </p>
            </>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Reference agents</h2>
          <table className={styles.table} tabIndex={0} aria-label="Reference agent health">
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
            Checked on this request, through the public HTTPS path a buyer would use, including
            TLS and the reverse proxy, because a buyer waits for those too.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Conformance</h2>
          {conf.length === 0 ? (
            <p className={styles.muted}>{confQ.failed ? 'Conformance observations are unavailable right now.' : 'No conformance run has been recorded.'}</p>
          ) : (
            <>
              <table className={styles.table} tabIndex={0} aria-label="Conformance history">
                <thead><tr><th>Test</th><th>Runs</th><th>Passes</th><th>Last run</th></tr></thead>
                <tbody>
                  {conf.map((c) => (
                    <tr key={String(c['test_id'])}>
                      <td className="mono">{String(c['test_id'])}</td>
                      <td className="mono">{String(c['runs'])}</td>
                      <td className="mono">{String(c['passes'])}</td>
                      <td className="mono">{c['last_run'] ? String(c['last_run']).slice(0, 16).replace('T', ' ') : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note}>
                Test stubs are excluded. Counts include stored first-party and third-party runs.
                A pass applies to the recorded test, service and date; it does not prove paid settlement or campaign qualification.{' '}
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
