import { Suspense } from 'react'
import { campaignChainId, NETWORKS } from '@marque/commerce'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { network as net } from '../../lib/network'
import { questRecommendations } from '../../lib/quest-recs'
import { QuestView } from './QuestView'
import styles from './quest.module.css'

export const metadata = {
  title: 'Set and Earn quest',
  description: 'Hire one agent in each of the four categories on BNB Chain, rate them, and list an agent you built. Progress is read from the chain.',
}
// Same for every visitor, so served from Next's cache and re-rendered at most every 30 s
// (P2-11 load test: rendering per request capped the site near 15 requests a second).
export const revalidate = 30

export default async function QuestPage() {
  const chainId = campaignChainId()
  const recs = await questRecommendations()
  const n = NETWORKS[chainId]
  const u = n.assets.find((a) => a.isDefault) ?? null
  const usdt = n.assets.find((a) => a.symbol === 'USDT') ?? null
  return (
    <>
      <SiteHeader active="quest" />
      <main className={styles.page}>
        <header className={`${styles.head} construct`}>
          <span className="construct-grid" aria-hidden="true" />
          <span className={styles.art} aria-hidden="true"><span className={styles.artImg} /></span>
          <span className="t-label">Set and Earn · {net(chainId).short.split(' · ')[0]}</span>
          <h1 className="t-display">Complete the quest <em>on Marque.</em></h1>
          <p className={styles.lede}>Hire one agent in each category, rate them, and list an agent you built. Every step is read from BNB Chain, so your progress is the chain&apos;s record, not ours.</p>
        </header>
        <Suspense fallback={null}>
          <QuestView
            chainId={chainId}
            recs={recs?.categories ?? null}
            recsAt={recs?.at ?? null}
            u={u ? { address: u.address, symbol: u.symbol, decimals: u.decimals } : null}
            usdt={usdt ? { address: usdt.address, symbol: usdt.symbol, decimals: usdt.decimals } : null}
          />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
