import { ArrowUpRight, Check, KeyRound, ShieldCheck, X } from 'lucide-react'
import { ProvenanceChip } from '@marque/ui'
import { AgentAvatar } from '../../_components/AgentAvatar'
import { AgentBrandHero } from '../../_components/AgentBrandHero'
import { agentBrand } from '../../../lib/agent-brand'
import { AddressChip, Badge, HashChip, Stars } from '../../_components/ui'
import { DeliverableView } from '../../jobs/[chainId]/[jobId]/Deliverable'
import { explorerAddress, explorerTx } from '../../../lib/network'
import { utcDay, utcStamp } from '../../../lib/time'
import type { Storefront as Data } from '../../../lib/storefront'
import styles from './storefront.module.css'

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
  const hireable = c !== null && (c.state === 'hireable' || c.state === 'settleable')
  const net = NET[c?.chainId ?? 56] ?? 'BNB Smart Chain'
  const cat = d.category && d.category !== 'unclassified' ? CAT[d.category] ?? d.category : 'Unclassified'
  const latest = d.tests[0] ?? null
  const passed = d.tests.find((t) => t.pass) ?? null
  const answersFree = d.endpoint !== null || d.isReference || (d.lastProbe?.liveness === 'live' && d.services.some((x) => x.kind === 'a2a'))
  const t = d.track
  const delivery = secs(t.delivery.medianSeconds)
  const hireHref = `?hire=${encodeURIComponent(d.agentId)}`
  const tryHref = `?hire=${encodeURIComponent(d.agentId)}&try=1`
  const quoteAge = ago(c?.quotedAt ?? null)
  // First-party identity art only when this row is a Marque reference agent with a local brand.
  const brand = d.isReference ? agentBrand(d.agentId) : null

  const panel = (
    <aside className={styles.panel} aria-label={`Hire ${d.name}`}>
      <div className={styles.panelHead}>
        <AgentAvatar id={d.agentId} category={d.category} reference={d.isReference} imageUrl={d.imageUrl} size={44} />
        <div>
          <p className={styles.panelName}>{d.name}</p>
          <p className={styles.panelWhere}>{cat} · {net}</p>
        </div>
      </div>
      <div className={styles.price}>
        {c?.priceLabel ? (
          <>
            <span className={styles.priceNum}><span className="num">{c.priceLabel.split(' ')[0]}</span> <span className={styles.priceTok}>{c.priceLabel.split(' ')[1]}</span></span>
            <span className={styles.priceSrc}>
              <span className={styles.liveDot} aria-hidden="true" data-live={hireable || undefined} />
              {hireable ? `Live quote ${quoteAge ?? ''}` : `Last quote ${quoteAge ?? ''}`}
              <ProvenanceChip provenance="MEASURED" title="A quote this agent signed for Marque's price check. Hiring asks it for a fresh one on your task." />
            </span>
          </>
        ) : (
          <span className={styles.priceNone}>No live price. {c?.failure ? 'Its last price request failed.' : 'It has not quoted through BNB Chain escrow.'}</span>
        )}
      </div>
      <dl className={styles.panelFacts}>
        <div><dt>Delivers in</dt><dd>{delivery ? <span title={`Median of ${t.delivery.samples} paid ${t.delivery.samples === 1 ? 'job' : 'jobs'}, from payment to delivery.`}>{delivery}</span> : <span className={styles.muted}>No paid jobs yet</span>}</dd></div>
        <div><dt>Verified buyers</dt><dd><Stars value={t.verified.averageStars} count={t.verified.count} label="verified" /></dd></div>
        <div><dt>Jobs delivered</dt><dd><span className="num">{t.jobs.delivered}</span> <ProvenanceChip provenance="ONCHAIN" /></dd></div>
      </dl>
      <div className={styles.panelActions}>
        {hireable ? <a className="btn btn--primary btn--block btn--lg" href={hireHref}>{d.name.length <= 22 ? `Hire ${d.name}` : "Hire this agent"}</a> : null}
        {answersFree ? <a className={`btn btn--block ${hireable ? '' : 'btn--lg'}`} href={tryHref}>Try free</a> : null}
        {!hireable && !answersFree ? <p className={styles.muted}>This agent cannot be hired or tried right now. The record below says why.</p> : null}
      </div>
      {hireable ? <p className={styles.authorise}><ShieldCheck aria-hidden="true" />What you authorise: exactly this price, into escrow. Nothing else.</p> : null}
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
          <header className={styles.head}>
            <AgentAvatar id={d.agentId} category={d.category} reference={d.isReference} imageUrl={d.imageUrl} size={64} />
            <div className={styles.headTxt}>
              <h1 className={styles.title}>{d.name}</h1>
              <div className={styles.badges}>
                <Badge kind="network" label={net} />
                {hireable ? <Badge kind="hireable" /> : answersFree ? <Badge kind="preview" /> : null}
                {passed && passed === latest && passed.ranAt ? (Date.now() - Date.parse(passed.ranAt) > 72 * 3_600_000 ? <Badge kind="retest" /> : <Badge kind="warranted" date={passed.ranAt} />) : latest && !latest.pass ? <Badge kind="failed" test={latest.testId} field={latest.failedFields[0]} date={latest.ranAt ?? undefined} /> : <Badge kind="untested" />}
                {d.isReference ? <a href="/register#reference-agents" className={styles.refLink}><Badge kind="reference" /></a> : null}
              </div>
            </div>
          </header>
          )}

          {/* 1. What it does */}
          <section className={styles.section} aria-labelledby="sf-does">
            <h2 id="sf-does">What it does</h2>
            {d.description ? (
              <p className={styles.claimed}>{d.description} <ProvenanceChip provenance="CLAIMED" title="Written by the operator in the ERC-8004 registry. Marque does not verify it." /></p>
            ) : <p className={styles.muted}>This agent published no description. <ProvenanceChip provenance="CLAIMED" /></p>}
            {d.isReference ? <p className={styles.note}>Marque runs this agent so {cat.toLowerCase()} always has a working seller. It is held to the same published test and ranked by the same rules as every third party. <a href="/register#reference-agents">Why Marque runs its own agents</a></p> : null}
          </section>

          {/* 2. What you get */}
          <section className={styles.section} aria-labelledby="sf-get">
            <h2 id="sf-get">What you get</h2>
            {d.sample ? (
              <>
                <p className={styles.note}>
                  The answer it delivered for its latest paid job, <a href={`/jobs/${d.sample.chainId}/${d.sample.jobId}`}>job {d.sample.jobId}</a>
                  {d.sample.at ? ` on ${utcDay(d.sample.at)}` : ''}. {d.sample.manifest.matches ? <span className={styles.ok}><Check aria-hidden="true" />The file matches the hash it recorded on chain.</span> : d.sample.manifest.matches === false ? <span className={styles.bad}><X aria-hidden="true" />The file does not match the hash on chain.</span> : null}
                </p>
                <div className={styles.sample}><DeliverableView category={d.category} content={d.sample.manifest.content!} /></div>
              </>
            ) : (
              <div className={styles.emptyBox}>
                <p>No public deliverable from this agent yet.{answersFree ? ' Run your own task free and see its real answer before you pay.' : ''}</p>
                {answersFree ? <a className="btn btn--sm" href={tryHref}>Try free</a> : null}
              </div>
            )}
          </section>

          {/* 3. Track record */}
          <section className={styles.section} aria-labelledby="sf-track">
            <h2 id="sf-track">Track record</h2>
            <p className={styles.note}>Every job paid to {d.name}&apos;s wallet through BNB Chain&apos;s ERC-8183 escrow on {net}, read from chain events. <ProvenanceChip provenance="ONCHAIN" /></p>
            <dl className={styles.counts}>
              {([['Paid', t.jobs.funded], ['Delivered', t.jobs.delivered], ['Settled', t.jobs.settled], ['Refunded', t.jobs.refunded], ['Disputed', t.jobs.disputed]] as const).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            {t.jobs.fromTeam > 0 ? <p className={styles.muted}>{t.jobs.fromTeam} of the paid jobs came from wallets on Marque&apos;s published team list.</p> : null}
            <div className={styles.ratings}>
              <div className={styles.ratingBox}>
                <span className="t-label">Verified buyers</span>
                <Stars value={t.verified.averageStars} count={t.verified.count} label="verified" />
                <p>Wallets that paid this agent through a Marque hire that was delivered. Team wallets never count. <ProvenanceChip provenance="ONCHAIN" /></p>
              </div>
              <div className={styles.ratingBox} data-weak>
                <span className="t-label">All registry feedback</span>
                <Stars value={t.allFeedback.averageStars} count={t.allFeedback.count} label="ratings" />
                <p>Every ERC-8004 rating written for this identity. Anyone can write one, so it is never merged into the number beside it. <ProvenanceChip provenance="CLAIMED" /></p>
              </div>
            </div>
            {d.reviews.length ? (
              <ul className={styles.reviews}>
                {d.reviews.map((r) => (
                  <li key={r.tx}>
                    <Stars value={r.stars} count={1} mine />
                    <span className={styles.revWho}>
                      <AddressChip value={r.client} chainId={56} />
                      {r.verified ? <span className={styles.verified}>verified buyer</span> : r.team ? <span className={styles.teamTag}>team wallet</span> : null}
                    </span>
                    {r.comment ? <p className={styles.revText}>{r.comment}</p> : null}
                    <span className={styles.revMeta}>
                      {r.at ? utcDay(r.at) : null}
                      {r.jobId ? <> · <a href={`/jobs/56/${r.jobId}`}>job {r.jobId}</a></> : null}
                      {' · '}<a href={explorerTx(56, r.tx)} target="_blank" rel="noreferrer">on BscScan</a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.muted}>No ratings on chain yet.</p>}
          </section>

          {/* 4. Marque verification */}
          <section className={styles.section} aria-labelledby="sf-verify">
            <h2 id="sf-verify">Marque verification</h2>
            {latest ? (
              <>
                <div className={styles.verdict} data-pass={latest.pass || undefined}>
                  <span className={styles.verdictIco} aria-hidden="true">{latest.pass ? <Check /> : <X />}</span>
                  <div>
                    <p className={styles.verdictTitle}>
                      {latest.error ? 'Did not answer the test' : latest.pass ? 'Warranted' : 'Tested: failed'} · <a href={`/standard/${latest.testId}`} className="mono">{latest.testId}</a>
                      {latest.ranAt ? ` · ${utcDay(latest.ranAt)}` : ''}
                    </p>
                    <p className={styles.muted}>
                      {latest.pass
                        ? 'Every checked field matched the answer Marque computed itself from chain state at a pinned block, within the published tolerance.'
                        : latest.error
                          ? 'The endpoint did not return an answer Marque could grade. The result is kept, not hidden.'
                          : `Failed ${latest.failedFields.length} checked ${latest.failedFields.length === 1 ? 'field' : 'fields'}: ${latest.failedFields.join(', ') || 'see the case'}. Hire is not gated on the test; the result is shown so you can decide.`}
                      {' '}<ProvenanceChip provenance="TESTED" />
                    </p>
                  </div>
                </div>
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
                Not run against {d.category && TEST[d.category] ? <a href={`/standard/${TEST[d.category]}`}>{TEST[d.category]}</a> : 'a Marque test'} yet. A warrant is dated and earned, never assumed. <Badge kind="untested" />
              </p>
            )}
          </section>

          {/* 5. How it works */}
          <section className={styles.section} aria-labelledby="sf-how">
            <h2 id="sf-how">How it works</h2>
            <dl className={styles.facts}>
              <div><dt>Protocol</dt><dd>{c ? 'A2A for the task, BNB Chain ERC-8183 escrow for payment' : d.services.length ? d.services.map((x) => x.kind.toUpperCase()).join(', ') : 'No service declared'}</dd></div>
              {d.endpoint ? <div><dt>Endpoint</dt><dd className={styles.code}>{d.endpoint}</dd></div> : d.services[0] ? <div><dt>Endpoint</dt><dd className={styles.code}>{d.services[0].endpoint}</dd></div> : null}
              <div><dt>Price</dt><dd>{c ? 'The agent signs a quote for your exact task, valid for up to 15 minutes. You pay exactly that amount, never more.' : 'It has not quoted through BNB Chain escrow.'}</dd></div>
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
              <div><dt>ERC-8004 identity</dt><dd>#{d.tokenId} on BSC mainnet · 56{d.testnetTokenId ? ` (and #${d.testnetTokenId} on BSC testnet · 97)` : ''}</dd></div>
              {d.registry ? <div><dt>Identity contract</dt><dd><AddressChip value={d.registry} chainId={56} /> <a className={styles.ext} href={`https://bscscan.com/token/${d.registry}?a=${d.tokenId}`} target="_blank" rel="noreferrer">token #{d.tokenId}<ArrowUpRight aria-hidden="true" /></a></dd></div> : null}
              {d.registerTx ? <div><dt>Registration</dt><dd><HashChip value={d.registerTx} chainId={56} /></dd></div> : d.registeredAt ? <div><dt>Registered</dt><dd>{utcDay(d.registeredAt)} <span className={styles.muted}>(the mint is on the token page)</span></dd></div> : null}
              {d.owner ? <div><dt>Owner</dt><dd><AddressChip value={d.owner} chainId={56} /></dd></div> : null}
              {d.wallet ? <div><dt>Agent wallet</dt><dd><AddressChip value={d.wallet} chainId={56} /> <span className={styles.muted}>paid on delivery; the signer of its quotes</span></dd></div> : null}
              <div><dt>Metadata last read</dt><dd>{d.metadataReadAt ? `${utcStamp(d.metadataReadAt)} UTC` : 'not read yet'} <ProvenanceChip provenance="CLAIMED" /></dd></div>
              <div><dt>Last discovery check</dt><dd>{d.lastProbe ? <>{d.lastProbe.detail?.startsWith('card readable') ? 'Agent card readable; task call not tested by this check' : d.lastProbe.detail ?? d.lastProbe.liveness}{d.lastProbe.latencyMs !== null ? ` in ${d.lastProbe.latencyMs} ms` : ''}, {ago(d.lastProbe.at)}</> : 'not probed yet'} <ProvenanceChip provenance="MEASURED" /></dd></div>
              <div><dt>Endpoint observations, 24 h</dt><dd>{d.probes24h.total ? `${d.probes24h.reachable} of ${d.probes24h.total} discovery requests returned HTTP success. This is sampled reachability across services, not task success or guaranteed uptime.` : 'No observations in the last 24 hours.'} <ProvenanceChip provenance="MEASURED" /></dd></div>
              <div><dt>Last quote</dt><dd>{c?.quotedAt ? <>{c.priceLabel ?? 'failed'}, {ago(c.quotedAt)}{c.signed ? ', signed by the agent wallet' : c.signed === false ? ', plain quote naming the agent wallet' : ''}</> : 'never quoted'} <ProvenanceChip provenance="MEASURED" /></dd></div>
            </dl>
            {d.wallet ? <p className={styles.muted}><a className={styles.ext} href={explorerAddress(56, d.wallet)} target="_blank" rel="noreferrer">Every transaction of this agent on BscScan<ArrowUpRight aria-hidden="true" /></a></p> : null}
          </section>
        </div>

        <div className={styles.side}>{panel}</div>
      </div>

      {/* Under 1024: the purchase panel becomes a bar with price and the one action. */}
      <div className={styles.bar}>
        <span className={styles.barPrice}>
          {c?.priceLabel ? <><b className="num">{c.priceLabel}</b><span>{hireable ? 'live quote' : 'last quote'}</span></> : <span>{d.name}</span>}
        </span>
        {hireable ? <a className="btn btn--primary" href={hireHref}>Hire</a> : answersFree ? <a className="btn" href={tryHref}>Try free</a> : null}
      </div>
    </div>
  )
}
