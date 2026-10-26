import { notFound } from 'next/navigation'
import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { QuestChecker, QuestViewed } from '../QuestIslands'
import { QuestStrip } from '../QuestStrip'
import { QuestBoard } from '../QuestBoard'
import { questProjection, QUEST_ADDRESS } from '../../../lib/quest-api'
import styles from '../quest.module.css'

export const dynamic = 'force-dynamic'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!QUEST_ADDRESS.test(address)) return { title: `Set and Earn · ${BRAND.name}` }
  return {
    title: `Set and Earn progress for ${short(address)} · ${BRAND.name}`,
    description: 'Hires across every shortlisted marketplace and the six build criteria, read from BNB Chain.',
  }
}

/** /quest/{address}: the same page for any wallet, shareable, with its own Open Graph image. */
export default async function QuestAddressPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!QUEST_ADDRESS.test(address)) notFound()
  const p = await questProjection(address).catch(() => null)
  return (
    <>
      <SiteHeader active="quest" />
      <main className={styles.page}>
        <header className={`${styles.head} construct`}>
          <span className="construct-grid" aria-hidden="true" />
          <span className={styles.art} aria-hidden="true"><span className={styles.artImg} /></span>
          <QuestStrip />
          <h1 className="t-display">Set and Earn <em>progress.</em></h1>
          <p className={styles.whoRow}>
            <span className={styles.whoAddr}>{p?.value.address ?? address}</span>
            {p ? <span className={styles.whoMeta}>Read on chain {new Date(p.computedAt).toISOString().slice(11, 16)} UTC{p.stale ? ', refresh delayed' : ''}</span> : null}
          </p>
          <QuestChecker initial={address} />
        </header>
        <QuestViewed />
        {p ? <QuestBoard q={p.value} /> : <p className={styles.loading} role="status">Progress could not be read from chain just now. Try again in a minute.</p>}
      </main>
      <SiteFooter />
    </>
  )
}
