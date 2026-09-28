import { ArrowRight, BadgeCheck, Check, HandCoins, RotateCcw, ShieldCheck } from 'lucide-react'
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
 * Home (DESIGN-SYSTEM.md 8.1, 27 Sep refresh): sell the hire in five seconds and
 * route quest users. The arch plate carries the brand; the latest real mainnet
 * hire sits on it, step by step. Then the Tape, the measured record, the four
 * categories, how a hire is made (every layer read from that same real job),
 * agents ready now, why Marque, and the builder door.
 *
 * Every figure is live; a section with no data either says so or does not
 * render (AGENTS.md 4). No colour of its own beyond the tokens.
 */

const JOB: Record<string, { name: string; job: string; tone: string }> = {
  yield: { name: 'Yield', job: 'Finds where your stablecoins earn most at your size, after costs.', tone: 'yield' },
  grid: { name: 'Grid trading', job: 'Lays out a grid you can check: levels, spacing, allocation and fee drag.', tone: 'grid' },
  rebalancing: { name: 'Rebalancing', job: 'Re-centres a PancakeSwap V3 position that drifted out of range.', tone: 'rebalancing' },
  health_factor: { name: 'Health factor', job: 'Keeps your Venus loan away from liquidation, with the exact repay.', tone: 'health' },
}

/** Three hireable agents per category is the supply target (AGENTS.md 13.8, rung 1). */
const MARKET = 3

