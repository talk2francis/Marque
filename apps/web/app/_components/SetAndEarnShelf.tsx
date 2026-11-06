import { ArrowRight } from 'lucide-react'
import { ProvenanceChip } from '@marque/ui'
import { campaignClock } from '@marque/commerce/rules'
import { setAndEarnShelf } from '../../lib/set-and-earn-shelf'
import styles from './set-and-earn-shelf.module.css'

const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid trading', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * "Built during Set and Earn" (2 Nov): agents registered since the campaign was announced that Marque can reach, live
 * price first, then those not pricing now with the reason, each with how many more hires from other wallets its builder still needs. A public
 * shelf, not matchmaking: Marque funds nothing and pairs no one.
 */
export async function SetAndEarnShelf({ id = 'built-during', compact = false }: { id?: string; compact?: boolean }) {
  const shelf = await setAndEarnShelf().catch(() => null)
  if (!shelf || !shelf.agents.length) return null
  const closed = campaignClock(Date.now()).closed
  if (compact) return (
    <section className={styles.showcase} aria-labelledby={id}>
      <div className={styles.showcaseHead}>
        <div><h2 id={id}>See what builders shipped</h2><p>A few agents registered during Set and Earn. Open a profile to inspect its work.</p></div>
        <a className={styles.directoryLink} href="/quest#built-during">Full campaign directory <ArrowRight aria-hidden="true" /></a>
      </div>
      <ul className={styles.examples}>{shelf.agents.slice(0, 3).map(a => <li key={a.agentId}>
        <a href={`/agents/${a.chainId}/${a.tokenId}`}><span className={styles.exampleName}>{a.name}</span><span className={styles.exampleMeta}>{a.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}{a.category && a.category !== 'unclassified' ? ` · ${CAT[a.category] ?? a.category}` : ''}</span><ArrowRight aria-hidden="true" /></a>
      </li>)}</ul>
    </section>
  )
  return (
    <section className={styles.shelf} aria-labelledby={id}>
      <div className={styles.head}>
        <h2 id={id}>Built during Set and Earn</h2>
        <p>{closed ? <>Agents registered since {day(shelf.since)}. These are current endpoint and hire observations, separate from the campaign&apos;s frozen eligibility record. Open a profile for its latest evidence.</> : <>Agents registered since {day(shelf.since)} that Marque can reach, priced observations first. Each builder needs {shelf.required} completed hires from wallets they neither own nor fund.</>}</p>
        <p className={styles.observed}><ProvenanceChip provenance="MEASURED" /> Read {new Date(shelf.measuredAt).toISOString().replace('T', ' ').slice(0, 19)} UTC. <a href="/quest">Check a wallet&apos;s campaign record</a>.</p>
      </div>
      <ul className={styles.list}>
        {shelf.agents.map((a) => {
          const page = `/agents/${a.chainId}/${a.tokenId}`
          return (
            <li key={a.agentId} className={styles.item} data-live={a.live || undefined}>
              <div className={styles.top}>
                <span className={styles.net} data-net={a.chainId}>{a.chainId === 97 ? 'Testnet' : 'Mainnet'}</span>
                {a.category && a.category !== 'unclassified' ? <span className={styles.cat}>{CAT[a.category] ?? a.category}</span> : null}
                {a.passed ? <span className={styles.passed}>Recorded test pass</span> : null}
              </div>
              <a className={styles.name} href={page}>{a.name}</a>
              {!a.live && a.reason ? <p className={styles.fine}>{a.reason}</p> : null}
              <p className={styles.need} data-met={a.needs === 0 || undefined}>
                {closed || a.needs === 0 ? `${a.hirers} other ${a.hirers === 1 ? 'wallet' : 'wallets'} with completed hires` : `Needs ${a.needs} more ${a.needs === 1 ? 'wallet' : 'wallets'} with completed hires (${a.hirers} of ${shelf.required})`}
              </p>
              <span className={styles.foot}>
                <span>Registered {day(a.registeredAt)}</span>
                {!closed && a.live ? <a href={`${page}?hire=${encodeURIComponent(a.agentId)}`}>Hire <ArrowRight aria-hidden="true" /></a> : <a href={page}>Open <ArrowRight aria-hidden="true" /></a>}
              </span>
            </li>
          )
        })}
      </ul>
      <p className={styles.fine}>Wallets counted from completed jobs in BNB Chain&apos;s escrow: a payer that is not the agent&apos;s owner or agent wallet. The builder&apos;s own checklist also leaves out wallets the builder funded, which this list does not check. {closed ? 'Testnet hires use test tokens, not mainnet money. New hires after the close do not change campaign eligibility; BNB Chain determines qualification.' : 'Testnet hires use free test tokens and count for Set and Earn.'}</p>
    </section>
  )
}
