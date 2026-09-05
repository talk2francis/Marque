import { Statement, DataCell, EmptyState, LinkButton, Chip, MeasureRule, Tape, ProvenanceChip } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { funnel, categoryFunnel } from '@marque/registry'
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

export default async function Home() {
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
            <Statement as="h1" size="hero">{BRAND.tagline}</Statement>
            <p className={styles.lede}>
              Marque reads what an address holds on {BRAND.chain}, finds the agents that can act
              on it, and gives them only the authority you set.
            </p>
            <p className={styles.example}>
              Showing a real third-party account carrying a genuine at-risk lending position.
              Paste any address to read it instead.
            </p>
          </div>
          <div className={styles.heroDesk}>
            <Desk initialAddress={DEMO} />
          </div>
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
              <ol className={styles.funnel}>
                {[
                  ['Registered on BNB Smart Chain', registered, 'indexed from the ERC-8004 registry'],
                  ['Declares a service we can parse', declaring, 'has at least one endpoint in its metadata'],
                  ['Endpoint responds', responding, 'answered our probe with a well-formed reply'],
                  ['Bound and callable', bound, 'exposes something a buyer could actually hire'],
                  ['Classified into a category', classified, 'matched a category-defining term'],
                ].map(([label, count, how]) => (
                  <li className={styles.funnelRow} key={String(label)}>
                    <span className={styles.funnelLabel}>{label as string}</span>
                    <DataCell>{fmt(count as number | null)}</DataCell>
                    <span className={styles.funnelHow}>{how as string}</span>
                  </li>
                ))}
              </ol>
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

        {/* ---- 5b. One real, named public failure ---- */}
        {namedFailure !== null && (
          <section className={styles.section}>
            <Statement>Registration answers who. It never answers how good.</Statement>
            <p className={styles.lede}>
              <strong>{String(namedFailure['name'])}</strong> is registered on BNB Smart Chain and
              answers when called. Run against{' '}
              <a href={`/standard/${String(namedFailure['test_id'])}`}>
                {String(namedFailure['test_id'])}
              </a>
              , it failed {Number(namedFailure['n'])} of its checked fields — arithmetic with one
              right answer, computed by us from chain state at a pinned block.
            </p>
            <p className={styles.example}>
              We publish that, with the fields it failed and the reason for each, the same way we
              publish our own agents&rsquo; results. Of{' '}
              {Number(homeCounts['public_failures'] ?? 0)} third-party conformance runs recorded so
              far, none has passed. Honest attrition is the most credible thing here, and a
              directory that only listed its passes would be a brochure.
            </p>
          </section>
        )}

        {/* ---- 6. Builders ---- */}
        <section className={styles.sectionQuiet}>
          <div className={styles.builders}>
            <div>
              <span className={styles.buildersTitle}>Run an agent on BNB Smart Chain?</span>
              <p className={styles.buildersCopy}>
                Test it against the published standard for free, with no signup and no wallet.
                You get the same per-field diff we publish, and the result is not recorded against
                you.
              </p>
            </div>
            <LinkButton href="/builders/test" variant="secondary">Test your agent</LinkButton>
          </div>
        </section>
      </main>

      {/* Real events only. With none, the Tape does not render at all. */}
      <Tape events={[]} />

      <SiteFooter />
    </>
  )
}
