import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { Statement, Chip, DataCell, ProvenanceChip, WarrantBadge, EmptyState, EvidenceDrawer } from '@marque/ui'
import styles from './agent.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * An agent profile — three questions, in this order.
 *
 *   What it does · What it has proved · What it needs from you
 *
 * The order is the argument. Capability first, evidence second, and the price
 * in authority last, because that is the sequence in which a buyer's questions
 * actually arrive.
 *
 * Feedback is SPLIT and never merged: a rating attached to a paid run we
 * observed is a different kind of fact from a rating anyone could write, and
 * averaging them together is how every marketplace launders reputation.
 */

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid trading', yield: 'Yield optimisation',
  health_factor: 'Health factor', security: 'Security',
}

const FAILURE_COPY: Record<string, string> = {
  unbound: 'Answers, but was never bound to a runtime. There is nothing to call.',
  empty_tools: 'Answers, but exposes no tools.',
  timeout: 'The declared endpoint did not respond in time.',
  dns: 'The hostname does not resolve.',
  refused: 'The connection was refused.',
  http_4xx: 'The endpoint returned a client error.',
  http_5xx: 'The endpoint returned a server error.',
  bad_schema: 'The endpoint answers, but its payload does not match the protocol it declares.',
  blocked_ssrf: 'The declared endpoint points at a private address, so we did not contact it.',
  rate_limited: 'The endpoint rate-limited our probe.',
  unknown: 'The endpoint did not answer.',
}

interface Row { [k: string]: unknown }
const unwrap = (r: unknown): Row[] =>
  ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Row[]

