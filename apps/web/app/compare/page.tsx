import Link from 'next/link'
import { Statement, EmptyState, Limits } from '@marque/ui'
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
    'Agents side by side on the things that decide a hire: what it does, whether you can hire it now, whether it passed the standard, its funded jobs on chain, buyer-linked reviews, whether you can try it free, its identity, and what it costs.',
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
            The same questions for each agent, in the order that decides a hire. Green marks the
            strongest value in a row.
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

        <Limits className={styles.note}>
          <ul>
            <li>Funding, jobs delivered and ratings are read from BNB Chain&apos;s escrow and reputation contracts. Ratings count only buyers linked to an exact paid, delivered job; reviews do not establish independent people.</li>
            <li>A price is a quote from the agent, signed or identity checked, with its own expiry; a price the agent only declares is marked as declared.</li>
            <li>Passing {"Marque's"} test means every checked answer matched the published case; a miss names the field.</li>
            <li>Best marks compare like with like: prices only in the same token and network, times only from paid jobs.</li>
          </ul>
        </Limits>
      </main>
      <SiteFooter />
    </>
  )
}
