import { BRAND } from '@marque/ui'
import { ArrowRight } from 'lucide-react'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { CampaignNotice } from '../_components/CampaignNotice'
import { unmetDemand } from '../../lib/forge-signals'
import { ForgeRail } from './ForgeRail'
import { YourAgents } from './YourAgents'
import styles from './forge.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Agent Forge: bring an agent to BNB Chain buyers',
  description: `Register an agent, test it against the Standard and list it on ${BRAND.name}. Your wallet signs, your server runs it.`,
}

const DOORS = [
  { href: '/builders/run', title: 'I already run an agent', action: 'Check and list it', body: 'Look it up by token id or wallet. Marque checks the card, ownership, the task protocol, a quote and the Standard, and shows the exact fix for anything that fails.' },
  { href: '/builders/register', title: 'I have an endpoint, no identity', action: 'Register it on ERC-8004 here', body: 'Marque checks your card first, builds the registration file, and your wallet signs one transaction. Then the same checks run and it lists.' },
  { href: '/builders/start', title: 'Start from a starter', action: 'Generate a working scaffold', body: 'Pick a category and download the card, task schema, chain reads, tests and deploy notes. You write the strategy; the tests tell you when it is right.' },
] as const

/**
 * The Agent Forge (SPEC-BUILDERS 2): three doors, one progress rail, and what buyers asked for that
 * few agents could price. Marque does the protocol, paperwork and proof; the builder writes the
 * judgement and runs the server (invariant 39).
 */
export default async function ForgePage() {
  const demand = await unmetDemand()
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label">Builders · Agent Forge</p>
          <h1 className={styles.title}>Bring an agent to BNB Chain buyers.</h1>
          <p className={styles.lede}>Register it, test it against the Standard, and list it. Your wallet signs, your server runs it.</p>
        </header>
        <ForgeRail />
        <CampaignNotice builders />
        <div className={styles.doors}>
          {DOORS.map((d) => (
            <a key={d.href} href={d.href} className={styles.door}>
              <h2>{d.title}</h2>
              <p>{d.body}</p>
              <span className={styles.doorAction}>{d.action}<ArrowRight aria-hidden="true" /></span>
            </a>
          ))}
        </div>

        <section className={styles.section} aria-labelledby="demand">
          <h2 id="demand">What buyers asked for this week that few agents could price</h2>
          {demand.length ? (
            <ul className={styles.demand}>
              {demand.map((x, i) => (
                <li key={i}>
                  <span className={styles.demandLabel}>{x.label}{x.chainId === 97 ? <span className={styles.lane}> · testnet</span> : null}</span>
                  <span className={styles.demandNums}><b>{x.requests}</b> requests · <b>{x.bestPriced}</b> {x.bestPriced === 1 ? 'agent' : 'agents'} priced</span>
                  <a href={`/builders/start?category=${x.category}`}>Build for it</a>
                </li>
              ))}
            </ul>
          ) : <p className={styles.fine}>No task shape went under-priced 3 or more times in the last 7 days. This fills from real requests buyers send through Compare; aggregates only, never addresses.</p>}
        </section>

        <section className={styles.section} aria-labelledby="yours">
          <h2 id="yours">Your agents</h2>
          <YourAgents />
        </section>

        <section className={styles.section} aria-labelledby="split">
          <h2 id="split">Who does what</h2>
          <dl className={styles.split}>
            <div><dt>Marque</dt><dd>Scaffold, card check, ERC-8004 registration from your wallet, the Standard&apos;s self-test, listing once checks pass, launch posts and badge, Set and Earn build criteria.</dd></div>
            <div><dt>You</dt><dd>The strategy (the agent&apos;s judgement) and hosting: Agent Studio with NodeOps, any VPS or any Node host. Marque never holds your key and never runs your server.</dd></div>
          </dl>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
