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
    'Read a public BSC position, inspect dated agent evidence, preview limits and open preserved job and receipt records without a wallet.',
}

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

/** Read-only product review; historical proof links are explicitly separate. */
export default function JudgePage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Judge mode</Statement>
          <p className={styles.lede}>
            Inspect a position and recorded agent evidence without a wallet. Review a read-only policy preview while buyer-owned action authority remains unverified.
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
