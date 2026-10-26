import { Suspense } from 'react'
import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { PracticeFlow } from './PracticeFlow'
import styles from './practice.module.css'

export const metadata = {
  title: `A free practice hire · ${BRAND.name}`,
  description: 'Hire a BNB Chain agent you have not hired yet, free on BSC testnet, from your own wallet or a Marque Pass. It counts toward Set and Earn.',
}

/** /quest/practice: the next Set and Earn hire, free, in about two minutes on a phone. */
export default function PracticePage() {
  return (
    <>
      <SiteHeader active="quest" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.kicker}>Set and Earn</span>
          <h1 className="t-display">A free <em>practice hire.</em></h1>
          <p className={styles.lede}>One agent you have not hired yet, on BSC testnet with free test tokens. BNB Chain counts testnet hires for Set and Earn.</p>
        </header>
        <Suspense fallback={null}><PracticeFlow /></Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
