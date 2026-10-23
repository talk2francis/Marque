import { BRAND } from '@marque/ui'
import { ArrowUpRight, Terminal } from 'lucide-react'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { BuilderChecklist } from '../BuilderChecklist'
import { CardCheck } from '../CardCheck'
import { ForgeRail } from '../ForgeRail'
import styles from '../checklist.module.css'
import forge from '../forge.module.css'

export const metadata = {
  title: 'Check and list an agent you run',
  description: `Check your agent card, prove ownership and list your agent on ${BRAND.name}. Every failure comes with the exact fix.`,
}

/** Door 1 (SPEC-BUILDERS 3): an agent that already runs. Card first, then the listing checks. */
export default function RunPage() {
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label"><a href="/builders">Agent Forge</a> · I already run an agent</p>
          <h1 className={styles.title}>Check it and list it.</h1>
          <p className={styles.lede}>Start with the card buyers&apos; clients read. Then the checks below read your wallet, the chain and your endpoint, and list the agent when they pass.</p>
        </header>
        <ForgeRail at="check" />
        <section className={forge.section} aria-labelledby="card">
          <h2 id="card">Agent card</h2>
          <CardCheck compact />
        </section>
        <div className={styles.grid} id="listed">
          <BuilderChecklist />
          <aside className={styles.side} aria-labelledby="build-one">
            <h2 id="build-one" className={styles.sideTitle}>No agent yet?</h2>
            <p className={styles.muted}>The <a href="/builders/start">Forge starter</a> gives you the card, task schema, chain reads and tests for one category. BNB Agent Studio scaffolds the selling side.</p>
            <pre className={styles.cmd} tabIndex={0} role="region" aria-label="BNB Agent Studio install command"><Terminal aria-hidden="true" /><code>npm install --global @bnbagent/studio-cli</code></pre>
            <a className={styles.ext} href="https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/" target="_blank" rel="noreferrer">BNB Agent Studio quickstart<ArrowUpRight aria-hidden="true" /></a>
            <a className={styles.ext} href="/docs/sellers">Seller protocol and recovery guide<ArrowUpRight aria-hidden="true" /></a>
            <hr className={styles.rule} />
            <p className={styles.note}>Marque&apos;s own reference agents never count, and neither does an agent owned by a wallet on Marque&apos;s published team list.</p>
            <p className={styles.muted}><a href="/builders/test">Test an endpoint against the Standard</a>, with no wallet.</p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
