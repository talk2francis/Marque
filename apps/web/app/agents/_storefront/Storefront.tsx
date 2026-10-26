import { ArrowUpRight, Check, KeyRound, ShieldCheck, X } from 'lucide-react'
import { BRAND, Limits, ProvenanceChip } from '@marque/ui'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AgentBrandHero } from '../../_components/AgentBrandHero'
import { AgentIdentityHero } from '../../_components/AgentIdentityHero'
import { agentBrand } from '../../../lib/agent-brand'
import { AddressChip, Badge, HashChip, Stars } from '../../_components/ui'
import { SaveStar } from '../../_components/SaveStar'
import { ResultLens } from '../../jobs/[chainId]/[jobId]/ResultLens'
import { DeliverableView } from '../../jobs/[chainId]/[jobId]/Deliverable'
import { explorerAddress, explorerTx } from '../../../lib/network'
import { utcDay, utcStamp } from '../../../lib/time'
import type { Storefront as Data, StoreTest } from '../../../lib/storefront'
import type { AgentEvidence } from '../../../lib/agent-evidence'
import type { JobLens } from '../../../lib/lens'
import type { Twin } from '../../../lib/forge-signals'
import type { OutcomeView } from '../../../lib/act'
import styles from './storefront.module.css'
import page from './agent-page.module.css'
import { AgentActivity } from './AgentActivity'
import { AgentTerms } from './AgentTerms'
import { RailTerms } from './RailTerms'
import { WarrantCard } from './WarrantCard'
import { UNote } from '../../_components/ui/UNote'
import { AnchorRedirect } from './AnchorRedirect'

/**
 * An agent page (SPEC-WORKSPACE 3, DESIGN-V4 5): one header with the proof line, five routed
 * sections (Overview, Evidence, Track record, Terms, Technical) and the same sticky hire rail on
 * every one. The same page for a Marque reference agent and a third party. Registry text is
 * CLAIMED and styled weaker; what Marque measured, tested or read from chain says so.
 */

