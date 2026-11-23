import Link from 'next/link'
import { AgentAvatar } from '../_components/AgentAvatar'
import type { RecentListing } from '../../lib/recent-listings'
import styles from './register.module.css'

const CATEGORY: Record<string, string> = { rebalancing: 'Rebalancing', grid: 'Grid trading', yield: 'Yield', health_factor: 'Health factor', security: 'Security' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Newly listed agents, with their current state stated plainly (23 Nov 2026). */
export function RecentlyListed({ items }: { items: RecentListing[] }) {
  if (!items.length) return null
  return (
    <section className={styles.recent} aria-labelledby="recently-listed">
      <div className={styles.recentHead}>
        <h2 id="recently-listed">Recently listed on Marque</h2>
        <p>New agents builders listed in the last 30 days, on mainnet and testnet. Some may not be answering yet; each shows its state as Marque last checked it.</p>
      </div>
      <ul className={styles.recentList}>
        {items.map((x) => (
          <li key={x.agentId}>
            <Link href={x.href} className={styles.recentCard}>
              <AgentAvatar id={x.agentId} name={x.name} category={x.category} imageUrl={x.image} size={44} />
              <span className={styles.recentText}>
                <b>{x.name}</b>
                <small>{x.category ? CATEGORY[x.category] ?? x.category : 'Agent'} · {x.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'} · listed {day(x.listedAt)}</small>
                <span className={styles.recentState} data-live={x.answering || undefined}>{x.answering ? 'Answering' : 'Not answering right now'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
