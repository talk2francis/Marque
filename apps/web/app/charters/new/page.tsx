import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { isAddress } from 'viem'
import { CHARTER_CHAINS, isCharterChain, type CharterChainId } from '@marque/charters'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { chartersVisible, PREVIEW_COOKIE } from '../../../lib/charters-access'
import { Builder } from '../_components/Builder'
import styles from '../charters.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Guard a loan',
  description: 'Draw a line under your Venus loan. If the chain shows it crossing, an agent repays from your own wallet, into your own loan, never past the budget you set.',
  robots: { index: false },
}

/** The demo loans for reading without a wallet (AGENTS.md invariant 2): mainnet's demo address; the testnet canary owner. */
const DEMO: Record<CharterChainId, string> = {
  56: process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf',
  97: process.env['CHARTERS_DEMO_97'] ?? '0x0cC5DB909cEcE1856d1896d633d32Bd305ce26c2',
}

/** /charters/new?chain=56&account=0x..&market=vUSDT (03_EXPERIENCE section 2). Behind CHARTERS_PUBLIC until launch. */
export default async function NewCharterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const asked = Number(one('chain'))
  // Mainnet by default once its factory exists; until then the network where a charter can be granted.
  const chain: CharterChainId = isCharterChain(asked) ? asked : CHARTER_CHAINS[56].factory ? 56 : 97
  const account = one('account')
  const market = one('market')
  return (
    <>
      <SiteHeader />
      <main id="main" className={styles.page}>
        <header className={styles.head}>
          <div>
            <span className={styles.eyebrow}>Loan Guard</span>
            <h1 className={styles.title}>Draw the line. <em>We&apos;ll hold it.</em></h1>
          </div>
          <p className={styles.lede}>Drag the two marks. Everything else on this page follows them, in plain words and in prices. Nothing is signed until you seal the charter.</p>
        </header>
        <Builder initialChain={chain} initialAccount={account && isAddress(account) ? account : null} initialMarket={market && /^[\w]{2,12}$|^0x[0-9a-fA-F]{40}$/.test(market) ? market : null} demo={DEMO} />
      </main>
      <SiteFooter slim />
    </>
  )
}
