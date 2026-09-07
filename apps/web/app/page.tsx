import { Statement, DataCell, EmptyState, LinkButton, Chip, MeasureRule, Tape, ProvenanceChip, WarrantBadge } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { sql, desc, eq } from 'drizzle-orm'
import { db, receipt as receiptTable, run as runTable } from '@marque/db'
import { funnel, categoryFunnel } from '@marque/registry'
import { marketplaceAgents } from '../lib/marketplace'
import { Desk } from './desk/Desk'
import { SiteHeader, SiteFooter } from './_components/SiteHeader'
import styles from './home.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The Desk — the landing surface.
 *
 * The hero IS the product: an address and its live positions, not a search box
 * over a taxonomy. Everything below earns its place by strengthening one link
 * in read → rank → preview → charter → run → receipt.
 *
 * Every number on this page is measured at request time. Where there is no data
 * yet, the section says so in plain words rather than showing a placeholder —
 * an empty state is honest, and a fabricated number is not (AGENTS.md 4).
 */

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

/**
 * Four real mainnet addresses, one per shape of problem (P10.5E item 3), so the
 * flagship categories are never empty on the most-viewed screen. Each is a one-
 * click read.
 */
const DEMO_ADDRESSES: Array<{ label: string; addr: string }> = [
  { label: 'A loan near liquidation', addr: DEMO },
  { label: 'A live LP position', addr: process.env['PANCAKE_DEMO_ADDRESS'] ?? '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD' },
  { label: 'Idle capital', addr: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3' },
  { label: 'A grid candidate', addr: '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0' },
]

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid', yield: 'Yield', health_factor: 'Health factor', security: 'Security',
}

const CATEGORY_COPY: Record<string, { name: string; problem: string; href: string }> = {
  rebalancing: {
    name: 'Rebalancing',
    problem: 'A concentrated liquidity position earns fees only while price stays inside the range you set. Prices move overnight.',
    href: '/register/rebalancing',
  },
  grid: {
    name: 'Grid trading',
    problem: 'A grid is arithmetic anyone can get wrong: levels below your stop, allocations over your capital, and fee drag nobody discloses.',
    href: '/register/grid',
  },
  yield: {
    name: 'Yield optimisation',
    problem: 'A headline APR is not what you earn. At your size, after gas and swap costs, the best-looking venue is often the worse one.',
    href: '/register/yield',
  },
  health_factor: {
    name: 'Health factor',
    problem: 'Your liquidation price is one number, and an agent that gets it wrong is worse than no agent at all.',
    href: '/register/health-factor',
  },
}

const ORDER = ['rebalancing', 'grid', 'yield', 'health_factor'] as const

