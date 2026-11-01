import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { QuestChecker } from './QuestIslands'
import { QuestStrip } from './QuestStrip'
import { QuestHome } from './QuestHome'
import styles from './quest.module.css'

export const metadata = {
  title: `Set and Earn checker · ${BRAND.name}`,
  description: 'Check any wallet against BNB Chain Set and Earn: hires recorded on BNB Chain\'s ERC-8183 escrow on mainnet and testnet, and the six build criteria. Marketplaces that use their own escrow contracts are not visible here.',
}
export const revalidate = 300

export default function QuestPage() {
  return (
    <>
      <SiteHeader active="quest" />
      <main className={styles.page}>
        <header className={`${styles.head} construct`}>
          <span className="construct-grid" aria-hidden="true" />
          <span className={styles.art} aria-hidden="true"><span className={styles.artImg} /></span>
          <QuestStrip />
          <h1 className="t-display">Set and Earn, <em>checked on chain.</em></h1>
          <p className={styles.lede}>Hires recorded on BNB Chain&apos;s ERC-8183 escrow, on mainnet and testnet, and your build&apos;s six criteria, for any wallet. Marketplaces that use their own escrow contracts are not visible here.</p>
          <QuestChecker />
        </header>
        <QuestHome />
      </main>
      <SiteFooter />
    </>
  )
}
