import Link from 'next/link'
import { Statement, Chip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { PancakeDesk } from './PancakeDesk'
import { GUARDRAILS } from './guardrails'
import styles from './pancake.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'The PancakeSwap Desk — every V3 position, and what it is costing you',
  description:
    'Live PancakeSwap V3 positions with measured hours out of range, uncollected fees, and the agents that can re-centre them under a capped, revocable charter.',
}

/**
 * The Desk's default address needs a LIVE V3 POSITION, which the general
 * DEMO_ADDRESS does not have — it holds Venus and spot, and landing a judge on
 * "no liquidity at this address" makes the flagship page look broken. This one
 * is a real BSC liquidity provider holding a BTCB/USDC position; nothing here
 * writes, so reading a third party's position is exactly what the page is for.
 */
const DEMO = process.env['PANCAKE_DEMO_ADDRESS'] ?? '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD'

/**
 * The PancakeSwap Desk.
 *
 * The hero is a position and what it is costing. Wallet connection is never
 * required — pasting an address, or using the demo one, reaches every part of
 * this page except the final signature (invariant 2).
 */
export default function PancakeSwapPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">The PancakeSwap Desk</Statement>
          <p className={styles.lede}>
            Every V3 position at an address, where its price sits inside its range, what it has
            earned but not collected, and — the number that actually costs money — how long it has
            been out of range earning nothing.
          </p>
          <p className={styles.note}>
            No wallet needed to look. Paste any address, or use the demo one.
          </p>
        </header>

        <PancakeDesk demoAddress={DEMO} />

        <section className={styles.section}>
          <h2 className={styles.h2}>The guardrails, stated rather than assumed</h2>
          <p className={styles.note}>
            Read from{' '}
            <a
              href="https://docs.pancakeswap.finance/trading-tools/building-trading-agents-on-pancakeswap-v3"
              rel="noreferrer noopener"
              target="_blank"
            >
              PancakeSwap&rsquo;s own guide for building V3 trading agents
            </a>{' '}
            and enforced on every execution. Where a rule is ours rather than theirs, it says so —
            attributing our own choices to their guide would misrepresent it.
          </p>
          <div className={styles.guardrails}>
            {GUARDRAILS.map((g) => (
              <div className={styles.guardrail} key={g.name}>
                <div className={styles.positionHead}>
                  <span className={styles.guardrailName}>{g.name}</span>
                  <Chip tone={g.source === 'PancakeSwap guide' ? 'chain' : 'neutral'}>{g.source}</Chip>
                </div>
                <span className={styles.guardrailValue}>{g.value}</span>
                <span className={styles.guardrailWhy}>{g.why}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>How &ldquo;hours out of range&rdquo; is measured</h2>
          <p className={styles.warn}>
            There is no public source for it on BSC. Pool state prunes after about 64 blocks, the
            official PancakeSwap V3 subgraph is roughly four months behind head, and public log
            queries reach back around 37 minutes. So we watch: a worker records each pool&rsquo;s
            tick every two minutes, and the figure is measured from our own observations.
          </p>
          <p className={styles.note}>
            That means it starts when we start watching. A position we have only just seen shows
            how long we have been watching it, not a number we invented for the time before that.
            The method and the measurements behind it are in{' '}
            <Link href="/ledger/methodology">the Ledger methodology</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