export const SECTIONS = [
  { id: 'overview', label: 'Overview', path: '' },
  { id: 'evidence', label: 'Evidence', path: '/evidence' },
  { id: 'record', label: 'Track record', path: '/record' },
  { id: 'terms', label: 'Terms', path: '/terms' },
  { id: 'technical', label: 'Technical', path: '/technical' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']
export const isSection = (s: string): s is Exclude<SectionId, 'overview'> => SECTIONS.some((x) => x.id === s && x.id !== 'overview')

const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid trading', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const NET: Record<number, string> = { 56: 'BSC mainnet', 97: 'BSC testnet' }
const TEST: Record<string, string> = { yield: 'MCS-YIELD-1', grid: 'MCS-GRID-1', rebalancing: 'MCS-REB-1', health_factor: 'MCS-HF-1' }
/** The test an agent is judged on: its own declared standard, else its category's. */
const testOf = (d: { standard: string | null; category: string | null }) => d.standard ?? (d.category ? TEST[d.category] : undefined)
const TENDER = new Set(['health_factor', 'yield', 'grid', 'rebalancing', 'security'])
/** What a buyer sends, in words, from the category's task schema (packages/commerce tasks.ts). */
const SEND: Record<string, string> = {
  health_factor: 'A Venus borrower’s wallet address and the health factor you want to reach.',
  yield: 'An amount and asset, how many days you would hold it, and the yield you earn now.',
  grid: 'A pair, a lower and upper price and the capital in USDT; optionally the number of levels, a stop and the spacing.',
  rebalancing: 'A PancakeSwap V3 position id with its owner’s address, and the range width you want.',
  security: 'A token contract address on BNB Chain.',
}

function ago(isoAt: string | null): string | null {
  if (!isoAt) return null
  const s = Math.max(0, Math.round((Date.now() - Date.parse(isoAt)) / 1000))
  if (s < 90) return 'just now'
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 172800) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}
function secs(n: number | null): string | null {
  if (n === null) return null
  return n < 90 ? `${n} s` : n < 5400 ? `${Math.round(n / 60)} min` : `${Math.round(n / 3600)} h`
}
function days(n: number | null): string | null {
  if (n === null) return null
  return n >= 86_400 ? `${Math.round(n / 86_400)} days` : n >= 3600 ? `${Math.round(n / 3600)} hours` : `${Math.round(n / 60)} minutes`
}

/** Where this agent's page lives: a reference agent's readable address on mainnet, else chain and token. */
export function agentBase(d: Pick<Data, 'slug' | 'chainId' | 'tokenId'>): string {
  return d.slug && d.chainId === 56 ? `/agents/${d.slug}` : `/agents/${d.chainId}/${d.tokenId}`
}

export function Storefront({ d, section = 'overview', evidence = null, lens = null, twins = [], acted = [] }: { d: Data; section?: SectionId; evidence?: AgentEvidence | null; lens?: JobLens | null; twins?: Twin[]; acted?: OutcomeView[] }) {
  const c = d.commerce
  // Badges follow the same terms as the rail (invariant 41); the rail island re-reads them live.
  const hireable = d.terms.state === 'fresh'
  const net = NET[d.chainId] ?? 'BNB Smart Chain'
  const cat = d.category && d.category !== 'unclassified' ? CAT[d.category] ?? d.category : 'Unclassified'
  // The badge and verdict read the agent's own category test: the conformance worker runs
  // all four on a third party, and failing another category's test says nothing about it.
  const ownTest = testOf(d)
  const own = d.category && d.category !== 'unclassified' ? d.tests.filter((t) => t.testId === ownTest) : d.tests
  const latest = own[0] ?? null
  const passed = own.find((t) => t.pass) ?? null
  const answersFree = d.isReference
  const t = d.track
  const delivery = secs(t.delivery.medianSeconds)
  const hireHref = `?hire=${encodeURIComponent(d.agentId)}${c?.serviceId == null ? '' : `&serviceId=${c.serviceId}`}`
  const tryHref = `${hireHref}&try=1`
  const brand = d.isReference ? agentBrand(d.agentId) : null
  const base = agentBase(d)
  const tenderHref = d.category && TENDER.has(d.category) ? `/tender?category=${d.category}${d.chainId === 97 ? '&lane=practice' : ''}` : null
  // The card shows the run that decides the badge: the latest own-category run, or the pass that still stands.
  // An agent no published standard tests shows that, not an older run of a test built for a different task.
  const shown: StoreTest | null = d.noStandard ? null : passed && passed === latest ? passed : latest

  const panel = (
    <aside className={styles.panel} aria-label={`Hire ${d.name}`}>
      <div className={styles.panelHead}>
        <AgentAvatar id={d.agentId} name={d.name} category={d.category} reference={d.isReference} imageUrl={d.imageUrl} size={44} />
        <div>
          <p className={styles.panelName}>{d.name}</p>
          <p className={styles.panelWhere}>{cat} · {net}</p>
        </div>
      </div>
      <RailTerms agentId={d.agentId} facts={c} name={d.name} hireHref={hireHref} tryHref={tryHref} answersFree={answersFree} canQuote={Boolean(c?.serviceId && d.endpoint)}>
        <dl className={styles.panelFacts}>
          <div><dt>Delivers in</dt><dd>{delivery ? <span title={`Median of ${t.delivery.samples} escrow-funded ${t.delivery.samples === 1 ? 'job' : 'jobs'}, from escrow funding to delivery.`}>{delivery}</span> : <span className={styles.muted}>{t.available === false ? 'Delivery evidence unavailable' : 'No delivery samples yet'}</span>}</dd></div>
          <div><dt>Buyer rating</dt><dd>{t.available === false ? 'Rating evidence unavailable' : <Stars value={t.verified.averageStars} count={t.verified.count} label="buyer-linked reviews" />}</dd></div>
          <div><dt>Jobs delivered</dt><dd>{t.available === false ? 'Unavailable' : <><span className="num">{t.jobs.delivered}</span> <ProvenanceChip provenance="ONCHAIN" /></>}</dd></div>
        </dl>
      </RailTerms>
      {d.terms.state !== 'none' ? <p className={styles.authorise}><ShieldCheck aria-hidden="true" />What you authorise: exactly this price, into escrow. Nothing else.</p> : null}
      {d.terms.priceLabel && /\bU\b/.test(d.terms.priceLabel) ? <UNote /> : null}
      {tenderHref ? <p className={styles.authorise}><a href={tenderHref}>Compare: the same task, priced by every agent</a></p> : null}
    </aside>
  )

  const proof = (
    <div className={styles.badges}>
      <Badge kind="network" label={net} />
      {hireable ? <Badge kind="hireable" /> : answersFree ? <Badge kind="preview" /> : null}
      {/* The price lives in the hire panel and "not tested yet" in Evidence: the header keeps only what identifies and proves. */}
      {d.noStandard ? <Badge kind="untested" /> : passed && passed === latest && passed.ranAt ? (Date.now() - Date.parse(passed.ranAt) > 72 * 3_600_000 ? <Badge kind="retest" /> : <Badge kind="warranted" date={passed.ranAt} />) : latest && !latest.pass ? <Badge kind="failed" test={latest.testId} field={latest.failedFields[0]} date={latest.ranAt ?? undefined} /> : null}
      {acted.length ? <a href={`${agentBase(d)}/record#rec-acted`} className={page.actedChip}>Acted on {acted.length}</a> : null}
      {d.isReference ? <a href="/register#reference-agents" className={styles.refLink}><Badge kind="reference" /></a> : null}
      <SaveStar agentId={d.agentId} name={d.name} chainId={d.chainId} tokenId={d.tokenId} />
    </div>
  )

  const tabs = (
    <nav className={page.tabs} aria-label={`${d.name} sections`}>
      {SECTIONS.map((s) => (
        <a key={s.id} href={`${base}${s.path}`} aria-current={s.id === section ? 'page' : undefined} className={page.tab}>{s.label}</a>
      ))}
    </nav>
  )

  return (
    <div className={styles.shell}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/register">Marketplace</a>
        <span aria-hidden="true">/</span>
        {section === 'overview' ? <span aria-current="page">{d.name}</span> : <><a href={base}>{d.name}</a><span aria-hidden="true">/</span><span aria-current="page">{SECTIONS.find((s) => s.id === section)!.label}</span></>}
      </nav>

      <div className={styles.grid}>
        <div className={styles.main}>
          {brand ? (
            <AgentBrandHero brand={brand} agentId={d.agentId} category={d.category}>
              <h1 className={styles.title}>{d.name}</h1>
              {proof}
            </AgentBrandHero>
          ) : (
            <AgentIdentityHero agentId={d.agentId} tokenId={d.tokenId} name={d.name} category={d.category} imageUrl={d.imageUrl}>
              <h1 className={styles.title}>{d.name}</h1>
              {proof}
            </AgentIdentityHero>
          )}
          {tabs}
          {section === 'overview' ? <AnchorRedirect base={base} /> : null}

          {section === 'overview' ? <Overview d={d} cat={cat} shown={shown} tenderHref={tenderHref} tryHref={tryHref} delivery={delivery} lens={lens} base={base} /> : null}
          {section === 'evidence' ? <Evidence d={d} tests={d.tests} own={own} evidence={evidence} cat={cat} /> : null}
          {section === 'record' ? <TrackRecord d={d} net={net} acted={acted} /> : null}
          {section === 'terms' ? <Terms d={d} net={net} /> : null}
          {section === 'technical' ? <Technical d={d} net={net} twins={twins} /> : null}
        </div>

        <div className={styles.side}>{panel}</div>
      </div>

      {/* Under 1024: the purchase panel becomes a bar with price and the one action. */}
      <div className={styles.bar}>
        <span className={styles.barPrice}>
          {d.terms.priceLabel ? <><b className="num">{d.terms.priceLabel}</b><span>{hireable ? 'live quote' : 'last quote'}</span></> : <span>{d.name}</span>}
        </span>
        {d.terms.state !== 'none' ? <a className="btn btn--primary" href={hireHref}>Hire</a> : answersFree ? <a className="btn" href={tryHref}>Try free</a> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Overview */

function Overview({ d, cat, shown, tenderHref, tryHref, delivery, lens, base }: { d: Data; cat: string; shown: StoreTest | null; tenderHref: string | null; tryHref: string; delivery: string | null; lens: JobLens | null; base: string }) {
  const t = d.track
  const send = d.category ? SEND[d.category] : undefined
  return (
    <>
      <section className={page.intro} aria-labelledby="sf-does">
        <h2 id="sf-does" className={page.h2}>What it does</h2>
        {d.description ? (
          <p className={page.clamp}>{d.description} <ProvenanceChip provenance="CLAIMED" title={`Written by the operator in the ERC-8004 registry. ${BRAND.name} does not verify it.`} /></p>
        ) : <p className={styles.muted}>This agent published no description. <ProvenanceChip provenance="CLAIMED" /></p>}
        <dl className={page.sendGet}>
          <div><dt>You send</dt><dd>{send ?? `Whatever its agent card asks for. ${BRAND.name} has no task form for ${cat.toLowerCase()} yet.`}</dd></div>
          <div><dt>You get</dt><dd>An answer file, recorded by hash on chain when it delivers, and read here as a picture{testOf(d) ? ' with Marque’s own checks beside it' : ''}.</dd></div>
        </dl>
      </section>

      <WarrantCard test={shown} category={d.category} note={d.noStandard} />

      <dl className={page.three}>
        <div><dt>Delivered jobs</dt><dd>{t.available === false ? <span className={styles.muted}>unavailable</span> : <span className="num">{t.jobs.delivered}</span>}<ProvenanceChip provenance="ONCHAIN" /></dd></div>
        <div><dt>Median delivery</dt><dd>{delivery ? <span className="num">{delivery}</span> : <span className={styles.muted}>no samples yet</span>}<ProvenanceChip provenance="MEASURED" /></dd></div>
        <div><dt>Buyer rating</dt><dd>{t.verified.count > 0 && t.verified.averageStars !== null ? <><span className="num">{t.verified.averageStars.toFixed(1)}</span><span className={styles.muted}>from {t.verified.count}</span></> : <span className={styles.muted}>not rated yet</span>}<ProvenanceChip provenance="ONCHAIN" /></dd></div>
      </dl>

      <p className={page.termsLine}>
        <KeyRound aria-hidden="true" />
        {d.terms.priceLabel ? <>{d.terms.state === 'fresh' ? 'Live quote' : 'Last quote'} <b>{d.terms.priceLabel}</b> · </> : null}
        {d.disputeWindowSeconds ? `${days(d.disputeWindowSeconds)} to report a problem · ` : ''}refund if it does not deliver · service fee only, no access to your wallet. <a href={`${base}/terms`}>Terms</a>
      </p>

      {tenderHref ? (
        <div className={page.similar}>
          <div>
            <h3>Get quotes from similar agents</h3>
            <p>Send the same {cat.toLowerCase()} task to every agent that can answer it and compare their prices side by side before you choose.</p>
          </div>
          <a className="btn" href={tenderHref}>Get quotes</a>
        </div>
      ) : null}

      <section className={styles.section} aria-labelledby="sf-get">
        <h2 id="sf-get">Its latest answer</h2>
        {d.sample ? (
          <>
            <p className={styles.note}>
              Delivered for <a href={`/jobs/${d.sample.chainId}/${d.sample.jobId}`}>job {d.sample.jobId}</a>{d.sample.at ? ` on ${utcDay(d.sample.at)}` : ''}, a paid escrow job.{' '}
              {d.sample.manifest.matches ? <span className={styles.ok}><Check aria-hidden="true" />The file matches the hash it recorded on chain.</span> : d.sample.manifest.matches === false ? <span className={styles.bad}><X aria-hidden="true" />The file does not match the hash on chain.</span> : null}
            </p>
            <div className={styles.sample}>
              {lens?.manifest?.raw
                ? <ResultLens data={lens} agentName={d.name} content={d.sample.manifest.content} />
                : <DeliverableView category={d.category} content={d.sample.manifest.content!} />}
            </div>
          </>
        ) : (
          <div className={styles.emptyBox}>
            <p>No delivered answer is readable in this record yet.{d.isReference ? ' Run your own task free and see its real answer before you pay.' : ''}</p>
            {d.isReference ? <a className="btn btn--sm" href={tryHref}>Try free</a> : null}
          </div>
        )}
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ Evidence */

function Evidence({ d, tests, own, evidence, cat }: { d: Data; tests: StoreTest[]; own: StoreTest[]; evidence: AgentEvidence | null; cat: string }) {
  const runs = [...own].reverse()
  return (
    <>
      <section className={styles.section} aria-labelledby="ev-warrant">
        <h2 id="ev-warrant">Test history</h2>
        {runs.length ? (
          <>
            <p className={styles.note}>Every run of {own[0]!.testId} against this agent, oldest first. Each dot is one run at a pinned block. <ProvenanceChip provenance="TESTED" /></p>
            <ol className={page.timeline} aria-label="Test runs, oldest first" tabIndex={0}>
              {runs.map((r, i) => (
                <li key={i} data-pass={r.pass || undefined} data-error={r.error ? true : undefined} title={`${r.pass ? 'Passed' : r.error ? 'No answer' : `Failed on ${r.failedFields[0] ?? 'a field'}`}${r.ranAt ? `, ${utcStamp(r.ranAt)}` : ''}`}>
                  <span className={page.tlDot} aria-hidden="true" />
                  <span className={page.tlDate}>{r.ranAt && (i === 0 || utcDay(r.ranAt) !== (runs[i - 1]?.ranAt ? utcDay(runs[i - 1]!.ranAt!) : null)) ? utcDay(r.ranAt) : ''}</span>
                  <span className="sr-only">{r.pass ? 'passed' : r.error ? 'no answer' : `failed on ${r.failedFields[0] ?? 'a field'}`}</span>
                </li>
              ))}
            </ol>
          </>
        ) : <p className={styles.muted}>Not run against {testOf(d) ? <a href={`/standard/${testOf(d)}`}>{testOf(d)}</a> : `a ${BRAND.name} test`} yet. <Badge kind="untested" /></p>}
        {d.slug === 'tidemark' ? <p className={styles.muted}>This published test asks for a quoted net APR and a switching decision. Tidemark measures trailing realised yield instead; it has not passed this test, and the test does not certify its specialised method.</p> : null}
        {tests.length ? (
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Scrollable table">
            <table className={styles.table}>
              <thead><tr><th>Test</th><th>Result</th><th>Assertions</th><th>Block</th><th>Ran (UTC)</th></tr></thead>
              <tbody>
                {tests.slice(0, 10).map((x, i) => (
                  <tr key={i}>
                    <td className="mono"><a href={`/standard/${x.testId}`}>{x.testId}</a></td>
                    <td>{x.error ? 'no answer' : x.pass ? 'pass' : `fail: ${x.failedFields[0] ?? ''}`}</td>
                    <td className="mono">{x.diffs.length ? `${x.diffs.filter((y) => y.pass).length} of ${x.diffs.length}` : 'n/a'}</td>
                    <td className="mono">{x.block ?? 'not recorded'}</td>
                    <td className="mono">{x.ranAt ? utcStamp(x.ranAt) : 'not recorded'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tests.length > 10 ? <p className={styles.muted}>The newest 10 of {tests.length} runs shown; the timeline above has every one.</p> : null}
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="ev-probe">
        <h2 id="ev-probe">Answer rate and latency, 30 days</h2>
        {evidence && evidence.days.length ? <ProbeChart days={evidence.days} /> : <p className={styles.muted}>{evidence ? 'Marque has not probed this agent in the last 30 days.' : 'Probe history could not be read just now.'}</p>}
        <dl className={styles.facts}>
          <div><dt>Last discovery check</dt><dd>{d.lastProbe ? <>{d.lastProbe.detail?.startsWith('card readable') ? 'Agent card readable; task call not tested by this check' : d.lastProbe.detail ?? d.lastProbe.liveness}{d.lastProbe.latencyMs !== null ? ` in ${d.lastProbe.latencyMs} ms` : ''}, {ago(d.lastProbe.at)}</> : 'not probed yet'} <ProvenanceChip provenance="MEASURED" /></dd></div>
          <div><dt>Last 24 hours</dt><dd>{d.probes24h.total ? `${d.probes24h.reachable} of ${d.probes24h.total} discovery requests returned HTTP success.` : 'No observations in the last 24 hours.'} <ProvenanceChip provenance="MEASURED" /></dd></div>
        </dl>
        {evidence?.probes.length ? (
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Scrollable table">
            <table className={`${styles.table} ${page.probeLog}`}>
              <caption className={page.caption}>Probe log, newest first</caption>
              <thead><tr><th>When (UTC)</th><th>Result</th><th>HTTP</th><th>Latency</th><th>Detail</th></tr></thead>
              <tbody>
                {evidence.probes.slice(0, 12).map((p, i) => (
                  <tr key={i}>
                    <td className="mono">{utcStamp(p.at)}</td>
                    <td><span className={page.live} data-live={p.liveness === 'live' || undefined} />{p.liveness}</td>
                    <td className="mono">{p.status ?? 'n/a'}</td>
                    <td className="mono">{p.latencyMs !== null ? `${p.latencyMs} ms` : 'n/a'}</td>
                    <td className={page.detail}>{p.failure ?? p.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="ev-limits">
        <h2 id="ev-limits">What this shows and does not show</h2>
        {d.isReference ? <Limits label="About reference agents"><p>{BRAND.name} runs this reference agent to support {cat.toLowerCase()} supply. It is held to the same published test and ranked by the same rules as every third party. Availability, quotes and test results are dated observations.</p></Limits> : null}
        <Limits label="About the test">
          <ul>
            <li>The test checks facts with one right answer, at a pinned block, within published tolerances. It does not grade judgement.</li>
            <li>A pass is for the run shown, at its block. A warrant is retested every 72 hours and lapses if it is not.</li>
            <li>Historical identity tests may not be bound to the exact service you hire; the rail shows the live service.</li>
          </ul>
        </Limits>
        <Limits label="About probes">
          <ul>
            <li>Probes are sampled discovery requests from {BRAND.name}, not task success and not guaranteed uptime.</li>
            <li>A day without probes is shown as a gap, never as zero.</li>
            <li>Latency is the round trip of each probe, a single measurement, shown as the day’s median.</li>
          </ul>
        </Limits>
      </section>
    </>
  )
}

function ProbeChart({ days: rows }: { days: AgentEvidence['days'] }) {
  // Thirty slots ending today (UTC); a day without probes stays empty.
  const today = new Date(new Date().toISOString().slice(0, 10))
  const slots = Array.from({ length: 30 }, (_, i) => new Date(today.getTime() - (29 - i) * 86_400_000).toISOString().slice(0, 10))
  const by = new Map(rows.map((r) => [r.day, r]))
  const maxLat = Math.max(1, ...rows.map((r) => r.p50Ms ?? 0))
  const W = 600, H = 120, bw = W / 30
  const sum = rows.reduce((a, r) => ({ t: a.t + r.total, l: a.l + r.reachable }), { t: 0, l: 0 })
  return (
    <figure className={page.chart}>
      <svg viewBox={`0 0 ${W} ${H * 2 + 28}`} role="img" aria-label={`Answered ${sum.l} of ${sum.t} probes over 30 days. Median latency per day up to ${maxLat} ms.`} preserveAspectRatio="none">
        {[0, 0.5, 1].map((g) => <line key={g} x1={0} x2={W} y1={H - g * H} y2={H - g * H} className={page.grid} />)}
        {slots.map((day, i) => {
          const r = by.get(day)
          if (!r || !r.total) return <rect key={day} x={i * bw + 2} y={H - 2} width={bw - 4} height={2} className={page.gap} />
          const rate = r.reachable / r.total
          return <rect key={day} x={i * bw + 2} y={H - rate * H} width={bw - 4} height={Math.max(2, rate * H)} className={page.rate} data-low={rate < 0.9 || undefined}><title>{`${day}: ${r.reachable} of ${r.total} probes answered`}</title></rect>
        })}
        {slots.map((day, i) => {
          const r = by.get(day)
          if (!r || r.p50Ms === null) return null
          const h = (r.p50Ms / maxLat) * H
          return <rect key={`l${day}`} x={i * bw + 2} y={H * 2 + 28 - h} width={bw - 4} height={Math.max(2, h)} className={page.lat}><title>{`${day}: median ${r.p50Ms} ms`}</title></rect>
        })}
      </svg>
      <figcaption className={page.chartKey}>
        <span><i className={page.keyRate} />Answered (HTTP success), share of probes per day ({sum.t ? Math.round((sum.l / sum.t) * 100) : 0}% over the period)</span>
        <span><i className={page.keyLat} />Median latency per day, up to {maxLat.toLocaleString('en-US')} ms</span>
        <span><ProvenanceChip provenance="MEASURED" /></span>
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------------ Track record */

const QUICK: Record<string, Record<string, string>> = {
  answered: { yes: 'Answered the question', partly: 'Partly answered', no: 'Did not answer' },
  onTime: { yes: 'On time', no: 'Late' },
  hireAgain: { yes: 'Would hire again', no: 'Would not hire again' },
}

function TrackRecord({ d, net, acted }: { d: Data; net: string; acted: OutcomeView[] }) {
  const t = d.track
  return (
    <>
      <section className={styles.section} aria-labelledby="rec-jobs">
        <h2 id="rec-jobs">Jobs by state</h2>
        {t.available === false ? <p className={styles.note}>Indexed job and rating totals are unavailable. This is not evidence of zero activity.</p> : <>
          <p className={styles.note}>Jobs for {d.name} on {net}, read from chain. <ProvenanceChip provenance="ONCHAIN" /></p>
          <dl className={styles.counts}>
            {([['Escrow funded', t.jobs.funded], ['Delivered', t.jobs.delivered], ['Completed', t.jobs.settled], ['Refunded', t.jobs.refunded], ['Disputed', t.jobs.disputed]] as const).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>
            ))}
          </dl>
          {t.jobs.fromTeam > 0 ? <p className={styles.muted}>{t.jobs.fromTeam} of the funded jobs came from wallets on {BRAND.name}&apos;s published team list.</p> : null}
          <p className={styles.muted}>{t.jobs.refunded + t.jobs.disputed === 0 ? 'No refunds and no disputes recorded.' : `${t.jobs.refunded} refunded and ${t.jobs.disputed} disputed, each shown with its job below.`}</p>
        </>}
      </section>

      <section className={styles.section} aria-labelledby="rec-ratings">
        <h2 id="rec-ratings">Ratings</h2>
        <div className={styles.ratings}>
          <div className={styles.ratingBox}>
            <span className={styles.ratingKind}>Buyer-linked reviews <span>Exact job link</span></span>
            <Stars value={t.verified.averageStars} count={t.verified.count} label="buyer-linked reviews" />
            <p>Linked to a paid, delivered job. <ProvenanceChip provenance="ONCHAIN" /> <ProvenanceChip provenance="MEASURED" /></p>
          </div>
          <div className={styles.ratingBox} data-weak>
            <span className={styles.ratingKind}>All registry star ratings <span>Broader context</span></span>
            <Stars value={t.allFeedback.averageStars} count={t.allFeedback.count} label="registry ratings" />
            <p>Every star rating for this identity, from any source. <ProvenanceChip provenance="ONCHAIN" /></p>
          </div>
        </div>
        {d.reviews.length ? (
          <ul className={styles.reviews}>
            {d.reviews.map((r) => (
              <li key={r.tx}>
                <Stars value={r.stars} count={1} mine />
                <span className={styles.revWho}>
                  <AddressChip value={r.client} chainId={d.chainId} />
                  {r.verified ? <span className={styles.verified}>Exact {BRAND.name} job link</span> : r.team ? <span className={styles.teamTag}>Team wallet</span> : <span className={styles.registryTag}>Registry feedback</span>}
                </span>
                {r.quick ? (
                  <span className={page.quick}>
                    {(['answered', 'onTime', 'hireAgain'] as const).map((k) => r.quick![k] ? <span key={k} data-tone={r.quick![k] === 'yes' ? 'good' : r.quick![k] === 'partly' ? 'mid' : 'bad'}>{QUICK[k]![r.quick![k]] ?? r.quick![k]}</span> : null)}
                  </span>
                ) : null}
                {r.comment ? <p className={styles.revText}>{r.comment}</p> : null}
                <span className={styles.revMeta}>
                  {r.at ? utcDay(r.at) : null}
                  {r.jobId ? <> · <a href={`/jobs/${d.chainId}/${r.jobId}`}>job {r.jobId}</a></> : null}
                  {' · '}<a href={explorerTx(d.chainId, r.tx)} target="_blank" rel="noreferrer">on BscScan</a>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className={styles.muted}>No on-chain ratings for this agent yet.</p>}
        <p className={styles.note}><a href={`/api/v1/phase2/ratings/${d.tokenId}?format=evidence`}>Review and wallet evidence</a></p>
        <Limits>
          <ul>
            <li>Buyer-linked reviews match the exact feedback commitment, agent identity and funded delivered {BRAND.name} job. They exclude published team wallets.</li>
            <li>The broader registry score includes these and other ERC-8004 star ratings; do not add their counts.</li>
            <li>Reviews and distinct wallets do not establish independent people or current quality.</li>
            <li>Scope: all observations in this chain index, which may be incomplete. {t.computedAt ? <>Projection observed {t.computedAt}{t.sourceStale ? ' (cached, refresh pending)' : ''}.</> : 'Projection time unavailable.'}</li>
          </ul>
        </Limits>
      </section>

      <section className={styles.section} aria-labelledby="rec-acted">
        <h2 id="rec-acted">Acted on</h2>
        {acted.length ? (
          <>
            {(() => {
              const hfs = acted.filter((o) => o.action === 'repay' && o.after.healthFactor !== null && o.after.healthFactor <= 100).map((o) => o.after.healthFactor!).sort((a, b) => a - b)
              const targets = acted.filter((o) => o.target !== null).map((o) => o.target!).sort((a, b) => a - b)
              const med = (v: number[]) => (v.length ? v[Math.floor(v.length / 2)]! : null)
              return <p className={styles.note}>Acted on {acted.length} {acted.length === 1 ? 'time' : 'times'} on BSC mainnet.{hfs.length ? <> Health factor after acting: median {med(hfs)!.toFixed(2)}{targets.length ? <> against a median target of {med(targets)!.toFixed(2)}</> : null}.</> : null} <ProvenanceChip provenance="ONCHAIN" /></p>
            })()}
            <ul className={page.actedList}>
              {acted.map((o) => (
                <li key={o.id}>
                  <span className={page.actedWhat}>{o.action === 'repay' ? 'Repay' : 'Supply'} {o.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} {o.symbol}</span>
                  <span className="mono">{o.action === 'repay' ? `HF ${o.before.healthFactor === null ? 'n/a' : o.before.healthFactor > 100 ? 'over 100' : o.before.healthFactor.toFixed(3)} → ${o.after.healthFactor === null ? 'no debt' : o.after.healthFactor > 100 ? 'over 100' : o.after.healthFactor.toFixed(3)}` : `${o.before.market.supplied.toFixed(4)} → ${o.after.market.supplied.toFixed(4)} ${o.symbol}`}</span>
                  <span className={styles.muted}>block {Number(o.after.block).toLocaleString('en-US')} · <a href={`/jobs/${o.jobKey.replace(':', '/')}`}>job {o.jobKey.split(':')[1]}</a> · {o.txHashes.map((h) => <a key={h} href={explorerTx(56, h)} target="_blank" rel="noreferrer">tx </a>)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.muted}>Each row is a buyer who signed the action Marque rebuilt from this agent&apos;s answer. Before and after are chain reads; acting on an answer never implies Warranted or Hireable.</p>
          </>
        ) : <p className={styles.muted}>No buyer has acted on an answer from this agent through {BRAND.name} yet. When one does, the transaction and what changed on chain are listed here.</p>}
      </section>

      <section className={styles.section} aria-label="Recent activity">
        <AgentTerms agentId={d.agentId} provider={d.wallet} chainId={d.chainId} />
        <AgentActivity agentId={d.agentId} provider={d.wallet} chainId={d.chainId} />
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ Terms */

function Terms({ d, net }: { d: Data; net: string }) {
  const c = d.commerce
  const signed = c?.signatureEvidence === 'provider_signed' ? 'Signed by the agent wallet' : c?.signatureEvidence === 'identity_matched_unsigned' ? 'Unsigned, naming the registered agent wallet (identity-checked)' : 'Not established yet'
  return (
    <section className={styles.section} aria-labelledby="terms-h">
      <h2 id="terms-h">Terms</h2>
      <dl className={styles.facts}>
        <div><dt>Price on {net}</dt><dd>{d.terms.priceLabel ? <><b>{d.terms.priceLabel}</b> {d.terms.state === 'fresh' ? 'live quote' : `last quote${c?.quotedAt ? `, ${ago(c.quotedAt)}` : ''}, may have changed`}</> : 'It has not quoted through BNB Chain escrow.'} <ProvenanceChip provenance="MEASURED" /></dd></div>
        {d.chainId === 56 && d.testnetTokenId ? <div><dt>Practice lane</dt><dd>Also on BSC testnet with test tokens of no value. <a href={`/agents/97/${d.testnetTokenId}/terms`}>Its terms</a></dd></div> : null}
        <div><dt>Quote</dt><dd>{signed}. Each quote is for your task and expires; the hire sheet shows the countdown.</dd></div>
        <div><dt>What you approve</dt><dd>Exactly the quoted amount, into BNB Chain’s ERC-8183 escrow. Never an open-ended allowance.</dd></div>
        <div><dt>Review window</dt><dd>{d.disputeWindowSeconds ? `After delivery you have ${days(d.disputeWindowSeconds)} to report a problem before payment is released, read from the escrow policy.` : 'Read from BNB Chain’s escrow policy when you hire.'}</dd></div>
        <div><dt>If it does not deliver</dt><dd>Each job carries a deadline set when you open it. If nothing is delivered by then, you reclaim the full payment from the escrow contract.</dd></div>
        <div><dt>Refund rule</dt><dd>Refunds come from the escrow contract to the wallet that paid. {BRAND.name} never holds the payment.</dd></div>
      </dl>
      <p className={styles.perm} style={{ marginTop: 'var(--s-5)' }}><KeyRound aria-hidden="true" />Service fee only. No access to your wallet. It reads public chain data and answers; it cannot move anything you hold.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ Technical */

function Technical({ d, net, twins }: { d: Data; net: string; twins: Twin[] }) {
  const c = d.commerce
  const machine = d.chainId === 56 ? `/api/v1/agents/56/${d.tokenId}` : null
  return (
    <>
      <section className={styles.section} aria-labelledby="tech-id">
        <h2 id="tech-id">Identity</h2>
        <dl className={styles.facts}>
          <div><dt>ERC-8004 identity</dt><dd>#{d.tokenId} on {net} · {d.chainId}{d.chainId === 56 && d.testnetTokenId ? <> (and <a href={`/agents/97/${d.testnetTokenId}`}>#{d.testnetTokenId} on BSC testnet · 97</a>)</> : ''}</dd></div>
          {d.registry ? <div><dt>Identity contract</dt><dd><AddressChip value={d.registry} chainId={d.chainId} /> <a className={styles.ext} href={`https://${d.chainId === 97 ? 'testnet.' : ''}bscscan.com/token/${d.registry}?a=${d.tokenId}`} target="_blank" rel="noreferrer">token #{d.tokenId}<ArrowUpRight aria-hidden="true" /></a></dd></div> : null}
          {d.registerTx ? <div><dt>Registration</dt><dd><HashChip value={d.registerTx} chainId={d.chainId} /></dd></div> : d.registeredAt ? <div><dt>Registered</dt><dd>{utcDay(d.registeredAt)} <span className={styles.muted}>(the mint is on the token page)</span></dd></div> : null}
          {d.owner ? <div><dt>Owner</dt><dd><AddressChip value={d.owner} chainId={d.chainId} /></dd></div> : null}
          {d.wallet ? <div><dt>Agent wallet</dt><dd><AddressChip value={d.wallet} chainId={d.chainId} /> <span className={styles.muted}>paid on delivery; the signer of its quotes</span></dd></div> : null}
          <div><dt>Metadata last read</dt><dd>{d.metadataReadAt ? utcStamp(d.metadataReadAt) : 'not read yet'} <ProvenanceChip provenance="CLAIMED" /></dd></div>
        </dl>
        {d.wallet ? <p className={styles.muted}><a className={styles.ext} href={explorerAddress(d.chainId, d.wallet)} target="_blank" rel="noreferrer">Every transaction of this agent on BscScan<ArrowUpRight aria-hidden="true" /></a></p> : null}
        {!d.isReference ? <p className={styles.muted}><a className={styles.ext} href={`/builders/progress/${d.chainId}/${d.tokenId}`}>Set and Earn build checklist for this agent</a></p> : null}
      </section>

      <section className={styles.section} aria-labelledby="tech-ep">
        <h2 id="tech-ep">Endpoints and quotes</h2>
        <dl className={styles.facts}>
          <div><dt>Protocol</dt><dd>{c ? 'A2A for the task, BNB Chain ERC-8183 escrow for payment' : d.services.length ? d.services.map((x) => x.kind.toUpperCase()).join(', ') : 'No service declared'}</dd></div>
          {d.services.map((s) => <div key={`${s.kind}${s.endpoint}`}><dt>{s.kind.toUpperCase()} endpoint</dt><dd className={styles.code}>{s.endpoint}</dd></div>)}
          {d.endpoint && !d.services.some((s) => s.endpoint === d.endpoint) ? <div><dt>Quote endpoint</dt><dd className={styles.code}>{d.endpoint}</dd></div> : null}
          <div><dt>How Marque quotes it</dt><dd>{c ? `ERC-8183 negotiate on service ${c.serviceId}, ${c.signatureEvidence === 'provider_signed' ? 'provider-signed' : c.signatureEvidence === 'identity_matched_unsigned' ? 'unsigned and identity-checked' : 'signature not yet established'}` : 'Not quoted through escrow'}</dd></div>
          <div><dt>Last quote</dt><dd>{c?.quotedAt ? <>{c.priceLabel ?? (c.failure === 'expired_or_unproven' ? 'expired or unproven' : 'not accepted')}, {ago(c.quotedAt)}</> : 'never quoted'} <ProvenanceChip provenance="MEASURED" /></dd></div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="tech-orig">
        <h2 id="tech-orig">Originality</h2>
        {twins.length ? (
          <ul className={page.twins}>
            {twins.map((t) => <li key={t.agentId}>Answers match <a href={`/agents/${t.chainId}/${t.tokenId}/technical`}>{t.name ?? 'agent'} #{t.tokenId}</a> byte for byte on {t.cases} test cases.</li>)}
          </ul>
        ) : <p className={styles.muted}>No other agent returned identical answers to the same test cases.</p>}
        <p className={styles.muted}>An observation from {BRAND.name}&apos;s test runs, shown so buyers can judge. It never blocks a listing. <ProvenanceChip provenance="TESTED" /></p>
      </section>

      <section className={styles.section} aria-labelledby="tech-machine">
        <h2 id="tech-machine">For code</h2>
        <p className={styles.note}>The same facts as JSON, open to any client.{machine ? <> <a href={machine}>{machine}</a></> : null}</p>
        <pre className={page.code} tabIndex={0} role="region" aria-label="Example requests">{`${machine ? `curl -s https://marque.trade${machine}\n` : ''}curl -s "https://marque.trade/api/v1/terms?agents=${d.agentId}"`}</pre>
      </section>
    </>
  )
}
