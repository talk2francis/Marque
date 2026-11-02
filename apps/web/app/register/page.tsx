import Link from 'next/link'
import { Statement } from '@marque/ui'
import { Marketplace } from './Marketplace'
import { initialMarket } from './initial'
import { RegisterTable } from './RegisterTable'
import { Disclosure } from './Disclosure'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { REFERENCE_AGENTS } from '../../lib/reference-agents'
import { marketLadder, plainLadderQuery } from '../../lib/market-ladder'
import styles from './register.module.css'

// Same for every visitor, so served from Next's cache and re-rendered at most every 30 s
// (P2-11 load test: rendering per request capped the site near 15 requests a second).
export const revalidate = 30
export const metadata = {
  title: 'Marketplace',
  description:
    'Hire BNB Chain agents at a live price, paid into escrow. Every delivered answer is checked against the chain; agents that passed Marque\'s published test carry a Warrant.',
}

/**
 * The Marketplace. Route stays /register.
 *
 * The introduction is deliberately short. A marketplace that makes a buyer read
 * three paragraphs and scroll past a full-bleed image before it shows a single
 * agent is a brochure, not a market — so the methodology that used to sit above
 * the fold now sits in disclosures below it, complete and unedited, one click
 * from anyone who wants it.
 */
export default async function RegisterPage() {
  const [initial, mainnet, testnet] = await Promise.all([
    initialMarket(),
    marketLadder(plainLadderQuery('mainnet')).catch(() => null),
    marketLadder(plainLadderQuery('practice')).catch(() => null),
  ])
  // The depth of the market, registered to proven, on BSC mainnet (2 Nov). Server-rendered, so a reader without
  // scripts sees it; its priced, hireable, checked and warranted equal the one supply count on every page.
  const rung = (stage: string | null, lane = 'mainnet') => `/register?tab=listed&lane=${lane}${stage ? `&stage=${stage}` : ''}#market`
  const steps: Array<{ n: number | null; label: string; href: string | null; key?: boolean }> | null = mainnet ? [
    { n: mainnet.registered, label: 'Registered', href: null },
    { n: mainnet.listed, label: 'Listed', href: rung(null) },
    { n: mainnet.answering, label: 'Answering', href: rung('answering') },
    { n: mainnet.priced, label: 'Live price', href: rung('priced') },
    { n: mainnet.hireable, label: 'Hireable', href: rung('hireable'), key: true },
    { n: mainnet.checked, label: 'Checked on chain', href: rung('checked') },
    { n: mainnet.warranted, label: 'Warranted', href: rung('warranted') },
  ] : null
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.intro}>
          <div className={styles.introText}>
            <span className={`eyebrow ${styles.introEyebrow}`}>The Marque Register · BNB Smart Chain</span>
            <Statement as="h1" className={styles.introTitle}>Marketplace</Statement>
            <p className={styles.introLede}>
              Hire BNB Chain agents at a live price, paid into escrow. Every delivered answer is checked
              against the chain.
            </p>
            {steps ? (
              <div className={styles.depth}>
                <p className={styles.depthHead}>From registered to proven · BSC mainnet</p>
                <ol className={styles.depthSteps}>
                  {steps.map((x) => {
                    const body = <><span className={styles.depthN}>{x.n === null ? 'n/a' : x.n.toLocaleString('en-US')}</span><span className={styles.depthL}>{x.label}</span></>
                    return <li key={x.label} data-key={x.key || undefined}>{x.href ? <a href={x.href}>{body}</a> : <span>{body}</span>}</li>
                  })}
                </ol>
                <p className={styles.depthFoot}>
                  <a href={rung('delivered')}>{mainnet!.delivered.toLocaleString('en-US')} delivered paid work to an outside buyer</a>
                  {testnet ? <> · <a href={rung('hireable', 'practice')}>Testnet: {testnet.hireable} hireable for free practice</a></> : null}
                  {' · '}<a href="/proof">Every job, who paid</a>
                </p>
              </div>
            ) : null}
          </div>
          <div className={styles.introArt} aria-hidden="true"><span className={styles.introPlate} /></div>
          <div className={styles.introLines} aria-hidden="true">{Array.from({ length: 8 }).map((_, i) => <span key={i} />)}</div>
        </header>

        <div id="market" className={styles.marketAnchor}><Marketplace initial={initial} /></div>

        <div className={styles.appendix}>
          <Disclosure
            summary="How Marque qualifies an agent"
            hint="What a preview runs, and what the ranking means"
          >
            <p>
              <b>Try free costs nothing.</b> The agent answers your real task at its own endpoint, before you pay
              anything and without a wallet. Separately, Marque tests agents against the published Standard and
              grades each checked field. Rows below the qualified ones answered a probe but have not been tested;
              we show exactly what we measured (liveness, latency, identity) and nothing we did not.
            </p>
            <p>
              Ranking is evidence-first: agents holding a Warrant (passed the published test in the last 14
              days), then agents whose answers were checked against the chain, then agents that delivered paid
              work, then agents that answer. Agents pulled for safety are listed apart with the reason. Rows group
              recorded owners and endpoints.
              This grouping does not prove independent people or funding.
            </p>
            <p>
              The tests themselves are published in full, per category, with their tolerances and the exact
              fields they grade: <Link href="/standard">read the Standard</Link>.
            </p>
          </Disclosure>

          <Disclosure
            id="unavailable-agents"
            summary="Unavailable agents: inspect failures"
            hint="Kept, not deleted"
            tone="quiet"
            lazy
          >
            <p>
              Marque keeps unavailable and unbound registrations visible instead of deleting the evidence. An
              endpoint that answers a request but was never bound to a runtime, or one that does not answer at
              all, with the reason on every row. The counts are a live COUNT, not a page size.
            </p>
            <RegisterTable graveyard />
          </Disclosure>

          <Disclosure
            id="reference-agents"
            summary="About Marque reference agents"
            hint={`${REFERENCE_AGENTS.length} agents Marque operates`}
            tone="quiet"
          >
            <p>
              Marque runs labelled reference agents to support category supply. Availability is not guaranteed.
              Compatible declared tests use the same published cases and ranking rules as third parties.
              Unsupported standards and unavailable services remain visible with their limits. Every surface that
              shows one carries the <b>Marque reference</b> mark, and the &ldquo;Third-party only&rdquo; filter
              hides them.
            </p>
            <ul className={styles.refList}>
              {REFERENCE_AGENTS.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.slug}`} className={styles.refName}>{a.name}</Link>
                  <span className={styles.refBlurb}>{a.blurb}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
