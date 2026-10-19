import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Statement, Chip, ProvenanceChip } from '@marque/ui'
import { categoryFunnel, MIN_THIRD_PARTY_PER_CATEGORY } from '@marque/registry'
import { Marketplace } from '../Marketplace'
import { initialMarket } from '../initial'
import { RegisterTable } from '../RegisterTable'
import { Disclosure } from '../Disclosure'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import styles from '../register.module.css'

// Same for every visitor, so served from Next's cache and re-rendered at most every 30 s
// (P2-11 load test: rendering per request capped the site near 15 requests a second).
export const revalidate = 30
// A dynamic segment is only page-cached when it declares its params; none are
// prerendered at build, each renders on its first request and is then cached.
export async function generateStaticParams() { return [] }

/**
 * One category of the Marketplace.
 *
 * The URL slug and the stored category differ for health factor, because
 * `health-factor` reads better than `health_factor` in a URL and the database
 * value should not leak into the address bar.
 *
 * Same principle as the main marketplace: a buyer gets a title, one plain line
 * and the inventory; the exact MCS grading criteria — which a judge does want,
 * verbatim — move one click down rather than off the page.
 */
const SLUGS: Record<string, { key: string; label: string; what: string; columns: string }> = {
  rebalancing: {
    key: 'rebalancing',
    label: 'Rebalancing',
    what: 'Agents that manage a concentrated liquidity position: reading its range, deciding when it has drifted, and proposing a legal re-centre.',
    columns: 'Judged on MCS-REB-1: the current tick, the in-range boolean, distance to the nearer bound, whether proposed ticks are multiples of the pool’s spacing, and whether the amounts satisfy the V3 liquidity formula.',
  },
  grid: {
    key: 'grid',
    label: 'Grid trading',
    what: 'Agents that plan a grid: levels, spacing, allocation, and the fee drag that comes with every round trip.',
    columns: 'Judged on MCS-GRID-1: spacing arithmetic against the declared type, allocations within capital, every level inside the supplied bounds, none at or below the stop, and fee drag disclosed.',
  },
  yield: {
    key: 'yield',
    label: 'Yield optimisation',
    what: 'Agents that route idle assets, net of the costs that decide whether moving is worth it at your size.',
    columns: 'Judged on MCS-YIELD-1: every APR sourced and timestamped, net APR within 15bps of ours at the stated size, switching cost itemized, and the supplied improvement threshold respected.',
  },
  'health-factor': {
    key: 'health_factor',
    label: 'Health factor',
    what: 'Agents that monitor a lending position and say exactly what it takes to make it safe again.',
    columns: 'Judged on MCS-HF-1: health factor to three decimals, the correct per-market collateral factor, the liquidation price, and a repay amount that actually restores the target when applied.',
  },
  security: {
    key: 'security',
    label: 'Security',
    what: 'Contract and approval risk triage. Weighted above general-purpose agents in the TermiX rubric.',
    columns: 'No MCS test is published for this category yet, so no agent here carries a warrant.',
  },
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params
  const meta = SLUGS[slug]
  if (!meta) notFound()

  const [cats, initial] = await Promise.all([categoryFunnel(56).catch(() => null), initialMarket(meta.key)])
  const row = cats?.find((c) => c.category === meta.key)
  const untested = meta.key === 'security'

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.intro}>
          <div className={styles.introText}>
            <Link href="/register" className={`eyebrow ${styles.introEyebrow} ${styles.introBack}`}>
              ← Marketplace
            </Link>
            <Statement as="h1" className={styles.introTitle}>{meta.label}</Statement>
            <p className={styles.introLede}>{meta.what}</p>
            <p className={styles.introSupply}>
              <Chip tone={initial?.total == null || (!untested && initial.total < 3) ? 'watch' : 'holds'}>
                {initial?.total == null ? 'Escrow listing count unavailable' : `${initial.total} hireable escrow listings`}
              </Chip>
              <span className={styles.introSupplyNote}>BSC 56 and 97. {untested ? 'Additional category, outside the core supply target.' : 'Local supply target: at least 3.'} Quotes expire; the list below refreshes as availability changes.</span>
              {initial?.generatedAt ? <span className={styles.introSupplyNote}><ProvenanceChip provenance="MEASURED" /> Listing snapshot <time dateTime={initial.generatedAt}>{initial.generatedAt.replace('T', ' ').slice(0, 19)} UTC</time>.</span> : null}
            </p>
            {row && (
              <p className={styles.introSupply}>
                {row.thirdPartyExecutable < MIN_THIRD_PARTY_PER_CATEGORY ? (
                  <>
                    <Chip tone="watch">
                      {row.thirdPartyExecutable === 0 ? 'No compatible third-party task supplier' : '1 compatible third-party task supplier'}
                    </Chip>
                    <span className={styles.introSupplyNote}>Separate task-call checks over the last 24 hours, not the escrow listing count. Groups use recorded owners/endpoints; independence is not verified.</span>
                  </>
                ) : (
                  <Chip tone="holds">{row.thirdPartyExecutable} compatible third-party task suppliers</Chip>
                )}
                {row.thirdPartyRegistrations > row.thirdPartyExecutable && (
                  <span className={styles.introSupplyNote}>
                    across {row.thirdPartyRegistrations.toLocaleString()} registrations; several identities
                    point at the same endpoint. These checks do not establish fresh payment terms.
                  </span>
                )}
              </p>
            )}
          </div>
        </header>

        <Marketplace category={meta.key} initial={initial} />

        <div className={styles.appendix}>
          <Disclosure
            summary={`How Marque tests ${meta.label}`}
            hint={untested ? 'No published test yet' : 'The exact graded fields'}
          >
            <p>{meta.columns}</p>
            {!untested && (
              <p>
                The full case, its tolerances and its frozen ground truth are published at{' '}
                <Link href="/standard">the Standard</Link>.
              </p>
            )}
          </Disclosure>

          <Disclosure
            id="unavailable-agents"
            summary={`Unavailable agents in ${meta.label}`}
            hint="Kept, not deleted"
            tone="quiet"
            lazy
          >
            <p>
              Marque keeps unavailable and unbound registrations visible instead of deleting the evidence, with
              the reason on every row.
            </p>
            <RegisterTable category={meta.key} graveyard />
          </Disclosure>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
