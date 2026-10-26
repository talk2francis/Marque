import { notFound } from 'next/navigation'
import { BRAND } from '@marque/ui'
import { campaignClock } from '@marque/commerce/rules'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import { questProjection } from '../../../../lib/quest-api'
import { unsealAddress } from '../../../../lib/share-token'
import styles from '../../quest.module.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: `Set and Earn progress · ${BRAND.name}`,
  description: 'Hires, marketplaces and build criteria for BNB Chain Set and Earn, read from chain. Check your own wallet on Marque.',
  robots: { index: false },
}

/**
 * /quest/s/{token}: progress shared without the address. Only the three counts and the read time are shown: no hire
 * table and no transaction links, since either would lead back to the wallet.
 */
export default async function PrivateProgress({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const address = unsealAddress(token)
  if (!address) notFound()
  const p = await questProjection(address).catch(() => null)
  const q = p?.value ?? null
  const clock = campaignClock(Date.now())
  const stats = q ? [
    { label: 'Hires of different agents', value: Math.min(q.hire.distinctAgents, 3), of: 3 },
    { label: 'Shortlisted marketplaces', value: Math.min(q.hire.marketplaces.named.length, 2), of: 2 },
    { label: 'Build criteria', value: q.build.agents[0]?.observed ?? 0, of: 6 },
  ] : []
  return (
    <>
      <SiteHeader active="quest" />
      <main className={styles.page}>
        <header className={`${styles.head} construct`}>
          <span className="construct-grid" aria-hidden="true" />
          <h1 className="t-display">Set and Earn <em>progress.</em></h1>
          <p className={styles.whoRow}><span className={styles.whoMeta}>Shared without the wallet address{p ? `. Read on chain ${new Date(p.computedAt).toISOString().slice(11, 16)} UTC` : ''}{clock.closed ? '. Set and Earn has closed.' : `. ${clock.days} day${clock.days === 1 ? '' : 's'} left.`}</span></p>
        </header>
        {q ? (
          <div className={styles.shared}>
            {q.excluded.team ? <p className={styles.excluded} role="note">A published Marque team wallet: shown, never counted.</p> : null}
            <dl className={styles.sharedStats}>
              {stats.map((s) => (
                <div key={s.label} data-met={(s.value >= s.of && !q.excluded.team) || undefined}>
                  <dt>{s.label}</dt>
                  <dd><b>{s.value}</b> of {s.of}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.sharedActions}>
              <a className="btn btn--primary" href="/quest">Check your own wallet</a>
              <a className="btn" href="/quest/practice">Start a free practice hire</a>
            </div>
          </div>
        ) : <p className={styles.loading} role="status">Progress could not be read from chain just now. Try again in a minute.</p>}
      </main>
      <SiteFooter />
    </>
  )
}
