import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { MyMarque } from './MyMarque'
import styles from './me.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'My Marque',
  description:
    'Connect a wallet to read your live positions and see the agents warranted to act on them, in one place. Nothing is signed until you grant a charter.',
}

/**
 * "My Marque" — the one place a connected buyer sees their own positions and
 * what they can do about them. Deliberately thin: it reads the connected
 * address from chain (exactly what /positions does for a pasted address) and
 * points at the warranted agents for the position types actually held. No
 * account, no stored profile, no PII — the wallet is the identity.
 */
export default function MePage() {
  return (
    <>
      <SiteHeader active="me" />
      <main className={styles.page}>
        <MyMarque />
      </main>
      <SiteFooter />
    </>
  )
}