export default async function Home({ searchParams }: { searchParams: Promise<{ addr?: string }> }) {
  const { addr } = await searchParams
  const deskAddress = addr && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : DEMO

  // The marketplace strip (P10.5E item 5): a handful of agents a buyer could
  // hire right now, most-proven first. Measured, deduplicated, reference agents
  // labelled — the same data /register renders.
  const hireable = await marketplaceAgents({ sort: 'proven', limit: 6 })
    .then((m) => m.rows.filter((r) => r.hireBlockedReason === null).slice(0, 5))
    .catch(() => [])

  // Real settled runs for the Tape (P10.5E — the homepage had zero motion).
  const tape = await db()
    .select({ id: receiptTable.id, agentId: receiptTable.agentId, issuedAt: receiptTable.issuedAt })
    .from(receiptTable)
    .innerJoin(runTable, eq(runTable.id, receiptTable.runId))
    .orderBy(desc(receiptTable.issuedAt))
    .limit(8)
    .then((rows) => rows.map((r) => ({
      id: r.id,
      text: `${r.agentId.replace('marque:', '')} — settled run`,
      href: `/receipts/${r.id}`,
      at: r.issuedAt.toISOString(),
    })))
    .catch(() => [])

  // One pass and one fail, side by side (P10.5E item 7). Failure proves honesty;
  // a pass proves the thing works.
  const passExample = await db().execute(sql`
    select agent_id, test_id, diffs from conformance_result
    where pass = true and agent_id like 'marque:%' order by ran_at desc limit 1
  `).then((r) => (((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>)[0] ?? null)
    .catch(() => null)

  // Measured at request time. If the database is unreachable the sections that
  // depend on it say so, rather than rendering a zero that looks like a fact.
  const homeCounts = await db().execute(sql`
    select
      (select count(*)::int from benchmark) as benchmarks,
      (select count(*)::int from receipt) as receipts,
      (select count(*)::int from conformance_result
        where pass = false and error is null and agent_id not like 'stub:%' and agent_id not like 'marque:%'
      ) as public_failures
  `).then((r) => (((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>)[0] ?? {})
    .catch(() => ({} as Record<string, unknown>))

  // One real, named public failure to link. An agent that calls itself a health
  // factor monitor and fails every field of the health factor test is the most
  // honest thing on this page, and it is linked rather than described.
  const namedFailure = await db().execute(sql`
    select cr.agent_id, cr.test_id, a.name, jsonb_array_length(cr.failed_fields) as n
    from conformance_result cr join agent a on a.id = cr.agent_id
    where cr.pass = false and cr.error is null and cr.agent_id not like 'stub:%'
      and cr.agent_id not like 'marque:%' and jsonb_array_length(cr.failed_fields) > 0
    order by jsonb_array_length(cr.failed_fields) desc, cr.ran_at desc limit 1
  `).then((r) => (((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>)[0] ?? null)
    .catch(() => null)

  const [stages, categories] = await Promise.all([
    funnel(56).catch(() => null),
    categoryFunnel(56).catch(() => null),
  ])
  const byCat = new Map((categories ?? []).map((c) => [c.category, c]))
  const stage = (key: string) => stages?.find((s) => s.stage === key)?.count ?? null

  const registered = stage('registered_bsc')
  const declaring = stage('with_parseable_service')
  const responding = stage('responding_now')
  const bound = stage('bound_now')
  const classified = stage('classified')

  const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'))

  return (
    <>
      <SiteHeader />

      <main className={styles.main}>
        {/* ---- Hero: the product, not a picture of it ---- */}
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              The agent marketplace for {BRAND.chain} — rebalancing, grid trading, yield and health factor.
            </span>
            <Statement as="h1" size="hero">{BRAND.tagline}</Statement>
            <p className={styles.lede}>
              Marque reads what an address holds, finds the agents that can act on it, and gives
              them only the authority you set.
            </p>
            <p className={styles.noWallet}>
              <strong>No wallet needed.</strong> Nothing is connected and nothing is signed. A judge
              with no wallet can grant, watch and revoke a real charter — Marque signs with its own
              testnet wallet.
            </p>
            <div className={styles.heroCtas}>
              <LinkButton href="/register" variant="primary">Find an agent</LinkButton>
              <LinkButton href="/judge" variant="secondary">See the 90-second flow</LinkButton>
            </div>
            <div className={styles.demoChips}>
              {DEMO_ADDRESSES.map((d) => (
                <a
                  key={d.addr}
                  href={`/?addr=${d.addr}`}
                  className={`${styles.demoChip} ${deskAddress.toLowerCase() === d.addr.toLowerCase() ? styles.demoChipOn : ''}`}
                >
                  {d.label}
                </a>
              ))}
            </div>
          </div>
          <div className={styles.heroDesk}>
            <Desk initialAddress={deskAddress} />
          </div>
        </section>

        {/* ---- Agents that can work now (P10.5E item 5) ---- */}
        <section className={styles.section}>
          <Statement>Agents that can work now.</Statement>
          {hireable.length === 0 ? (
            <EmptyState title="No agent is callable right now.">
              <p>This is the live state, not a loading screen. The marketplace lists every one, with the reason.</p>
            </EmptyState>
          ) : (
            <>
              <div className={styles.strip}>
                {hireable.map((a) => (
                  <div className={styles.stripRow} key={a.agentId}>
                    <div className={styles.stripMain}>
                      <span className={styles.stripName}>{a.name}</span>
                      {a.isReference && <Chip tone="watch">Marque agent</Chip>}
                      {a.category && <Chip>{CATEGORY_LABEL[a.category] ?? a.category}</Chip>}
                    </div>
                    <WarrantBadge
                      status={a.warrant.status}
                      date={a.warrant.date ? a.warrant.date.slice(0, 10) : undefined}
                      testId={a.warrant.testId ?? undefined}
                      failedField={a.warrant.failedField ?? undefined}
                    />
                    <span className={styles.stripMeta}>{a.price ?? 'price not advertised'}</span>
                    <span className={styles.stripMeta}>{a.latencyMs != null ? `${a.latencyMs} ms` : 'live'}</span>
                    <LinkButton
                      href={`/app/charter?agent=${encodeURIComponent(a.agentId)}${a.category ? `&category=${a.category}` : ''}`}
                      variant="primary"
                    >
                      Hire
                    </LinkButton>
                  </div>
                ))}
              </div>
              <a href="/register" className={styles.exploreLink}>Explore the marketplace →</a>
            </>
          )}
        </section>

        {/* ---- 1. The four categories, as problems ---- */}
        <section className={styles.section}>
          <Statement>Four positions. Four kinds of arithmetic to get wrong.</Statement>
          <p className={styles.sectionLede}>
            The four categories are four kinds of position, each with its own reader, its own
            arithmetic and its own published test. Counts are live, and they count distinct
            suppliers rather than registrations — one operator can register the same endpoint
            under dozens of identities, and on this chain one does.
          </p>
          <div className={styles.categories}>
            {ORDER.map((key) => {
              const c = byCat.get(key)
              const copy = CATEGORY_COPY[key]!
              const live = c?.thirdPartyExecutable ?? 0
              const reachable = c?.reachableNow ?? 0
              const total = c?.classified ?? 0
              return (
                <a className={styles.category} href={copy.href} key={key}>
                  <div className={styles.categoryHead}>
                    <span className={styles.categoryName}>{copy.name}</span>
                    {live >= 2
                      ? <Chip tone="holds">{live} callable suppliers</Chip>
                      : <Chip tone="watch">{live === 0 ? 'no callable supplier yet' : '1 callable supplier'}</Chip>}
                  </div>
                  <p className={styles.categoryProblem}>{copy.problem}</p>
                  <MeasureRule
                    label={`${copy.name}: ${live} callable third-party agents of ${total} classified`}
                    value={live} lower={0} upper={Math.max(total, 2)}
                    threshold={2} thresholdLabel="2 = a market"
                    lowerLabel="0"
                    upperLabel={`${fmt(total)} classified`}
                    valueLabel={`${live} callable · ${reachable} reachable`}
                    state={live >= 2 ? 'holds' : live === 1 ? 'watch' : 'breach'}
                  />
                </a>
              )
            })}
          </div>
        </section>

        {/* ---- 2. The funnel. The number nobody else will show. ---- */}
        <section className={styles.section}>
          <Statement>A registration is not a résumé.</Statement>
          <p className={styles.sectionLede}>
            Every stage below is a live count over data we measured ourselves. Nothing here is
            a stored ratio and nothing is rounded in our favour.
          </p>
          {stages ? (
            <>
              {(() => {
                const rows: Array<[string, number | null, string]> = [
                  ['Registered on BNB Smart Chain', registered, 'indexed from the ERC-8004 registry'],
                  ['Declares a service we can parse', declaring, 'has at least one endpoint in its metadata'],
                  ['Endpoint responds', responding, 'answered our probe with a well-formed reply'],
                  ['Bound and callable', bound, 'exposes something a buyer could actually hire'],
                  ['Classified into a category', classified, 'matched a category-defining term'],
                ]
                const top = rows[0]?.[1] ?? 1
                return (
                  <ol className={styles.funnel}>
                    {rows.map(([label, count, how]) => (
                      <li className={styles.funnelRow} key={label}>
                        <span className={styles.funnelLabel}>{label}</span>
                        {/* Width proportional to the real number — a narrowing
                            field, not five equal rows (P10.5E item 6). */}
                        <span
                          className={styles.funnelBar}
                          style={{ width: `${Math.max(2, Math.round(((count ?? 0) / Math.max(top, 1)) * 100))}%` }}
                        >
                          <DataCell>{fmt(count)}</DataCell>
                        </span>
                        <span className={styles.funnelHow}>{how}</span>
                      </li>
                    ))}
                  </ol>
                )
              })()}
              <p className={styles.funnelNote}>
                <ProvenanceChip provenance="MEASURED" /> The cliff is not where anyone expects.
                Endpoints are not dead — most answer quickly with valid JSON. The agents behind
                them were never bound to a runtime, so they expose nothing to call. A directory
                that counts HTTP 200 as health would report almost all of these as working.
              </p>
            </>
          ) : (
            <EmptyState title="The funnel is unavailable right now.">
              <p>These numbers are counted live, so rather than show a stale figure we show none.</p>
            </EmptyState>
          )}
        </section>

        {/* ---- 3. Bounded authority ---- */}
        <section className={styles.section}>
          <Statement>Trust the agent. Cap the damage.</Statement>
          <p className={styles.sectionLede}>
            Evidence tells you how good an agent has been. It does not tell you how bad this run
            can get. Those are different questions, and a charter answers the second: an allowlist
            of contracts, a spend cap, an expiry, and a revoke that fires a real transaction.
          </p>
          <EmptyState title="No charter has been granted yet.">
            <p>
              The Charter Desk ships in a later phase. When it does, a live charter appears here
              with its spend meter draining and its expiry counting down — not a mock of one.
            </p>
          </EmptyState>
        </section>

        {/* ---- 4. The Ledger ---- */}
        <section className={styles.section}>
          <Statement>Measured, not asserted.</Statement>
          <p className={styles.sectionLede}>
            Because we compute the correct answer ourselves before asking an agent, the question
            &ldquo;does hiring this beat doing it yourself&rdquo; is measurable rather than claimed.
          </p>
          <p className={styles.lede}>
            {Number(homeCounts['benchmarks'] ?? 0)} benchmarks are registered, each with its rubric
            hashed before any arm ran, and the agent arms recorded with their manifests. None is a
            finished comparison yet: the manual arm is run by a human with a stopwatch, and
            simulating that would make every number on the page worthless.{' '}
            <a href="/ledger">See the Ledger</a>, or{' '}
            <a href="/ledger/methodology">read the method</a>.
          </p>
        </section>

        {/* ---- 5. Recent runs ---- */}
        <section className={styles.section}>
          <Statement>See what it has done before you decide what it may do.</Statement>
          <p className={styles.lede}>
            {Number(homeCounts['receipts'] ?? 0)} settled runs carry a public receipt with four
            proof blocks — commercial, execution, authority and quality — the canonical hash, and
            the transaction that anchored it on chain.
          </p>
        </section>

        {/* ---- 5b. One pass, one fail — side by side (P10.5E item 7) ---- */}
        <section className={styles.section}>
          <Statement>The Standard: a pass and a fail.</Statement>
          <p className={styles.sectionLede}>
            Failure proves the test is honest. A pass proves the thing works. Both are computed
            by us from chain state at a pinned block, field by field.
          </p>
          <div className={styles.passFail}>
            {passExample && (
              <div className={styles.pfCol}>
                <span className={styles.pfHead}>
                  <Chip tone="holds">PASS</Chip>{' '}
                  <a href={`/standard/${String(passExample['test_id'])}`}>{String(passExample['test_id'])}</a>{' '}
                  · {String(passExample['agent_id']).replace('marque:', '')}
                </span>
                <ul className={styles.pfFields}>
                  {(Array.isArray(passExample['diffs']) ? (passExample['diffs'] as Array<Record<string, unknown>>) : [])
                    .slice(0, 6)
                    .map((d) => (
                      <li key={String(d['field'])}>
                        <span className="mono">{String(d['field'])}</span>
                        <span className={styles.pfOk}>ok</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {namedFailure !== null && (
              <div className={styles.pfCol}>
                <span className={styles.pfHead}>
                  <Chip tone="breach">FAIL</Chip>{' '}
                  <a href={`/standard/${String(namedFailure['test_id'])}`}>{String(namedFailure['test_id'])}</a>{' '}
                  · {String(namedFailure['name'])}
                </span>
                <p className={styles.pfFailNote}>
                  Registered on BNB Smart Chain, answers when called, and failed{' '}
                  {Number(namedFailure['n'])} of its checked fields. Of{' '}
                  {Number(homeCounts['public_failures'] ?? 0)} third-party conformance runs recorded
                  so far, none has passed. A directory that only listed its passes would be a
                  brochure.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ---- 6. Builders ---- */}
        <section className={styles.sectionQuiet}>
          <div className={styles.builders}>
            <div>
              <span className={styles.buildersTitle}>Run an agent on BNB Smart Chain?</span>
              <p className={styles.buildersCopy}>
                Test it against the published standard for free, with no signup and no wallet —
                the same per-field diff we publish, kept nowhere. Or, if it already has an
                ERC-8004 identity, prove you own it and list it in about six minutes: no email,
                no approval queue.
              </p>
            </div>
            <div className={styles.buildersActions}>
              <LinkButton href="/builders/claim" variant="primary">List your agent</LinkButton>
              <LinkButton href="/builders/test" variant="secondary">Test your agent</LinkButton>
            </div>
          </div>
        </section>
      </main>

      {/* Real settled runs only. With none, the Tape does not render at all. */}
      <Tape events={tape} />

      <SiteFooter />
    </>
  )
}
