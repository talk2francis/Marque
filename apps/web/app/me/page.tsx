import { Suspense } from 'react'
import { campaignChainId } from '@marque/commerce'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { MyMarque } from './MyMarque'
import styles from './me.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'My Marque',
  description: 'Your hires, quest progress, spending controls, ratings and agents, read from BNB Chain. Connect a wallet, or pass ?addr= for any address. Nothing is stored.',
}

/**
 * My Marque (DESIGN-SYSTEM.md 8.7). Connected, the buyer's own dashboard; with ?addr=
 * any address, shareable and wallet-free. A projection of chain records keyed by the
 * address: no account, no stored profile, no PII.
 */
export default async function MePage({ searchParams }: { searchParams: Promise<{ addr?: string }> }) {
  const { addr } = await searchParams
  const addrParam = addr && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : null
  return (
    <>
      <SiteHeader active="me" />
      <main className={styles.page}>
        <Suspense fallback={null}><MyMarque addrParam={addrParam} chainId={campaignChainId()} /></Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