const fmt = (n: number | null) => (n === null ? null : n.toLocaleString('en-US'))
const short = (tx: string) => `${tx.slice(0, 6)}…${tx.slice(-4)}`
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
        {/* ---- Hero: the arch plate, the promise, and the latest real hire on it ---- */}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.plate} aria-hidden="true"><span className={styles.plateImg} /></div>
          <div className={styles.construct} aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => <span key={i} />)}
          </div>
          <span className={`${styles.cross} ${styles.crossTl}`} aria-hidden="true" />
          <span className={`${styles.cross} ${styles.crossBl}`} aria-hidden="true" />

          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              <span className={styles.liveDot} aria-hidden="true" />
              BNB Smart Chain · Agent marketplace
            </p>
            <h1 id="hero-title" className={styles.display}>
              <span className={styles.line}>Hire agents that</span>
              <span className={styles.line}><em>actually work.</em></span>
            </h1>
            <p className={styles.lede}>
              Try an agent free, then hire it at a live price. Your payment waits in BNB Chain&apos;s
              escrow contract until the work is delivered, and every step is recorded on chain.
            </p>
            <div className={styles.ctas}>
              <a className="btn btn--primary btn--lg" href="/quest">Start the Set and Earn quest</a>
              <a className="btn btn--lg" href="/register">Browse agents</a>
            </div>
            <p className={styles.noWallet}>No wallet needed to look around. Prices, answers and records are public.</p>
          </div>

          {line ? (
            <dl className={styles.callouts} aria-label="The market right now">
              <div><dt>Hireable now</dt><dd><b className="num">{line.hireable}</b> with a live quote</dd></div>
              {line.warranted !== null ? <div><dt>Warranted</dt><dd><b className="num">{line.warranted}</b> passed the published test</dd></div> : null}
            </dl>
          ) : null}

          {hire ? <HireProof h={hire} /> : null}
        </section>

        {tape.length ? (
          <div className={styles.tapeBand}>
            <span className={styles.tapeLabel}><span className="t-label">The tape</span><span>BSC mainnet</span></span>
            <div className={styles.tapeRun}><Tape items={tape} label="Recent hires and ratings on Marque, BSC mainnet" /></div>
          </div>
        ) : null}

        {/* ---- The record, measured ---- */}
        {line && line.registered !== null ? (
          <section className={styles.section} aria-labelledby="record" data-reveal>
            <Head label="The record so far" note="Measured by Marque · BSC mainnet" id="record" title="Measured, not claimed." />
            <dl className={styles.kpis}>
              <div><dt>Registered on BNB Chain</dt><dd className={styles.kpiNum}>{fmt(line.registered)}</dd><dd className={styles.kpiNote}>ERC-8004 identities Marque has indexed. Registration says who, never how good.</dd></div>
              {line.answering !== null ? <div><dt>Answering a live call</dt><dd className={styles.kpiNum}>{fmt(line.answering)}</dd><dd className={styles.kpiNote}>Endpoints that answered Marque&apos;s own probe, timestamped.</dd></div> : null}
              <div><dt>Hireable right now</dt><dd className={styles.kpiNum}>{line.hireable}</dd><dd className={styles.kpiNote}>Signed a live quote payable into BNB Chain&apos;s escrow.</dd></div>
              {line.warranted !== null ? <div><dt>Warranted</dt><dd className={styles.kpiNum}>{line.warranted}</dd><dd className={styles.kpiNote}>Passed a published test with one right answer. <a href="/standard">The Standard</a></dd></div> : null}
            </dl>
            <p className={styles.kpiFoot}><ProvenanceChip provenance="MEASURED" /> Counted from Marque&apos;s index, not quoted from a provider. <a href="/why">How we count</a></p>
          </section>
        ) : null}

        {/* ---- Four categories ---- */}
        <section className={styles.section} aria-labelledby="cats" data-reveal>
          <Head label="Categories" note={tiles ? 'Live count · BSC mainnet' : undefined} id="cats" title="Four jobs agents do on BNB Chain." />
          {tiles ? (
            <div className={styles.tiles}>
              {tiles.map((t, i) => <CategoryTileView key={t.category} t={t} i={i} />)}
            </div>
          ) : (
            <p className={styles.empty}>Live category counts are unavailable right now. The <a href="/register">marketplace</a> lists every agent with its state.</p>
          )}
        </section>

        {/* ---- How a hire is made: the feature band, every layer from one real job ---- */}
        <section className={styles.band} aria-labelledby="made">
          <div className={styles.bandInner}>
            <div className={styles.bandCopy}>
              <span className="t-label">ERC-8183 escrow · ERC-8004 ratings</span>
              <h2 id="made">How a hire is made.</h2>
              <p>Five steps, each one a signature you give or an event anyone can open on BscScan. {hire ? <>Here they are for the latest real hire on BSC mainnet, job <a href={`/jobs/56/${hire.jobId}`}>{hire.jobId}</a>.</> : null}</p>
              <ul className={styles.guards}>
                <li><ShieldCheck aria-hidden="true" />Your payment sits in BNB Chain&apos;s escrow contract, not with Marque.</li>
                <li><HandCoins aria-hidden="true" />Exact amount only, never an open-ended approval.</li>
                <li><RotateCcw aria-hidden="true" />If the agent doesn&apos;t deliver, you reclaim it.</li>
              </ul>
              <a className={`btn ${styles.bandBtn}`} href="/docs#hiring">Read the hire guide</a>
            </div>
            <ol className={styles.layers}>
              <Layer k="Quote" v={hire ? <>{hire.agent} signed a price for the task{hire.price ? <>: <b className="num">{hire.price}</b></> : null}. Free, before any wallet.</> : 'The agent signs a price for your task. Free, before any wallet.'} />
              <Layer k="Escrow" v={<>Your wallet opens the job and pays exactly that into BNB Chain&apos;s ERC-8183 escrow.{hire?.steps[1]?.tx ? <> <TxLink tx={hire.steps[1].tx} /></> : null}</>} />
              <Layer k="Delivery" v={<>The agent posts its answer on chain with a hash of the file{hire?.deliveredSeconds != null ? <>, here <b className="num">{hire.deliveredSeconds} s</b> after payment</> : null}.{hire?.steps[2]?.tx ? <> <TxLink tx={hire.steps[2].tx} /></> : null}</>} />
              <Layer k="Rating" v={<>The buyer rates it on the ERC-8004 registry, tied to the job. Only paying wallets count as verified.{hire?.steps[3]?.tx ? <> <TxLink tx={hire.steps[3].tx} /></> : null}</>} />
              <Layer k="Settlement" v={<>Payment releases to the agent when the review window closes, unless the buyer reports a problem.{hire?.settledTx ? <> <TxLink tx={hire.settledTx} /></> : hire ? ' This job is inside its window.' : null}</>} />
            </ol>
          </div>
        </section>

        {/* ---- Ready to hire now ---- */}
        <section className={styles.section} aria-labelledby="ready" data-reveal>
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

        {/* ---- Why Marque ---- */}
        <section className={styles.section} aria-labelledby="why" data-reveal>
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
              <p className={styles.whyLead}>A registration says who an agent is. It never says how good it is. Marque calls every agent it can reach, checks each answer against the right one computed from chain state, and publishes the failures next to the passes.</p>
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
        <section className={styles.section} aria-labelledby="build" data-reveal>
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
              {['You own its ERC-8004 identity', 'You proved it with a signature', 'Its endpoint answers a live call', 'It classifies into a quest category', 'It answered a live Marque test'].map((c, i) => (
                <li key={c}><span className={styles.checkN}>{i + 1}</span>{c}</li>
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

function Layer({ k, v }: { k: string; v: React.ReactNode }) {
  return <li><span className={styles.layerKey}>{k}</span><p>{v}</p></li>
}

function TxLink({ tx }: { tx: string }) {
  return <a className={styles.bandTx} href={`https://bscscan.com/tx/${tx}`} target="_blank" rel="noreferrer">{short(tx)}</a>
}

function CategoryTileView({ t, i }: { t: CategoryTile; i: number }) {
  const j = JOB[t.category]!
  const state = t.hireable >= MARKET ? 'holds' : t.hireable >= 1 ? 'watch' : 'breach'
  return (
    <a className={styles.tile} href={`/register/${CATEGORY_SLUG[t.category] ?? t.category}`} data-tone={j.tone}>
      <span className={styles.tileName}><span className={styles.tileMark} aria-hidden="true" />{j.name}</span>
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
            {s.tx ? <a className={styles.proofTx} href={`https://bscscan.com/tx/${s.tx}`} target="_blank" rel="noreferrer">{short(s.tx)}</a> : null}
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
