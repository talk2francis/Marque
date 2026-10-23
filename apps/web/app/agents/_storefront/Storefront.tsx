import { ArrowUpRight, Check, KeyRound, ShieldCheck, X } from 'lucide-react'
import { BRAND, Limits, ProvenanceChip } from '@marque/ui'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AgentBrandHero } from '../../_components/AgentBrandHero'
import { AgentIdentityHero } from '../../_components/AgentIdentityHero'
import { agentBrand } from '../../../lib/agent-brand'
import { AddressChip, Badge, HashChip, Stars } from '../../_components/ui'
import { DeliverableView } from '../../jobs/[chainId]/[jobId]/Deliverable'
import { explorerAddress, explorerTx } from '../../../lib/network'
import { utcDay, utcStamp } from '../../../lib/time'
import type { Storefront as Data } from '../../../lib/storefront'
import styles from './storefront.module.css'
import { StorefrontTabs } from './StorefrontTabs'
import { AgentActivity } from './AgentActivity'
import { RailTerms } from './RailTerms'

const TENDER_CATEGORIES = new Set(['health_factor', 'yield', 'grid', 'rebalancing', 'security'])

/**
 * A storefront (DESIGN-SYSTEM.md 8.4): the same page for a Marque reference agent
 * and a third party. Right, a sticky purchase panel with one primary action. Left,
 * in order: what it does, what you get, track record, Marque verification, how it
 * works, permissions, identity and evidence. Registry text is CLAIMED and styled
 * weaker; what Marque measured, tested or read from chain says so.
 */

const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid trading', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const NET: Record<number, string> = { 56: 'BSC mainnet', 97: 'BSC testnet' }
const TEST: Record<string, string> = { yield: 'MCS-YIELD-1', grid: 'MCS-GRID-1', rebalancing: 'MCS-REB-1', health_factor: 'MCS-HF-1' }

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

