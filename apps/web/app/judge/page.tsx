import Link from 'next/link'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { JudgeFlow } from './JudgeFlow'
import styles from './judge.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Judge mode: review the product evidence',
  description:
    'Intent to ranked agents to a capped charter to a real run to a public receipt to revocation, pre-filled, one click per step, on BNB Smart Chain testnet.',
}

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

/**
 * Judge mode.
 *
 * Everything here is real: the ranking comes from measured conformance and
 * probe results, the charter is a transaction on BNB Smart Chain testnet, the
 * run calls a live agent endpoint, and the revoke is another transaction. There
 * is no scripted path and no recorded demo — if the chain is slow, this page is
 * slow, and it says so rather than pretending.
 *
 * It is pre-filled because a judge should spend their ninety seconds watching
 * the mechanism, not typing an address.
 */
export default function JudgePage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Judge mode</Statement>
          <p className={styles.lede}>
            Inspect a position and recorded agent evidence without a wallet. The legacy grant/run
            sequence now stops at a read-only policy preview while buyer-owned onchain authority
            remains unverified.
          </p>
          <p className={styles.note}>
            No charter transaction is sent by this walkthrough. Use the <Link href="/register">marketplace</Link> for
            existing wallet-owned hires and <Link href="/app/charters">historical policy records</Link> for their controls.{' '}
            <Link href="/status">Check current service status</Link>.
          </p>
          <p className={styles.note}>
            The <Link href="/standard">live Standard</Link> records conformance runs as they happen.
          </p>
        </header>

        <JudgeFlow demoAddress={DEMO} />
      </main>
      <SiteFooter />
    </>
  )
}
