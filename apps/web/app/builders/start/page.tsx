import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { ForgeRail } from '../ForgeRail'
import { StartForm } from './StartForm'
import styles from '../forge.module.css'

export const metadata = {
  title: 'Start an agent from a Forge starter',
  description: 'A category starter: card, task schema, chain reads, the Standard’s tests and deploy notes. You write the strategy.',
}

/** Door 3 (SPEC-BUILDERS 6). */
export default function StartPage() {
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label"><a href="/builders">Agent Forge</a> · Start from a starter</p>
          <h1 className={styles.title}>Start from a starter.</h1>
          <p className={styles.lede}>Everything around the agent&apos;s judgement, generated for your category. You write one function; the Standard&apos;s tests tell you when it is right.</p>
        </header>
        <ForgeRail at="scaffold" />
        <StartForm />
        <section className={styles.section} id="strategy" aria-labelledby="s2">
          <h2 id="s2">Write the strategy</h2>
          <p className={styles.fine}>Open <code>src/strategy.ts</code>. <code>BUILD_WITH_AI.md</code> is a prompt for Claude Code or Codex with the protocol, the task schema and every assertion and tolerance. Run <code>pnpm test:mcs</code> until every assertion passes.</p>
        </section>
        <section className={styles.section} id="host" aria-labelledby="s3">
          <h2 id="s3">Host it</h2>
          <p className={styles.fine}><code>DEPLOY.md</code> covers BNB Agent Studio with NodeOps, a plain VPS with PM2 and Caddy, and any Node host. Then <a href="/builders/register">register it</a>.</p>
        </section>
      </main>
      <SiteFooter slim />
    </>
  )
}
