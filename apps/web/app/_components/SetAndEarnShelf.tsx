import { ArrowRight } from 'lucide-react'
import { setAndEarnShelf } from '../../lib/set-and-earn-shelf'
import styles from './set-and-earn-shelf.module.css'

const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid trading', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * "Built during Set and Earn" (2 Nov): agents registered since the campaign was announced, listed on Marque with a
 * live price in the last 24 hours, each with how many more hires from other wallets its builder still needs. A public
 * shelf, not matchmaking: Marque funds nothing and pairs no one.
 */
export async function SetAndEarnShelf({ id = 'built-during' }: { id?: string }) {
  const shelf = await setAndEarnShelf().catch(() => null)
  if (!shelf || !shelf.agents.length) return null
  return (
    <section className={styles.shelf} aria-labelledby={id}>
      <div className={styles.head}>
        <h2 id={id}>Built during Set and Earn</h2>
        <p>Agents registered since {day(shelf.since)} and listed on Marque with a live price in the last 24 hours, newest first. Each builder needs {shelf.required} completed hires from wallets they neither own nor fund; hire with your own wallet, at your own cost.</p>
      </div>
      <ul className={styles.list}>
        {shelf.agents.map((a) => {
          const page = `/agents/${a.chainId}/${a.tokenId}`
          return (
            <li key={a.agentId} className={styles.item}>
              <div className={styles.top}>
                <span className={styles.net} data-net={a.chainId}>{a.chainId === 97 ? 'Testnet' : 'Mainnet'}</span>
                {a.category && a.category !== 'unclassified' ? <span className={styles.cat}>{CAT[a.category] ?? a.category}</span> : null}
                {a.passed ? <span className={styles.passed}>Passed its test</span> : null}
              </div>
              <a className={styles.name} href={page}>{a.name}</a>
              <p className={styles.need} data-met={a.needs === 0 || undefined}>
                {a.needs === 0 ? `${a.hirers} completed hires from other wallets` : `Needs ${a.needs} more ${a.needs === 1 ? 'hire' : 'hires'} from other wallets (${a.hirers} of ${shelf.required})`}
              </p>
              <span className={styles.foot}>
                <span>Registered {day(a.registeredAt)}</span>
                <a href={`${page}?hire=${encodeURIComponent(a.agentId)}`}>Hire <ArrowRight aria-hidden="true" /></a>
              </span>
            </li>
          )
        })}
      </ul>
      <p className={styles.fine}>Hires counted from BNB Chain&apos;s escrow: completed jobs paid by a wallet that is not the agent&apos;s owner or agent wallet. The builder&apos;s own checklist also leaves out wallets the builder funded, which this list does not check. Testnet hires use free test tokens and count for Set and Earn.</p>
    </section>
  )
}