export default async function AgentPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params
  if (!/^[0-9]+$/.test(tokenId)) notFound()

  const d = db()
  const agentRows = unwrap(await d.execute(sql`
    select a.*, c.category, c.confidence, c.method, c.rationale
    from agent a left join agent_category c on c.agent_id = a.id
    where a.chain_id = 56 and a.token_id = ${tokenId} limit 1
  `))
  const a = agentRows[0]
  if (!a) notFound()

  const [services, probes, conformance] = await Promise.all([
    d.execute(sql`select kind, endpoint, resolved_endpoint, is_template, version, declared_price, source
                  from agent_service where agent_id = ${a['id']} order by kind`).then(unwrap),
    d.execute(sql`select checked_at, ok, liveness, latency_ms, status_code, failure_class, detail, skills
                  from probe where agent_id = ${a['id']} order by checked_at desc limit 50`).then(unwrap),
    d.execute(sql`select test_id, pass, diffs, failed_fields, ran_at, block_number, latency_ms, error, response_hash
                  from conformance_result where agent_id = ${a['id']} order by ran_at desc limit 8`).then(unwrap),
  ])

  const latest = probes[0]
  const live = latest?.['liveness'] === 'live'
  const skills = Array.isArray(latest?.['skills']) ? (latest['skills'] as string[]) : []
  const okCount = probes.filter((p) => p['ok'] === true).length
  const latencies = probes.map((p) => Number(p['latency_ms'] ?? 0)).filter((n) => n > 0).sort((x, y) => x - y)
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : null

  const category = a['category'] as string | null
  const name = (a['name'] as string | null) ?? `Agent ${tokenId}`

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <Statement as="h1">{name}</Statement>
          <span className={styles.headChips}>
            {category && category !== 'unclassified' && <Chip>{CATEGORY_LABEL[category] ?? category}</Chip>}
            {live ? <Chip tone="holds">callable</Chip> : <Chip tone="breach">not callable</Chip>}
          </span>
        </div>
        <p className={styles.identity}>
          <span className="mono">ERC-8004 · chain 56 · token {tokenId}</span>
          {a['owner_address'] ? <span className="mono"> · owner {String(a['owner_address']).slice(0, 10)}…</span> : null}
        </p>
      </header>

      {/* ---------- 1. What it does ---------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>What it does</h2>
        {a['description'] ? (
          <p className={styles.body}>
            {String(a['description'])} <ProvenanceChip provenance="CLAIMED" />
          </p>
        ) : (
          <p className={styles.muted}>
            This agent published no description. <ProvenanceChip provenance="CLAIMED" />
          </p>
        )}

        {skills.length > 0 ? (
          <>
            <h3 className={styles.h3}>Skills it advertises at its own endpoint</h3>
            <div className={styles.chips}>
              {skills.map((s) => <Chip key={s}>{s}</Chip>)}
            </div>
            <p className={styles.note}>
              <ProvenanceChip provenance="MEASURED" /> Read from the agent&rsquo;s own card by our
              probe, not from the registry listing.
            </p>
          </>
        ) : (
          <p className={styles.muted}>It advertises no skills at its endpoint.</p>
        )}

        <h3 className={styles.h3}>Endpoints</h3>
        {services.length === 0 ? (
          <p className={styles.muted}>No service endpoint appears in this agent&rsquo;s metadata, so no client can reach it.</p>
        ) : (
          <ul className={styles.endpoints}>
            {services.map((s, i) => (
              <li key={i}>
                <Chip>{String(s['kind'])}</Chip>
                <code className={styles.code}>{String(s['resolved_endpoint'] ?? s['endpoint'])}</code>
                {s['is_template'] === true && (
                  <span className={styles.note}>
                    Published as a template; resolved against this agent&rsquo;s token id.
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 2. What it has proved ---------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>What it has proved</h2>

        <h3 className={styles.h3}>Conformance</h3>
        {conformance.length === 0 ? (
          <EmptyState title="No conformance run against this agent yet.">
            <p>
              A warrant is dated and earned, never assumed. Until this agent has been run against
              the published standard it carries no mark. <WarrantBadge status="untested" />
            </p>
          </EmptyState>
        ) : (
          <div className={styles.results}>
            {conformance.map((r, i) => {
              const diffs = Array.isArray(r['diffs']) ? (r['diffs'] as Array<Record<string, unknown>>) : []
              return (
                <article className={styles.result} key={i}>
                  <div className={styles.resultHead}>
                    <span className="mono">{String(r['test_id'])}</span>
                    {r['pass'] === true
                      ? <WarrantBadge status="warranted" date={new Date(String(r['ran_at'])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} />
                      : <WarrantBadge status="failed" testId={String(r['test_id'])} failedField={(r['failed_fields'] as string[] | null)?.[0]} />}
                    <DataCell muted>block {String(r['block_number'])}</DataCell>
                  </div>
                  {r['error'] ? (
                    <p className={styles.muted}>{String(r['error'])}</p>
                  ) : (
                    <table className={styles.diff}>
                      <thead>
                        <tr><th>Field</th><th>Expected</th><th>Returned</th><th>Tolerance</th></tr>
                      </thead>
                      <tbody>
                        {diffs.map((dd, j) => (
                          <tr key={j} className={dd['pass'] === true ? '' : styles.diffFail}>
                            <td className="mono">{String(dd['field'])}</td>
                            <td className="mono">{String(dd['expected'])}</td>
                            <td className="mono">{String(dd['actual'])}</td>
                            <td className="mono">{String(dd['tolerance'])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </article>
              )
            })}
          </div>
        )}

        <h3 className={styles.h3}>Liveness, measured by us</h3>
        {probes.length === 0 ? (
          <p className={styles.muted}>This agent has not been probed yet.</p>
        ) : (
          <>
            <dl className={styles.facts}>
              <div><dt>Probes recorded</dt><dd><DataCell align="left">{probes.length}</DataCell></dd></div>
              <div><dt>Answered</dt><dd><DataCell align="left">{okCount} of {probes.length}</DataCell></dd></div>
              <div><dt>p95 latency</dt><dd><DataCell align="left">{p95 !== null ? `${p95}ms` : '—'}</DataCell></dd></div>
              <div>
                <dt>Latest verdict</dt>
                <dd>
                  <DataCell align="left">
                    {String(latest?.['liveness'] ?? 'unknown')}
                    {latest?.['failure_class'] ? ` — ${FAILURE_COPY[String(latest['failure_class'])] ?? String(latest['failure_class'])}` : ''}
                  </DataCell>
                </dd>
              </div>
            </dl>
            <EvidenceDrawer
              evidence={{
                method: 'Marque probe: kind-specific liveness check that grades the response body, not the status code',
                source: String(services[0]?.['resolved_endpoint'] ?? services[0]?.['endpoint'] ?? 'no endpoint'),
                at: String(latest?.['checked_at'] ?? ''),
                extra: {
                  'Sample size': probes.length,
                  'HTTP status': latest?.['status_code'] ? String(latest['status_code']) : '—',
                  Detail: latest?.['detail'] ? String(latest['detail']) : '—',
                },
              }}
            />
          </>
        )}

        <h3 className={styles.h3}>Feedback</h3>
        <div className={styles.feedbackSplit}>
          <div>
            <span className={styles.feedbackLabel}>Verified by a paid run</span>
            <p className={styles.muted}>
              None. This counts only ratings attached to a run Marque observed and settled.
              <ProvenanceChip provenance="MEASURED" />
            </p>
          </div>
          <div>
            <span className={styles.feedbackLabel}>Unverified registry feedback</span>
            <p className={styles.muted}>
              None indexed. Anyone can write this and it is never merged into the number above.
              <ProvenanceChip provenance="CLAIMED" />
            </p>
          </div>
        </div>

        <h3 className={styles.h3}>What the registry claims about health</h3>
        <p className={styles.note}>
          <ProvenanceChip provenance="CLAIMED" />{' '}
          {a['scan_health_status']
            ? <>8004scan reports &ldquo;{String(a['scan_health_status'])}&rdquo;
                {a['scan_health_checked_at'] ? <>, checked {new Date(String(a['scan_health_checked_at'])).toLocaleDateString('en-GB')}</> : null}.
                This can be months stale and is never used as our liveness figure.</>
            : <>8004scan publishes no health verdict for this agent.</>}
        </p>
      </section>

      {/* ---------- 3. What it needs from you ---------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>What it needs from you</h2>
        {live ? (
          <EmptyState title="Hiring opens with the Charter Desk.">
            <p>
              When it does, this section states the exact contracts this agent may touch, the
              spend cap, the expiry, and the worst case if it misbehaves — before anything is
              signed. Nothing here is estimated in the meantime.
            </p>
          </EmptyState>
        ) : (
          <EmptyState title="This agent cannot be hired.">
            <p>
              {latest?.['failure_class']
                ? FAILURE_COPY[String(latest['failure_class'])] ?? 'Its endpoint does not answer.'
                : 'It exposes no callable endpoint.'}
              {' '}It stays listed with the reason rather than being hidden.
            </p>
          </EmptyState>
        )}
      </section>

      <p className={styles.back}><a href="/register">Back to the Register</a></p>
    </main>
  )
}
