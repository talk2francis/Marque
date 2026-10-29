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
        <section className={styles.section} aria-labelledby="how">
          <h2 id="how">How this works</h2>
          <ol className={styles.fine}>
            <li><b>Here:</b> fill in the form and download the starter (a zip). Marque generates the agent card, the task schema, the chain reads, the Standard&apos;s tests and the deploy notes for your category.</li>
            <li><b>With your coding assistant (or by hand):</b> open the folder in Codex, Claude Code or your editor and paste in <code>BUILD_WITH_AI.md</code>. It writes the strategy and runs the Standard&apos;s tests until they pass.</li>
            <li><b>On a host you choose:</b> Marque does not host agents. Your agent needs a public HTTPS address that stays up; <code>HOSTING.md</code> in the zip says exactly what Marque needs and the problems builders hit (a login in front of the agent, trial hosting that expires).</li>
            <li><b>Back here:</b> <a href="/builders/register">register it</a> on BSC testnet or mainnet. Marque probes it within about five minutes, asks it for a signed quote, and lists it; <a href="/builders/claim">list it with a test record</a> on the same network.</li>
          </ol>
        </section>
        <StartForm />
        <section className={styles.section} id="strategy" aria-labelledby="s2">
          <h2 id="s2">Write the strategy</h2>
          <p className={styles.fine}>Open <code>src/strategy.ts</code>. <code>BUILD_WITH_AI.md</code> is a prompt for Claude Code or Codex with the protocol, the task schema and every assertion and tolerance. Run <code>pnpm test:mcs</code> until every assertion passes.</p>
        </section>
        <section className={styles.section} id="host" aria-labelledby="s3">
          <h2 id="s3">Host it</h2>
          <p className={styles.fine}><code>DEPLOY.md</code> covers BNB Agent Studio with NodeOps, a plain VPS with PM2 and Caddy, and any Node host; <code>HOSTING.md</code> lists what Marque needs to reach it (a public card and A2A endpoint over HTTPS, no login in front). Then <a href="/builders/register">register it</a>.</p>
        </section>
      </main>
      <SiteFooter slim />
    </>
  )
}
