import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { Profile } from './Profile'
import styles from './me.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'My Marque',
  description:
    'One place for an address: live positions, every charter granted, every agent hired and the receipt it left, and the recommendations sealed before their outcome. Connect a wallet, or pass ?addr= for any address. Nothing is stored.',
}

/**
 * "My Marque" — the profile.
 *
 * Connected, it is the buyer's own dashboard. With ?addr= it is any address,
 * shareable and wallet-free, exactly like /positions. Either way it is a
 * projection of records already keyed by that address plus a live chain read —
 * no account, no stored profile, no PII. The wallet is the identity.
 */
export default async function MePage({ searchParams }: { searchParams: Promise<{ addr?: string }> }) {
  const { addr } = await searchParams
  const addrParam = addr && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null

  return (
    <>
      <SiteHeader active="me" />
      <main className={styles.page}>
        <Profile addrParam={addrParam} />
      </main>
      <SiteFooter />
    </>
  )
}
