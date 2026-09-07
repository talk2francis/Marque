import { notFound } from 'next/navigation'
import { Statement, Chip } from '@marque/ui'
import { categoryFunnel, MIN_THIRD_PARTY_PER_CATEGORY } from '@marque/registry'
import { Marketplace } from '../Marketplace'
import { RegisterTable } from '../RegisterTable'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import styles from '../register.module.css'

export const dynamic = 'force-dynamic'

/**
 * One category of the Register.
 *
 * The URL slug and the stored category differ for health factor, because
 * `health-factor` reads better than `health_factor` in a URL and the database
 * value should not leak into the address bar.
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

  const cats = await categoryFunnel(56).catch(() => null)
  const row = cats?.find((c) => c.category === meta.key)

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
      <div className={styles.head}>
        <Statement as="h1">{meta.label}</Statement>
        <p className={styles.lede}>{meta.what}</p>
        <p className={styles.lede}>{meta.columns}</p>
        {row && (
          <p className={styles.lede}>
            {row.thirdPartyExecutable < MIN_THIRD_PARTY_PER_CATEGORY
              ? <Chip tone="watch">
                  {row.thirdPartyExecutable === 0 ? 'No callable supplier yet' : '1 callable supplier'}
                  {' · a category needs 2 to be a market'}
                </Chip>
              : <Chip tone="holds">{row.thirdPartyExecutable} callable suppliers</Chip>}
            {row.thirdPartyRegistrations > row.thirdPartyExecutable && (
              <span className={styles.lede}>
                {' '}Across {row.thirdPartyRegistrations} registrations — several identities point
                at the same endpoint, so suppliers is the number that means anything.
              </span>
            )}
          </p>
        )}
      </div>
      <Marketplace category={meta.key} />

      <section className={styles.graveyard}>
        <h2 className={styles.h2}>The graveyard, in this category</h2>
        <RegisterTable category={meta.key} graveyard />
      </section>
    </main>
      <SiteFooter />
    </>
  )
}
