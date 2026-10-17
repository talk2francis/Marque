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
            Historical policy records on {CHARTER_CHAIN_NAME}. Limits and usage are server records;
            policy hashes do not enforce permissions over your wallet. Existing revocation controls remain available. This page shows up to 40 returned records, not the total population.
          </p>
          <p className={styles.headAct}>
            <LinkButton variant="primary" href="/app/charter">Preview a policy</LinkButton>
          </p>
        </header>

        <section aria-labelledby="live-heading">
          <h2 className={styles.sectionHead} id="live-heading">
            Unexpired records {live.length > 0 && <span className={`mono ${styles.count}`}>{live.length}</span>}
          </h2>
          {live.length === 0 ? (
            <EmptyState title="No unexpired policy records returned.">
              <p>
                No active policy record was returned. This does not inspect wallet approvals or other onchain permissions.
              </p>
              <p><LinkButton variant="primary" href="/app/charter">Preview a policy</LinkButton></p>
            </EmptyState>
          ) : (
            <div className={styles.cards}>
              {live.map((c) => (
                <CharterCard key={c.id} charter={c} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section aria-labelledby="past-heading" className={styles.past}>
            <h2 className={styles.sectionHead} id="past-heading">
              Ended records <span className={`mono ${styles.count}`}>{past.length}</span>
            </h2>
            <p className={styles.lede}>
              Expiry is derived from the stored lifetime. A revocation anchor is shown when recorded;
              expiry does not require a transaction. Three returned records are shown first; expand for the rest.
            </p>
            <div className={styles.cards}>
              {past.slice(0, 3).map((c) => (
                <CharterCard key={c.id} charter={c} />
              ))}
            </div>
            {past.length > 3 && (
              <details className={styles.history}>
                <summary className={styles.historySummary}>
                  History <span className={`mono ${styles.count}`}>{past.length - 3}</span> more
                </summary>
                <div className={styles.cards}>
                  {past.slice(3).map((c) => (
                    <CharterCard key={c.id} charter={c} />
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
