import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { Gallery } from './Gallery'
import styles from './ui.module.css'

export const metadata = { title: 'Design system', robots: { index: false } }

/**
 * The component set of DESIGN-SYSTEM.md section 6, each with its states.
 * Fixtures, not live data: values are copied from real reads and real mainnet
 * jobs (the P2-05 smoke hires) so the components are exercised at true
 * magnitudes, but nothing here is fetched and nothing here is a product surface.
 */
export default function UiPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={`${styles.header} construct`}>
          <span className="construct-grid" aria-hidden="true" />
          <span className="t-label">Design system · Kerbstone for Marque</span>
          <h1 className="t-display">The components, <em>with every state.</em></h1>
          <p className={styles.lede}>
            Fixtures, not live data. Values come from real reads and the mainnet smoke hires of 26 Sep, so every
            component is shown at true magnitudes. Switch the theme in the header to check Night, Day and System.
          </p>
        </header>
        <Gallery />
      </main>
      <SiteFooter />
    </>
  )
}
