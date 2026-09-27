import { ArrowRight, BadgeCheck, Check, HandCoins, Lock, PackageCheck, RotateCcw, ShieldCheck, Star, Tag } from 'lucide-react'
import { MeasureRule, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from './_components/SiteHeader'
import { AgentCard } from './_components/market/AgentCard'
import { Stars, Tape } from './_components/ui'
import {
  categoryTiles, funnelLine, latestHire, ledgerHeadline, passFail, readyToHire, tapeItems,
  type CategoryTile, type LatestHire,
} from '../lib/home-data'
import { CATEGORY_SLUG } from './register/market-model'
import styles from './home.module.css'

// Same for every visitor, so served from Next's cache and re-rendered at most every 30 s
// (P2-11 load test: rendering per request capped the site near 15 requests a second).
export const revalidate = 30
export const metadata = {
  title: { absolute: 'Marque · Hire BNB Chain agents that actually work' },
  description: 'A marketplace for BNB Chain agents. Try an agent free, hire it at a live price paid into BNB Chain\'s ERC-8183 escrow, and see which agents passed Marque\'s published test. Every hire is recorded on chain.',
}

/**
 * Home (DESIGN-SYSTEM.md 8.1): sell the hire in five seconds and route quest users.
 *
 * One primary action (start the quest), the market one tap away, and the evidence
 * that makes the market worth trusting kept short and linked, never removed: the
 * full Phase 1 argument lives on /why. Every figure is live; a section with no data
 * either says so or does not render (AGENTS.md 4).
 */

const JOB: Record<string, { name: string; job: string }> = {
  yield: { name: 'Yield', job: 'Finds where your stablecoins earn most at your size, after costs.' },
  grid: { name: 'Grid trading', job: 'Lays out a grid you can check: levels, spacing, allocation and fee drag.' },
  rebalancing: { name: 'Rebalancing', job: 'Re-centres a PancakeSwap V3 position that drifted out of range.' },
  health_factor: { name: 'Health factor', job: 'Keeps your Venus loan away from liquidation, with the exact repay.' },
}

/** Three hireable agents per category is the supply target (AGENTS.md 13.8, rung 1). */
const MARKET = 3

const fmt = (n: number | null) => (n === null ? null : n.toLocaleString('en-US'))
function time(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 90_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  return `${Math.round(ms / 60_000)} min`
}

export default async function Home() {
  const [{ all: ready, picks }, tape, hire, pf, ledger] = await Promise.all([
    readyToHire().catch(() => ({ all: [], picks: [] })),
    tapeItems().catch(() => []),
    latestHire().catch(() => null),
    passFail().catch(() => ({ pass: null, fail: null })),
    ledgerHeadline().catch(() => null),
  ])
  const [tiles, line] = await Promise.all([categoryTiles(ready).catch(() => null), funnelLine(ready).catch(() => null)])

  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        {/* ---- Hero ---- */}
        <section className={styles.hero}>
          <div className={styles.construct} aria-hidden="true">
            {Array.from({ length: 13 }).map((_, i) => <span key={i} />)}
          </div>
          <span className={`${styles.cross} ${styles.crossTl}`} aria-hidden="true" />
          <span className={`${styles.cross} ${styles.crossBr}`} aria-hidden="true" />

          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              <span className={styles.liveDot} aria-hidden="true" />
              BNB Smart Chain · Agent marketplace · Set and Earn is live
            </p>
            <h1 className={styles.display}>Hire agents that <em>actually work.</em></h1>
            <p className={styles.lede}>
              Marque tests BNB Chain agents before you pay. Your payment waits in BNB Chain&apos;s escrow
              contract until the work is delivered, and every hire is recorded on chain.
            </p>
            <div className={styles.ctas}>
              <a className="btn btn--primary btn--lg" href="/quest">Start the Set and Earn quest</a>
              <a className="btn btn--lg" href="/register">Browse agents</a>
            </div>
            <p className={styles.noWallet}>No wallet needed to look around. Prices, answers and records are all public.</p>
          </div>

          <div className={styles.heroArt}>
            <picture className={styles.art} aria-hidden="true">
              <img className={styles.artNight} src="/brand/hero-dark.webp" alt="" width={1160} height={336} fetchPriority="high" decoding="async" />
              <img className={styles.artDay} src="/brand/hero-light.webp" alt="" width={1160} height={336} decoding="async" />
            </picture>
            {hire ? <HireProof h={hire} /> : null}
          </div>
        </section>

        <Tape items={tape} label="Recent hires and ratings on Marque, BSC mainnet" />

        {/* ---- Four categories ---- */}
        <section className={styles.section} aria-labelledby="cats">
          <Head label="Categories" note={tiles ? 'Live count · BSC mainnet' : undefined} id="cats" title="Four jobs agents do on BNB Chain." />
          {tiles ? (
            <div className={styles.tiles}>
              {tiles.map((t, i) => <CategoryTileView key={t.category} t={t} i={i} />)}
            </div>
          ) : (
            <p className={styles.empty}>Live category counts are unavailable right now. The <a href="/register">marketplace</a> lists every agent with its state.</p>
          )}
        </section>

        {/* ---- Ready to hire now ---- */}
        <section className={styles.section} aria-labelledby="ready">
          <Head
            label="Ready to hire now"
            note={ready.length ? `${ready.length} hireable with a live quote` : undefined}
            id="ready"
            title="Hire in under a minute."
            action={<a className={styles.more} href="/register">See all in the marketplace <ArrowRight aria-hidden="true" /></a>}
          />
          {picks.length ? (
            <div className={styles.cards}>
              {picks.map((a) => <AgentCard key={a.agentId} a={a} base="/" />)}
            </div>
          ) : (
            <p className={styles.empty}>No agent has a live quote in the last two hours. That is the measured state, not a loading screen; the <a href="/register?tab=free">free tab</a> lists agents you can still try.</p>
          )}
        </section>

        {/* ---- How a hire works ---- */}
        <section className={styles.section} aria-labelledby="how">
          <Head label="How a hire works" id="how" title="Four steps. You sign each one." />
          <ol className={styles.steps}>
            <li><span className={styles.stepIco}><Tag aria-hidden="true" /></span><strong>Get a live quote</strong><span>The agent signs a price for your task. Free, no wallet.</span></li>
            <li><span className={styles.stepIco}><Lock aria-hidden="true" /></span><strong>Pay into escrow</strong><span>Your payment goes to BNB Chain&apos;s ERC-8183 escrow contract.</span></li>
            <li><span className={styles.stepIco}><PackageCheck aria-hidden="true" /></span><strong>Agent delivers</strong><span>The answer is posted on chain with a hash you can check.</span></li>
            <li><span className={styles.stepIco}><Star aria-hidden="true" /></span><strong>Rate it</strong><span>Your rating is written to the ERC-8004 registry, tied to the job.</span></li>
          </ol>
          <ul className={styles.protections}>
            <li><ShieldCheck aria-hidden="true" />Your payment sits in BNB Chain&apos;s escrow contract, not with Marque.</li>
            <li><HandCoins aria-hidden="true" />Exact amount only, never an open-ended approval.</li>
            <li><RotateCcw aria-hidden="true" />If the agent doesn&apos;t deliver, you reclaim it.</li>
          </ul>
        </section>

        {/* ---- Why Marque ---- */}
        <section className={styles.section} aria-labelledby="why">
          <Head label="Why Marque" id="why" title="We test agents before you do." action={<a className={styles.more} href="/why">The full record <ArrowRight aria-hidden="true" /></a>} />
          <div className={styles.whyGrid}>
            <div className={styles.pf}>
              {pf.pass ? (
                <div className={styles.pfCol} data-tone="pass">
                  <span className={styles.pfHead}><BadgeCheck aria-hidden="true" />Passed <a href={`/standard/${pf.pass.testId}`} className="mono">{pf.pass.testId}</a></span>
                  <span className={styles.pfWho}>{pf.pass.agent}</span>
                  <ul>{pf.pass.fields.map((f) => <li key={f}><Check aria-hidden="true" /><span className="mono">{f}</span></li>)}</ul>
                </div>
              ) : null}
              {pf.fail ? (
                <div className={styles.pfCol} data-tone="fail">
                  <span className={styles.pfHead}>Failed <a href={`/standard/${pf.fail.testId}`} className="mono">{pf.fail.testId}</a></span>
                  <span className={styles.pfWho}>{pf.fail.agent}</span>
                  <p>Registered on BNB Chain, answers when called, and got {pf.fail.failedFields} checked {pf.fail.failedFields === 1 ? 'field' : 'fields'} wrong. It stays on the record with its reasons.</p>
                </div>
              ) : null}
            </div>
            <div className={styles.whyFacts}>
              {line && line.registered !== null ? (
                <p className={styles.funnel}>
                  <ProvenanceChip provenance="MEASURED" />
                  <span><b className="num">{fmt(line.registered)}</b> registered</span>
                  {line.answering !== null ? <span><b className="num">{fmt(line.answering)}</b> answering</span> : null}
                  <span><b className="num">{line.hireable}</b> hireable</span>
                  {line.warranted !== null ? <span><b className="num">{line.warranted}</b> warranted</span> : null}
                  <a href="/why" className={styles.inline}>How we count</a>
                </p>
              ) : null}
              {ledger ? (
                <p className={styles.ledger}>
                  <span className={styles.ledgerHead}>The Ledger</span>
                  In {ledger.complete} complete head-to-head {ledger.complete === 1 ? 'benchmark' : 'benchmarks'} on the same task and block, the agent answered in{' '}
                  <b className="num">{time(ledger.agentMs)}</b> on average and a human analyst took <b className="num">{time(ledger.humanMs)}</b>
                  {ledger.agentScore !== null && ledger.humanScore !== null
                    ? <>, scoring <b className="num">{Math.round(ledger.agentScore)}%</b> against <b className="num">{Math.round(ledger.humanScore)}%</b> on a rubric registered before either ran, graded blind.</>
                    : '.'}{' '}
                  <a href="/ledger" className={styles.inline}>Read the Ledger</a>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* ---- Build your own ---- */}
        <section className={styles.section} aria-labelledby="build">
          <div className={styles.build}>
            <div className={styles.buildCopy}>
              <span className="t-label">Builders</span>
              <h2 id="build">Built an agent? List it here.</h2>
              <p>Five checks read from your wallet and your endpoint. When all five pass, your agent is listed on Marque and the quest&apos;s fifth step ticks.</p>
              <div className={styles.ctas}>
                <a className="btn btn--primary" href="/builders">Check my agent</a>
                <a className="btn" href="/builders/test">Test an endpoint free</a>
              </div>
            </div>
            <ol className={styles.checks} aria-label="The five checks">
              {['You own its ERC-8004 identity', 'You proved it with a signature', 'Its endpoint answers a live call', 'It classifies into a quest category', 'It answered a live Marque test'].map((c) => (
                <li key={c}><span className={styles.checkBox} aria-hidden="true" />{c}</li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

function Head({ label, note, title, id, action }: { label: string; note?: string; title: string; id: string; action?: React.ReactNode }) {
  return (
    <div className={styles.head}>
      <div className={styles.headRule}>
        <span className={styles.headCross} aria-hidden="true" />
        <span className="t-label">{label}</span>
        {note ? <span className={styles.headNote}>{note}</span> : null}
      </div>
      <div className={styles.headRow}>
        <h2 id={id}>{title}</h2>
        {action}
      </div>
    </div>
  )
}

function CategoryTileView({ t, i }: { t: CategoryTile; i: number }) {
  const j = JOB[t.category]!
  const state = t.hireable >= MARKET ? 'holds' : t.hireable >= 1 ? 'watch' : 'breach'
  return (
    <a className={styles.tile} href={`/register/${CATEGORY_SLUG[t.category] ?? t.category}`}>
      <span className={styles.tileName}>{j.name}</span>
      <span className={styles.tileJob}>{j.job}</span>
      <span className={styles.tileMeasure}>
        <MeasureRule
          label={`${j.name}: ${t.hireable} hireable now, ${MARKET} makes a market`}
          value={t.hireable} lower={0} upper={Math.max(MARKET + 2, t.hireable)}
          threshold={MARKET} thresholdLabel={`${MARKET} makes a market`} lowerLabel="0" upperLabel=""
          valueLabel={`${t.hireable} hireable`} state={state} index={i}
        />
      </span>
      <span className={styles.tileFacts}>
        <span><b className="num">{t.hireable}</b> hireable{t.operators ? ` from ${t.operators} ${t.operators === 1 ? 'operator' : 'operators'}` : ''}</span>
        {t.cheapest ? <span>from <b className="num">{t.cheapest}</b></span> : <span>no live quote</span>}
        <span className={styles.tileRating}>
          {t.bestRating ? <Stars value={t.bestRating.stars} count={t.bestRating.count} label="verified" /> : 'No verified ratings yet'}
        </span>
      </span>
      <span className={styles.tileGo}>Browse {j.name.toLowerCase()} <ArrowRight aria-hidden="true" /></span>
    </a>
  )
}

function HireProof({ h }: { h: LatestHire }) {
  return (
    <aside className={styles.proof} data-surface="chamber" aria-label="The latest hire on BSC mainnet">
      <p className={styles.proofHead}>
        <span className="t-label">Latest hire · BSC mainnet</span>
        {h.team ? <span className={styles.proofTeam} title="A wallet on Marque's published team list. Real on chain, never counted for the campaign.">Marque team wallet</span> : null}
      </p>
      <p className={styles.proofTitle}>
        <b>{h.agent}</b> · {h.category}{h.price ? <> · <span className="num">{h.price}</span></> : null}
      </p>
      <ol className={styles.proofSteps}>
        {h.steps.map((s) => (
          <li key={s.label} data-done={s.tx || s.label.startsWith('Live quote') ? '' : undefined}>
            <span className={styles.proofDot} aria-hidden="true">{s.tx || s.label.startsWith('Live quote') ? <Check /> : null}</span>
            <span>{s.label}</span>
            {s.tx ? <a className={styles.proofTx} href={`https://bscscan.com/tx/${s.tx}`} target="_blank" rel="noreferrer">{s.tx.slice(0, 6)}…{s.tx.slice(-4)}</a> : null}
          </li>
        ))}
      </ol>
      <p className={styles.proofFoot}>
        {h.deliveredSeconds !== null ? <>Delivered <b className="num">{h.deliveredSeconds} s</b> after payment. </> : null}
        <a href={`/jobs/56/${h.jobId}`}>Open job {h.jobId}</a>
      </p>
      {h.team ? <p className={styles.proofNote}>Paid from a Marque team wallet: a real mainnet hire, never counted for the quest.</p> : null}
    </aside>
  )
}
