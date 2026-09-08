import { Statement, EmptyState, LinkButton } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { listCharters, CHARTER_CHAIN_NAME } from '../../../lib/charters'
import { CharterCard } from './CharterCard'
import styles from './charters.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Every charter Marque has granted, live ones first.
 *
 * Dead charters stay on this page. A marketplace that hides the authority it
 * has already ended is asking to be trusted about the part that matters most,
 * and publishing the whole history — granted, spent, expired, revoked — is the
 * cheapest credibility available (AGENTS.md invariant 7).
 */

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
const DEMO_LP = process.env['NEXT_PUBLIC_DEMO_LP_ADDRESS'] ?? DEMO

export default async function ChartersPage() {
  const charters = await listCharters().catch(() => [])
  const live = charters.filter((c) => c.status === 'active')
  const past = charters.filter((c) => c.status !== 'active')

  return (
    <>
      <SiteHeader active="charters" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Charters</Statement>
          <p className={styles.lede}>
            Every charter Marque has granted, on {CHARTER_CHAIN_NAME}. What each agent may touch,
            what is left of its cap, how long it has, and a button that ends it now.
          </p>
          <p className={styles.headAct}>
            <LinkButton variant="primary" href="/app/charter">Grant a charter</LinkButton>
          </p>
        </header>

        <section aria-labelledby="live-heading">
          <h2 className={styles.sectionHead} id="live-heading">
            Active {live.length > 0 && <span className={`mono ${styles.count}`}>{live.length}</span>}
          </h2>
          {live.length === 0 ? (
            <EmptyState title="No charter is active.">
              <p>
                Nothing currently holds authority over anything. That is the resting state, and it
                is the one the product should spend most of its time in.
              </p>
              <p><LinkButton variant="primary" href="/app/charter">Grant a charter</LinkButton></p>
            </EmptyState>
          ) : (
            <div className={styles.cards}>
              {live.map((c) => (
                <CharterCard key={c.id} charter={c} subject={c.category === 'rebalancing' || c.category === 'grid' ? DEMO_LP : DEMO} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section aria-labelledby="past-heading" className={styles.past}>
            <h2 className={styles.sectionHead} id="past-heading">
              Ended <span className={`mono ${styles.count}`}>{past.length}</span>
            </h2>
            <p className={styles.lede}>
              Kept, because a revocation nobody can check is not a revocation. Each of these has the
              transaction that ended it. The three most recent are shown; the rest are one click away.
            </p>
            <div className={styles.cards}>
              {past.slice(0, 3).map((c) => (
                <CharterCard key={c.id} charter={c} subject={DEMO} />
              ))}
            </div>
            {past.length > 3 && (
              <details className={styles.history}>
                <summary className={styles.historySummary}>
                  History <span className={`mono ${styles.count}`}>{past.length - 3}</span> more
                </summary>
                <div className={styles.cards}>
                  {past.slice(3).map((c) => (
                    <CharterCard key={c.id} charter={c} subject={DEMO} />
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
