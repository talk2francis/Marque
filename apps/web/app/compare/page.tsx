import Link from 'next/link'
import { Statement, EmptyState, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { marketplaceAgents, type MarketRow } from '../../lib/marketplace'
import { profileHref } from '../register/market-model'
import { CompareTable } from './CompareTable'
import { comparisonIds } from '../../lib/compare-selection'
import styles from './compare.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Compare agents',
  description:
    'Agents side by side on the things that decide a hire: what it does, whether you can hire it now, whether it passed the standard, its paid jobs on chain, verified ratings, whether you can try it free, its identity, and what it costs.',
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ agents?: string }> }) {
  const { agents: raw } = await searchParams
  const ids = comparisonIds(raw)

  let loadFailed = false
  const { rows } = ids.length >= 2
    ? await marketplaceAgents({ agentIds: ids, includeUnclassified: true, limit: 3 }).catch(() => {
      loadFailed = true
      return { rows: [] as MarketRow[] }
    })
    : { rows: [] as MarketRow[] }
  const chosen = ids.map((id) => rows.find((r) => r.agentId === id)).filter((r): r is MarketRow => Boolean(r))

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Compare</Statement>
          <p className={styles.lede}>
            The same questions for each, in the order they decide a hire: what it does, whether you
            can hire it now, whether it passed the standard, what it has done on chain, whether you
            can try it free, who it is, and what it costs. Ratings count only verified buyers.
          </p>
        </header>

        {chosen.length < 2 ? (
          <EmptyState title={loadFailed ? 'Comparison could not be loaded.' : ids.length >= 2 ? 'Some selected agents are unavailable.' : 'Pick two or three agents to compare.'}>
            <p>{ids.length >= 2 ? 'Please refresh, or choose agents in the ' : 'Select agents in the '}<Link href="/register">marketplace</Link>{ids.length >= 2 ? '.' : ' and the compare tray will bring you here.'}</p>
          </EmptyState>
        ) : (
          <CompareTable
            chosen={chosen}
            hireLink={(a) => `${profileHref(a) ?? '/register'}?hire=${encodeURIComponent(a.agentId)}`}
            tryLink={(a) => `${profileHref(a) ?? '/register'}?hire=${encodeURIComponent(a.agentId)}&try=1`}
          />
        )}

        <p className={styles.note}>
          <ProvenanceChip provenance="ONCHAIN" /> Paid jobs and ratings are read from BNB Chain&apos;s
          escrow and reputation contracts. <ProvenanceChip provenance="MEASURED" /> A live quote is one
          the agent signed for Marque. A warrant is a pass on the published MCS case; a failure names the
          field. A <ProvenanceChip provenance="CLAIMED" /> price is the one the agent declares.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
