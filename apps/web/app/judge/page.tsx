import Link from 'next/link'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { JudgeFlow } from './JudgeFlow'
import styles from './judge.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Judge mode — the whole product in ninety seconds',
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
            The whole product, one click per step: an intent, three ranked agents with the reason
            for each, a capped and revocable charter written on chain, a real run against a live
            agent, its public receipt, and the revocation. Pre-filled, so the ninety seconds go on
            watching rather than typing.
          </p>
          <p className={styles.note}>
            Everything is real and nothing is a recording. The charter and the revocation are
            transactions on BNB Smart Chain testnet, and each one links to BscScan.{' '}
            <Link href="/status">Check what is live first</Link> if anything here stalls.
          </p>
        </header>

        <JudgeFlow demoAddress={DEMO} />
      </main>
      <SiteFooter />
    </>
  )
}
