import { Statement, EmptyState } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { NetworkBadge } from '../../_components/NetworkBadge'
import { PolicyPreview } from './PolicyPreview'
import { TEMPLATES, CATEGORY_ORDER, isCharterCategory } from '../../../lib/charter-templates'
import styles from './charter.module.css'

export const dynamic = 'force-dynamic'
const LABEL = { rebalancing: 'Rebalancing', grid: 'Grid trading', yield: 'Yield optimisation', health_factor: 'Health factor' }

export default async function CharterDeskPage({ searchParams }: {
  searchParams: Promise<{ category?: string; agent?: string }>
}) {
  const params = await searchParams
  const invalid = params.category !== undefined && !isCharterCategory(params.category)
  const category = params.category && isCharterCategory(params.category) ? params.category : 'rebalancing'
  const selected = params.agent?.slice(0, 200) ?? null
  return <>
    <SiteHeader active="charters" />
    <main className={styles.page}>
      <header className={styles.head}>
        <Statement as="h1">Policy preview</Statement>
        <p className={styles.lede}>Review proposed limits without connecting a wallet. New grants and execution are unavailable while buyer-owned onchain enforcement remains unverified.</p>
      </header>
      <nav className={styles.tabs} aria-label="Charter category">{CATEGORY_ORDER.map(key =>
        <a key={key} className={styles.tab} href={`/app/charter?category=${key}${selected ? `&agent=${encodeURIComponent(selected)}` : ''}`} aria-current={key === category ? 'page' : undefined}>{LABEL[key]}</a>
      )}</nav>
      {selected && <p className={styles.note} style={{ overflowWrap: 'anywhere' }}>Selected agent: {selected}. Ownership, service and task support have not been checked here. No other agent has been substituted.</p>}
      {invalid ? <EmptyState title="This policy category is not supported."><p>Choose one of the four published categories above.</p></EmptyState>
        : <PolicyPreview key={category} template={TEMPLATES[category]} />}
      <section className={styles.footnote}>
        <NetworkBadge chainId={97} />
        <p>These historical operation templates refer to BNB Smart Chain testnet. A recorded policy hash does not enforce asset permissions. Service-fee escrow does not authorize an agent to move your assets.</p>
        <p><a href="/register">Browse agents and existing wallet-owned hires</a></p>
        <p><a href="/app/charters">Inspect historical policy records</a></p>
      </section>
    </main>
    <SiteFooter />
  </>
}