export function Storefront({ d }: { d: Data }) {
  const c = d.commerce
  // Badges follow the same terms as the rail (invariant 41); the rail island re-reads them live.
  const hireable = d.terms.state === 'fresh'
  const net = NET[d.chainId] ?? 'BNB Smart Chain'
  const cat = d.category && d.category !== 'unclassified' ? CAT[d.category] ?? d.category : 'Unclassified'
  // The badge and verdict read the agent's own category test: the conformance worker runs
  // all four on a third party, and failing another category's test says nothing about it.
  // Every result still lists in the table below.
  const ownTest = d.category ? TEST[d.category] : undefined
  const own = d.category && d.category !== 'unclassified' ? d.tests.filter((t) => t.testId === ownTest) : d.tests
  const latest = own[0] ?? null
  const passed = own.find((t) => t.pass) ?? null
  const answersFree = d.isReference
  const t = d.track
  const delivery = secs(t.delivery.medianSeconds)
  const hireHref = `?hire=${encodeURIComponent(d.agentId)}${c?.serviceId == null ? '' : `&serviceId=${c.serviceId}`}`
  const tryHref = `${hireHref}&try=1`
  // First-party identity art only when this row is a Marque reference agent with a local brand.
  const brand = d.isReference ? agentBrand(d.agentId) : null

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
          <div><dt>Delivers in</dt><dd>{delivery ? <span title={`Median of ${t.delivery.samples} escrow-funded ${t.delivery.samples === 1 ? 'job' : 'jobs'}, from escrow funding to delivery.`}>{delivery}</span> : <span className={styles.muted}>{t.available === false ? 'Delivery evidence unavailable' : 'No delivery samples in this index'}</span>}</dd></div>
          <div><dt>Buyer rating</dt><dd>{t.available === false ? 'Rating evidence unavailable' : <Stars value={t.verified.averageStars} count={t.verified.count} label="buyer-linked reviews" />}</dd></div>
          <div><dt>Jobs delivered</dt><dd>{t.available === false ? 'Unavailable' : <><span className="num">{t.jobs.delivered}</span> <ProvenanceChip provenance="ONCHAIN" /></>}</dd></div>
        </dl>
      </RailTerms>
      {d.terms.state !== 'none' ? <p className={styles.authorise}><ShieldCheck aria-hidden="true" />What you authorise: exactly this price, into escrow. Nothing else.</p> : null}
      {d.category && TENDER_CATEGORIES.has(d.category) ? <p className={styles.authorise}><a href={`/tender?category=${d.category}${d.chainId === 97 ? '&lane=practice' : ''}`}>Compare with others: the same task, priced by every agent</a></p> : null}
    </aside>
  )

  return (
    <div className={styles.shell}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/register">Marketplace</a>
        <span aria-hidden="true">/</span>
        {d.category && CAT[d.category] ? <><a href={`/register/${d.category === 'health_factor' ? 'health-factor' : d.category}`}>{cat}</a><span aria-hidden="true">/</span></> : null}
        <span aria-current="page">{d.name}</span>
      </nav>

      <div className={styles.grid}>
        <div className={styles.main}>
          {brand ? (
            <AgentBrandHero brand={brand} agentId={d.agentId} category={d.category}>
              <h1 className={styles.title}>{d.name}</h1>
              <div className={styles.badges}>
                <Badge kind="network" label={net} />
                {hireable ? <Badge kind="hireable" /> : answersFree ? <Badge kind="preview" /> : null}
                {passed && passed === latest && passed.ranAt ? (Date.now() - Date.parse(passed.ranAt) > 72 * 3_600_000 ? <Badge kind="retest" /> : <Badge kind="warranted" date={passed.ranAt} />) : latest && !latest.pass ? <Badge kind="failed" test={latest.testId} field={latest.failedFields[0]} date={latest.ranAt ?? undefined} /> : <Badge kind="untested" />}
                {d.isReference ? <a href="/register#reference-agents" className={styles.refLink}><Badge kind="reference" /></a> : null}
              </div>
            </AgentBrandHero>
          ) : (
          <AgentIdentityHero agentId={d.agentId} tokenId={d.tokenId} name={d.name} category={d.category} imageUrl={d.imageUrl}>
              <h1 className={styles.title}>{d.name}</h1>
              <div className={styles.badges}>
                <Badge kind="network" label={net} />
                {hireable ? <Badge kind="hireable" /> : answersFree ? <Badge kind="preview" /> : null}
                {passed && passed === latest && passed.ranAt ? (Date.now() - Date.parse(passed.ranAt) > 72 * 3_600_000 ? <Badge kind="retest" /> : <Badge kind="warranted" date={passed.ranAt} />) : latest && !latest.pass ? <Badge kind="failed" test={latest.testId} field={latest.failedFields[0]} date={latest.ranAt ?? undefined} /> : <Badge kind="untested" />}
                {d.isReference ? <a href="/register#reference-agents" className={styles.refLink}><Badge kind="reference" /></a> : null}
              </div>
          </AgentIdentityHero>
          )}

          <StorefrontTabs activity={<AgentActivity agentId={d.agentId} provider={d.wallet} chainId={d.chainId} />}>
          {/* 1. What it does */}
          <section className={styles.section} aria-labelledby="sf-does">
            <h2 id="sf-does">What it does</h2>
            {d.description ? (
              <p className={styles.claimed}>{d.description} <ProvenanceChip provenance="CLAIMED" title={`Written by the operator in the ERC-8004 registry. ${BRAND.name} does not verify it.`} /></p>
            ) : <p className={styles.muted}>This agent published no description. <ProvenanceChip provenance="CLAIMED" /></p>}
            {d.isReference ? <p className={styles.note}>A {BRAND.name} reference agent, on the same rules as everyone. <a href="/register#reference-agents">Why {BRAND.name} runs its own agents</a></p> : null}
            {d.isReference ? <Limits><p>{BRAND.name} runs this reference agent to support {cat.toLowerCase()} supply. It is held to the same published test and ranked by the same rules as every third party. Availability, quotes and test results are dated observations.</p></Limits> : null}
          </section>

          {/* 2. What you get */}
          <section className={styles.section} aria-labelledby="sf-get">
            <h2 id="sf-get">What you get</h2>
            {d.sample ? (
              <>
                <p className={styles.note}>
                  The answer it delivered for its latest escrow-funded delivered job, <a href={`/jobs/${d.sample.chainId}/${d.sample.jobId}`}>job {d.sample.jobId}</a>
                  {d.sample.at ? ` on ${utcDay(d.sample.at)}` : ''}. {d.sample.manifest.matches ? <span className={styles.ok}><Check aria-hidden="true" />The file matches the hash it recorded on chain.</span> : d.sample.manifest.matches === false ? <span className={styles.bad}><X aria-hidden="true" />The file does not match the hash on chain.</span> : null}
                </p>
                <div className={styles.sample}><DeliverableView category={d.category} content={d.sample.manifest.content!} /></div>
              </>
            ) : (
              <div className={styles.emptyBox}>
                <p>No deliverable preview is available in this record yet.{answersFree ? ' Run your own task free and see its real answer before you pay.' : ''}</p>
                {answersFree ? <a className="btn btn--sm" href={tryHref}>Try free</a> : null}
              </div>
            )}
          </section>

          {/* 3. Track record */}
          <section className={styles.section} aria-labelledby="sf-track">
            <h2 id="sf-track">Track record</h2>
            {t.available === false ? <p className={styles.note}>Indexed job and rating totals are unavailable. This is not evidence of zero activity.</p> : <>
            <p className={styles.note}>Jobs for {d.name} on {net}, read from chain. <ProvenanceChip provenance="ONCHAIN" /></p>
            <dl className={styles.counts}>
              {([['Escrow funded', t.jobs.funded], ['Delivered', t.jobs.delivered], ['Completed', t.jobs.settled], ['Refunded', t.jobs.refunded], ['Disputed', t.jobs.disputed]] as const).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            {t.jobs.fromTeam > 0 ? <p className={styles.muted}>{t.jobs.fromTeam} of the funded jobs came from wallets on {BRAND.name}&apos;s published team list.</p> : null}
            <div className={styles.ratingIntro}>
              <h3>Ratings</h3>
              <p>{t.verified.count > 0 && t.verified.averageStars !== null
                ? <>{t.verified.averageStars.toFixed(1)} from {t.verified.count} {t.verified.count === 1 ? 'buyer' : 'buyers'} who paid for a delivered job here.</>
                : <>No buyer who paid for a delivered job here has rated it yet.</>}</p>
            </div>
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
            <p className={styles.note}><a href={`/api/v1/phase2/ratings/${d.tokenId}?format=evidence`}>Review and wallet evidence</a></p>
            <Limits>
              <ul>
                <li>Escrow funding, delivery and completion are distinct; completion alone does not prove payment release. Provider-wallet matches outside {BRAND.name} do not identify an exact service.</li>
                <li>Buyer-linked reviews match the exact feedback commitment, agent identity and funded delivered {BRAND.name} job. They exclude published team wallets.</li>
                <li>The broader registry score includes these and other ERC-8004 star ratings; do not add their counts.</li>
                <li>Reviews and distinct wallets do not establish independent people or current quality. Repeat reviews may come from the same wallet; common funding and operator overlap are unknown.</li>
                <li>The evidence view separates feedback records, wallets and jobs; it does not score independence.</li>
                <li>Scope: all observations in this chain index, which may be incomplete. {t.computedAt ? <>Projection observed {t.computedAt}{t.sourceStale ? ' (cached, refresh pending)' : ''}.</> : 'Projection time unavailable.'} Buyer and provider human independence remain unknown.</li>
              </ul>
            </Limits>
            </>}
            <h3 className={styles.reviewHeading}>Recent on-chain ratings</h3>
            <p className={styles.muted}>The last eight star ratings, newest first.</p>
            {d.reviews.length ? (
              <ul className={styles.reviews}>
                {d.reviews.map((r) => (
                  <li key={r.tx}>
                    <Stars value={r.stars} count={1} mine />
                    <span className={styles.revWho}>
                      <AddressChip value={r.client} chainId={d.chainId} />
                      {r.verified ? <span className={styles.verified}>Exact {BRAND.name} job link</span> : r.team ? <span className={styles.teamTag}>Team wallet</span> : <span className={styles.registryTag}>Registry feedback</span>}
                    </span>
                    {r.comment ? <p className={styles.revText}>{r.comment}</p> : null}
                    <span className={styles.revMeta}>
                      {r.at ? utcDay(r.at) : null}
                      {r.jobId ? <> · <a href={`/jobs/${d.chainId}/${r.jobId}`}>job {r.jobId}</a></> : null}
                      {' · '}<a href={explorerTx(d.chainId, r.tx)} target="_blank" rel="noreferrer">on BscScan</a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.muted}>No recent rating records are available in this view.</p>}
          </section>

          {/* 4. Marque verification */}
          <section className={styles.section} aria-labelledby="sf-verify">
            <h2 id="sf-verify">{BRAND.name} verification</h2>
            {latest ? (
              <>
                <div className={styles.verdict} data-pass={latest.pass || undefined}>
                  <span className={styles.verdictIco} aria-hidden="true">{latest.pass ? <Check /> : <X />}</span>
                  <div>
                    <p className={styles.verdictTitle}>
                      {latest.error ? 'Did not answer the test' : latest.pass ? 'Tested: passed' : 'Tested: failed'} · <a href={`/standard/${latest.testId}`} className="mono">{latest.testId}</a><span> · Historical identity test; exact-service Warrant binding may be unavailable.</span>
                      {latest.ranAt ? ` · ${utcDay(latest.ranAt)}` : ''}
                    </p>
                    <p className={styles.muted}>
                      {latest.pass
                        ? `Every checked field matched the answer ${BRAND.name} computed itself from chain state at a pinned block, within the published tolerance.`
                        : latest.error
                          ? `The endpoint did not return an answer ${BRAND.name} could grade. The result is kept, not hidden.`
                          : `Failed ${latest.failedFields.length} checked ${latest.failedFields.length === 1 ? 'field' : 'fields'}: ${latest.failedFields.join(', ') || 'see the case'}. Hire is not gated on the test; the result is shown so you can decide.`}
                      {' '}<ProvenanceChip provenance="TESTED" />
                    </p>
                  </div>
                </div>
                {d.slug === 'tidemark' && latest.testId === 'MCS-YIELD-1' ? <p className={styles.muted}>This published test asks for a quoted net APR and a switching decision. Tidemark measures trailing realised yield instead; it has not passed this test. Its result is still shown, but the test does not certify its specialised method.</p> : null}
                {d.tests.length > 1 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Test</th><th>Result</th><th>Block</th><th>Ran (UTC)</th></tr></thead>
                      <tbody>
                        {d.tests.map((x, i) => (
                          <tr key={i}>
                            <td className="mono"><a href={`/standard/${x.testId}`}>{x.testId}</a></td>
                            <td>{x.error ? 'no answer' : x.pass ? 'pass' : `fail: ${x.failedFields[0] ?? ''}`}</td>
                            <td className="mono">{x.block ?? 'not recorded'}</td>
                            <td className="mono">{x.ranAt ? utcStamp(x.ranAt) : 'not recorded'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <p className={styles.muted}>
                Not run against {d.category && TEST[d.category] ? <a href={`/standard/${TEST[d.category]}`}>{TEST[d.category]}</a> : `a ${BRAND.name} test`} yet. A warrant is dated and earned, never assumed. <Badge kind="untested" />
              </p>
            )}
          </section>

          {/* 5. How it works */}
          <section className={styles.section} aria-labelledby="sf-how">
            <h2 id="sf-how">How it works</h2>
            <dl className={styles.facts}>
              <div><dt>Protocol</dt><dd>{c ? 'A2A for the task, BNB Chain ERC-8183 escrow for payment' : d.services.length ? d.services.map((x) => x.kind.toUpperCase()).join(', ') : 'No service declared'}</dd></div>
              {d.endpoint ? <div><dt>Endpoint</dt><dd className={styles.code}>{d.endpoint}</dd></div> : d.services[0] ? <div><dt>Endpoint</dt><dd className={styles.code}>{d.services[0].endpoint}</dd></div> : null}
              <div><dt>Price</dt><dd>{c ? 'Request a quote for your task. The response shows its expiry and whether it is provider-signed or unsigned with identity checks. You approve exactly the displayed amount.' : 'It has not quoted through BNB Chain escrow.'}</dd></div>
              <div><dt>Review window</dt><dd>{d.disputeWindowSeconds ? `After delivery you have ${days(d.disputeWindowSeconds)} to report a problem before payment is released (read from BNB Chain's escrow policy).` : 'Read from BNB Chain\'s escrow policy when you hire.'}</dd></div>
              <div><dt>If it does not deliver</dt><dd>Each job carries a deadline set when you open it. If nothing is delivered by then, you reclaim the full payment from the escrow contract.</dd></div>
            </dl>
          </section>

          {/* 6. Permissions */}
          <section className={styles.section} aria-labelledby="sf-perm">
            <h2 id="sf-perm">Permissions</h2>
            <p className={styles.perm}><KeyRound aria-hidden="true" />Service fee only. This agent gets no access to your wallet or funds. It reads public chain data and answers; it cannot move anything you hold.</p>
          </section>

          {/* 7. Identity and evidence */}
          <section className={styles.section} aria-labelledby="sf-id">
            <h2 id="sf-id">Identity and evidence</h2>
            <dl className={styles.facts}>
              <div><dt>ERC-8004 identity</dt><dd>#{d.tokenId} on {net} · {d.chainId}{d.chainId === 56 && d.testnetTokenId ? <> (and <a href={`/agents/97/${d.testnetTokenId}`}>#{d.testnetTokenId} on BSC testnet · 97</a>)</> : ''}</dd></div>
              {d.registry ? <div><dt>Identity contract</dt><dd><AddressChip value={d.registry} chainId={d.chainId} /> <a className={styles.ext} href={`https://${d.chainId === 97 ? 'testnet.' : ''}bscscan.com/token/${d.registry}?a=${d.tokenId}`} target="_blank" rel="noreferrer">token #{d.tokenId}<ArrowUpRight aria-hidden="true" /></a></dd></div> : null}
              {d.registerTx ? <div><dt>Registration</dt><dd><HashChip value={d.registerTx} chainId={d.chainId} /></dd></div> : d.registeredAt ? <div><dt>Registered</dt><dd>{utcDay(d.registeredAt)} <span className={styles.muted}>(the mint is on the token page)</span></dd></div> : null}
              {d.owner ? <div><dt>Owner</dt><dd><AddressChip value={d.owner} chainId={d.chainId} /></dd></div> : null}
              {d.wallet ? <div><dt>Agent wallet</dt><dd><AddressChip value={d.wallet} chainId={d.chainId} /> <span className={styles.muted}>paid on delivery; the signer of its quotes</span></dd></div> : null}
              <div><dt>Metadata last read</dt><dd>{d.metadataReadAt ? `${utcStamp(d.metadataReadAt)} UTC` : 'not read yet'} <ProvenanceChip provenance="CLAIMED" /></dd></div>
              <div><dt>Last discovery check</dt><dd>{d.lastProbe ? <>{d.lastProbe.detail?.startsWith('card readable') ? 'Agent card readable; task call not tested by this check' : d.lastProbe.detail ?? d.lastProbe.liveness}{d.lastProbe.latencyMs !== null ? ` in ${d.lastProbe.latencyMs} ms` : ''}, {ago(d.lastProbe.at)}</> : 'not probed yet'} <ProvenanceChip provenance="MEASURED" /></dd></div>
              <div><dt>Endpoint observations, 24 h</dt><dd>{d.probes24h.total ? `${d.probes24h.reachable} of ${d.probes24h.total} discovery requests returned HTTP success. This is sampled reachability across services, not task success or guaranteed uptime.` : 'No observations in the last 24 hours.'} <ProvenanceChip provenance="MEASURED" /></dd></div>
              <div><dt>Last quote</dt><dd>{c?.quotedAt ? <>{c.priceLabel ?? (c.failure === 'expired_or_unproven' ? 'expired or unproven' : 'not accepted')}, {ago(c.quotedAt)}{c.signed ? ', signed by the agent wallet' : c.signed === false ? ', plain quote naming the agent wallet' : ''}</> : 'never quoted'} <ProvenanceChip provenance="MEASURED" /></dd></div>
            </dl>
            {d.wallet ? <p className={styles.muted}><a className={styles.ext} href={explorerAddress(d.chainId, d.wallet)} target="_blank" rel="noreferrer">Every transaction of this agent on BscScan<ArrowUpRight aria-hidden="true" /></a></p> : null}
          </section>
          </StorefrontTabs>
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
