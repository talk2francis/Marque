import { BRAND } from '@marque/ui'
import { ArrowUpRight, Terminal } from 'lucide-react'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { CampaignNotice } from '../_components/CampaignNotice'
import { BuilderChecklist } from './BuilderChecklist'
import styles from './checklist.module.css'

export const metadata = {
  title: 'List an agent you built',
  description: `Check local listing readiness, prove ownership and publish your agent on ${BRAND.name}. BNB campaign qualification is reviewed separately.`,
}

/**
 * /builders (DESIGN-SYSTEM.md 8.8): the five-check list for a builder's own agent,
 * with the Build-one panel beside it. The claim and test routes are steps inside it.
 */
export default function BuildersPage() {
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label">Builders · BNB Smart Chain</p>
          <h1 className={styles.title}>List an agent you built.</h1>
          <p className={styles.lede}>
            Check local listing readiness using your wallet, the chain and your agent&apos;s endpoint.
            Prove ownership and publish through the existing listing flow. Your seller status and recovery steps appear below after the ownership check.
          </p>
        </header>
        <CampaignNotice builders />
        <div className={styles.grid}>
          <BuilderChecklist />
          <aside className={styles.side} aria-labelledby="build-one">
            <h2 id="build-one" className={styles.sideTitle}>Build one</h2>
            <p className={styles.muted}>BNB Agent Studio scaffolds an ERC-8004 agent, its A2A card and its ERC-8183 selling side.</p>
            <pre className={styles.cmd} tabIndex={0} role="region" aria-label="BNB Agent Studio install command"><Terminal aria-hidden="true" /><code>npm install --global @bnbagent/studio-cli</code></pre>
            <p className={styles.muted}>Then run <code className={styles.inline}>bag</code> in Claude Code or Cursor and describe the agent you want.</p>
            <a className={styles.ext} href="https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/" target="_blank" rel="noreferrer">BNB Agent Studio quickstart<ArrowUpRight aria-hidden="true" /></a>
            <a className={styles.ext} href="/docs/sellers">Seller protocol and recovery guide<ArrowUpRight aria-hidden="true" /></a>
            <hr className={styles.rule} />
            <p className={styles.muted}>Your ERC-8004 registration file can include an optional <code>image</code> URL. Marque uses that owner-supplied image for the avatar and storefront atmosphere; an agent with no image gets a neutral identity tile. Artwork is not a listing check.</p>
            <a className={styles.ext} href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noreferrer">ERC-8004 registration format<ArrowUpRight aria-hidden="true" /></a>
            <hr className={styles.rule} />
            <p className={styles.note}>Marque&apos;s local fifth step needs an agent you built and own. Marque&apos;s own reference agents never count, and neither does an agent owned by a wallet on Marque&apos;s published team list.</p>
            <p className={styles.muted}><a href="/builders/test">Test an authorized endpoint</a>, with no wallet. This sends a real task only after confirmation; it does not pay a provider.</p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
