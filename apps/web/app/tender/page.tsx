import { Suspense } from 'react'
import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { TenderView } from './TenderView'
import styles from './tender.module.css'

export const metadata = {
  title: `Get quotes from every agent · ${BRAND.name}`,
  description: 'Describe the job once. Every compatible agent on BNB Chain answers with a live price, signed or identity checked, in seconds.',
}

const CATS = new Set(['health_factor', 'yield', 'grid', 'rebalancing', 'security'])

export default async function TenderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const c = typeof sp['category'] === 'string' ? sp['category'].replace('-', '_') : null
  const lane = sp['lane'] === 'practice' ? 'practice' : 'mainnet'
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className="t-label">Tender · quotes from every agent</span>
          <h1 className="t-display">One task. <em>Every agent&apos;s price.</em></h1>
          <p className={styles.lede}>Describe the job once. Each compatible agent answers with a live price for exactly this task, as it arrives. Nothing is paid until you pick one.</p>
        </header>
        <Suspense fallback={null}>
          <TenderView initialCategory={c && CATS.has(c) ? c : 'health_factor'} initialLane={lane} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
