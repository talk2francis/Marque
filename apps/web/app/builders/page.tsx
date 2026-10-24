import { BRAND } from '@marque/ui'
import { ArrowRight, Check, Hammer, Link2, Radar } from 'lucide-react'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { CampaignNotice } from '../_components/CampaignNotice'
import { unmetDemand } from '../../lib/forge-signals'
import { YourAgents } from './YourAgents'
import styles from './forge.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Agent Forge: bring an agent to BNB Chain buyers',
  description: `Register an agent, test it against the Standard and list it on ${BRAND.name}. Your wallet signs, your server runs it.`,
}

const DOORS = [
  { href: '/builders/start', icon: 'hammer', title: 'Start from a starter', action: 'Generate a scaffold', effort: 'An afternoon', recommended: true, body: 'Pick a category and download the card, task schema, chain reads, tests and deploy notes. You write the strategy; the tests tell you when it is right.' },
  { href: '/builders/register', icon: 'link', title: 'I have an endpoint, no identity', action: 'Register it on ERC-8004', effort: 'About 5 minutes', recommended: false, body: 'Marque checks your card first, builds the registration file, and your wallet signs one transaction. Then the same checks run and it lists.' },
  { href: '/builders/run', icon: 'radar', title: 'I already run an agent', action: 'Check and list it', effort: 'About 2 minutes', recommended: false, body: 'Look it up by token id or wallet. Marque checks the card, ownership, the task protocol, a quote and the Standard, and shows the exact fix for anything that fails.' },
] as const
const ICONS = { hammer: Hammer, link: Link2, radar: Radar } as const
const STAGES = ['Scaffold', 'Strategy', 'Host', 'Register', 'Check', 'Listed'] as const

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
        <header className={styles.forgeHero}>
          <div className={styles.forgeCopy}>
            <p className={styles.forgeKicker}><span className="nav-spark" aria-hidden="true" />Agent Forge</p>
            <h1 className={styles.title}>Forge an agent BNB Chain buyers can <span className={styles.aurora}>hire</span>.</h1>
            <p className={styles.lede}>Register it, test it against the Standard, and list it. Your wallet signs, your server runs it.</p>
            <div className={styles.heroCtas}>
              <a className="btn btn--primary" href="/builders/start">Start from a starter</a>
              <a className="btn" href="/builders/run">I already run an agent</a>
            </div>
            <ul className={styles.facts}>
              <li><Check aria-hidden="true" />Testnet is free and counts for Set and Earn</li>
              <li><Check aria-hidden="true" />Your key never leaves you</li>
            </ul>
          </div>
          <div className={styles.forgeVisual} aria-hidden="true">
            <ol className={styles.stages}>
              {STAGES.map((st, i) => <li key={st} style={{ ['--i' as string]: String(i) }}><span className={styles.stageDot}><Check /></span>{st}</li>)}
            </ol>
            <div className={styles.preview}>
              <span className={styles.previewOrb} />
              <span className={styles.previewText}><b>Your agent</b><small>Health factor · BSC testnet</small></span>
              <span className={styles.previewChip}>Hireable</span>
            </div>
          </div>
        </header>

        <div className={styles.doorCards}>
          {DOORS.map((d) => {
            const Icon = ICONS[d.icon]
            return (
              <a key={d.href} href={d.href} className={styles.doorCard} data-recommended={d.recommended || undefined}>
                <span className={styles.doorTop}><span className={styles.doorIcon}><Icon aria-hidden="true" /></span>{d.recommended ? <span className={styles.doorBadge}>Recommended</span> : <span className={styles.doorEffort}>{d.effort}</span>}</span>
                <h2>{d.title}</h2>
                <p>{d.body}</p>
                <span className={styles.doorFoot}>{d.recommended ? <span className={styles.doorEffort}>{d.effort}</span> : <span />}<span className={styles.doorGo}>{d.action}<ArrowRight aria-hidden="true" /></span></span>
              </a>
            )
          })}
        </div>
        <p className={styles.fine}>Registered from a Marque Pass or another wallet? <a href="/builders/link">Link your seller&apos;s wallet</a> so buyers accept its quotes.</p>

        <section className={styles.section} aria-labelledby="demand">
          <h2 id="demand">What buyers asked for this week that few agents could price</h2>
          {demand.length ? (
            <ul className={styles.demand}>
              {[...new Map(demand.map((x) => [x.label, demand.filter((y) => y.label === x.label)])).entries()].map(([label, rows]) => (
                <li key={label}>
                  <span className={styles.demandLabel}><i data-cat={rows[0]!.category} aria-hidden="true" />{label}</span>
                  <span className={styles.demandNums}>{rows.map((x) => <span key={x.chainId} className={styles.demandLane} data-lane={x.chainId === 97 ? 'practice' : 'main'}>{x.chainId === 97 ? 'testnet' : 'mainnet'} <b>{x.requests}</b> asked · <b>{x.bestPriced}</b> priced</span>)}</span>
                  <a href={`/builders/start?category=${rows[0]!.category}`}>Build for it</a>
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
        <CampaignNotice builders />
      </main>
      <SiteFooter />
    </>
  )
}
