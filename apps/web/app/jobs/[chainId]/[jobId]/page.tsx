import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { Check, X } from 'lucide-react'
import { db } from '@marque/db'
import {
  agenticCommerceAbi, assetAt, chainClient, disputeWindowSeconds, formatAmount, isSupportedChain, network, questJob, timeline, type ChainId,
} from '@marque/commerce'
import { ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import { AgentAvatar } from '../../../_components/AgentAvatar'
import { AddressChip, Badge, Disclosure, HashChip } from '../../../_components/ui'
import { network as net } from '../../../../lib/network'
import { utcStamp } from '../../../../lib/time'
import { DeliverableView } from './Deliverable'
import { readManifest } from '../../../../lib/manifest'
import { JobActions } from './JobActions'
import styles from './job.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const { jobId } = await params
  return { title: `Job ${jobId}`, robots: { index: false } }
}

const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }

type Ev = { name: string; tx: string; at: string | null; block: number; args: Record<string, unknown> }

/** Plain names for chain events (DESIGN-SYSTEM.md 8.6), never the contract's own. */
const EVENT_LABEL: Record<string, string> = {
  JobCreated: 'Opened', JobRegistered: 'Protection attached', BudgetSet: 'Price locked', JobFunded: 'Paid into escrow',
  JobSubmitted: 'Delivered', Disputed: 'Problem reported', JobSettled: 'Settled by the router', JobCompleted: 'Settled',
  PaymentReleased: 'Paid to the agent', JobRejected: 'Cancelled', JobExpired: 'Deadline passed', Refunded: 'Refunded to you',
}

function headline(state: string, agent: string, price: string, reviewEnds: number | null, refundFrom: number | null, late: boolean) {
  switch (state) {
    case 'OPEN': return { title: 'Finish paying to start the job', body: `The job is open on BNB Chain's escrow but not paid. Nothing has been charged. Finish paying, or cancel it.` }
    case 'FUNDED': return late && refundFrom
      ? { title: `${agent} has not delivered`, body: `The delivery deadline has passed. You can reclaim your ${price} from ${utcStamp(refundFrom * 1000)}.` }
      : { title: `${agent} is working`, body: `Your ${price} is held in BNB Chain's ERC-8183 escrow until ${agent} delivers.` }
    case 'SUBMITTED': return { title: 'Delivered', body: reviewEnds ? `Payment releases to ${agent} on ${utcStamp(reviewEnds * 1000)} unless you report a problem before then.` : `Payment releases to ${agent} after the review window.` }
    case 'DISPUTED': return { title: 'You reported a problem', body: 'Independent voters decide. If they reject the delivery you are refunded; the payment stays in escrow until then.' }
    case 'COMPLETED': case 'PAID': return { title: `Done. ${agent} was paid.`, body: 'The review window closed with no dispute and the escrow released the payment.' }
    case 'EXPIRED': return { title: `Reclaim your ${price}`, body: `${agent} did not deliver in time. The payment is yours to take back.` }
    case 'REFUNDED': return { title: 'Refunded to your wallet', body: `The ${price} went back to the wallet that paid.` }
    case 'REJECTED': return { title: 'Rejected', body: 'The delivery was rejected and the payment is refundable to you.' }
    case 'CANCELLED': return { title: 'Cancelled', body: 'The job was closed before payment. Nothing was charged.' }
    default: return { title: 'Job', body: '' }
  }
}

export default async function JobRoom({ params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const { chainId: c, jobId } = await params
  const chainId = Number(c)
  if (!isSupportedChain(chainId) || !/^\d{1,20}$/.test(jobId)) notFound()
  const cid = chainId as ChainId
  const [job, windowS] = await Promise.all([questJob(cid, jobId).catch(() => null), disputeWindowSeconds(cid).catch(() => null)])

  // A job Marque has not indexed (opened elsewhere) still gets the chain's own view.
  const onchain = job ? null : await chainClient(cid).readContract({ address: network(cid).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] })
    .catch(() => null) as null | { id: bigint; client: string; provider: string; budget: bigint; expiredAt: bigint; status: number; submittedAt: bigint; deliverable: string }
  if (!job && (!onchain || onchain.id === 0n)) notFound()

  const [intent] = (await db().execute(sql`
    select description, price_raw, token, category from hire_intent where chain_id = ${chainId} and job_id = ${jobId} limit 1`)) as unknown as Array<Record<string, unknown>>

  const state = job?.state ?? (['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const)[onchain!.status] ?? 'OPEN'
  const events: Ev[] = (job?.events ?? []) as Ev[]
  const agentName = job?.agent?.name ?? 'the agent'
  const category = job?.agent?.category ?? (intent?.['category'] ? String(intent['category']) : null)
  const rawToken = job?.token ?? (onchain ? (() => { const a = assetAt(cid, network(cid).kernelToken); return a ? { address: a.address, symbol: a.symbol, decimals: a.decimals } : null })() : null)
  const token = rawToken && rawToken.address && rawToken.symbol && rawToken.decimals !== null && rawToken.decimals !== undefined
    ? { address: rawToken.address, symbol: rawToken.symbol, decimals: rawToken.decimals } : null
  const amountRaw = job?.amount ?? (onchain ? onchain.budget.toString() : null) ?? (intent?.['price_raw'] ? String(intent['price_raw']) : null)
  const priceLabel = amountRaw && token ? `${formatAmount(BigInt(amountRaw), token.decimals)} ${token.symbol}` : intent?.['price_raw'] && token ? `${formatAmount(BigInt(String(intent['price_raw'])), token.decimals)} ${token.symbol}` : null
  const expiredAt = job?.expiresAt ? Math.floor(Date.parse(job.expiresAt) / 1000) : onchain ? Number(onchain.expiredAt) : null
  const submittedEv = events.find((e) => e.name === 'JobSubmitted')
  const submittedAt = submittedEv?.at ? Math.floor(Date.parse(submittedEv.at) / 1000) : onchain && onchain.submittedAt > 0n ? Number(onchain.submittedAt) : null
  const now = Math.floor(Date.now() / 1000)
  const t = windowS === null ? null : timeline({ state: state as never, expiredAt }, submittedAt, windowS, now)
  const head = headline(state, agentName, priceLabel ?? 'payment', t?.reviewEndsAt ?? null, t?.refundFrom ?? null, Boolean(t?.awaitingExpiry))
  const onchainHash = job?.deliverable?.hash ?? (onchain && onchain.submittedAt > 0n ? onchain.deliverable : null)
  const manifest = job?.deliverable?.url ? await readManifest(job.deliverable.url, onchainHash) : null
  // The on-chain description is the signed negotiation (JSON); the buyer's words are its `task`.
  const asked = (() => {
    const d = intent?.['description'] ? String(intent['description']) : null
    if (!d) return null
    try { const j = JSON.parse(d) as { task?: unknown }; return typeof j.task === 'string' ? j.task : null } catch { return d.split('\n')[0] ?? null }
  })()
  const registered = events.some((e) => e.name === 'JobRegistered')
  const budgetSet = events.some((e) => e.name === 'BudgetSet')
  const tokenMeta = token ? assetAt(cid, token.address) : null

  // Timeline: what happened (from chain events), then what is still to come.
  const done = events.filter((e) => EVENT_LABEL[e.name] && e.name !== 'JobSettled')
  const upcoming: Array<{ label: string; when: string | null }> = []
  if (state === 'OPEN') upcoming.push({ label: 'Paid into escrow', when: null }, { label: 'Delivered', when: null })
  if (state === 'FUNDED') upcoming.push({ label: 'Delivered', when: t?.submitDeadline ? `by ${utcStamp(t.submitDeadline * 1000)}` : null })
  if (state === 'OPEN' || state === 'FUNDED' || state === 'SUBMITTED') upcoming.push({ label: 'Review window ends', when: t?.reviewEndsAt ? utcStamp(t.reviewEndsAt * 1000) : windowS ? `${Math.round(windowS / 86400) || Math.round(windowS / 60)} ${windowS >= 86400 ? 'days' : 'minutes'} after delivery` : null }, { label: 'Paid to the agent', when: null })
  if (state === 'COMPLETED') upcoming.push({ label: 'Paid to the agent', when: null })

  return (
    <>
      <SiteHeader />
      <main className={styles.page} data-surface="chamber">
        <div className={styles.inner}>
          <header className={styles.head}>
            <div className={styles.headTop}>
              <span className="t-label">Job room · {net(chainId).short}</span>
              <span className={styles.stateTag} data-state={state}>{state === 'SUBMITTED' ? 'Delivered' : state === 'FUNDED' ? 'Working' : state.charAt(0) + state.slice(1).toLowerCase()}</span>
            </div>
            <div className={styles.agentRow}>
              {job?.agent ? <AgentAvatar id={job.agent.agentKey ?? jobId} category={category} reference={job.agent.firstParty} size={52} /> : null}
              <div className={styles.agentTxt}>
                <h1>{head.title}</h1>
                <p className={styles.lede}>{head.body}</p>
              </div>
            </div>
            <dl className={styles.facts}>
              <div><dt>Agent</dt><dd>{agentName}{job?.agent?.firstParty ? <Badge kind="reference" /> : null}</dd></div>
              <div><dt>Category</dt><dd>{CAT[category ?? ''] ?? 'Unclassified'}</dd></div>
              <div><dt>Amount</dt><dd className={styles.num}>{priceLabel ?? 'unknown'} <ProvenanceChip provenance="ONCHAIN" /></dd></div>
              <div><dt>Job</dt><dd className={styles.num}>#{jobId}</dd></div>
            </dl>
            <JobActions
              chainId={cid} jobId={jobId} state={state} client={job?.client ?? onchain?.client ?? null} agentName={agentName}
              agentKey={job?.agent?.agentKey ?? null} priceLabel={priceLabel}
              resume={state === 'OPEN' && intent?.['price_raw'] && tokenMeta ? { priceRaw: String(intent['price_raw']), token: { address: tokenMeta.address, symbol: tokenMeta.symbol, decimals: tokenMeta.decimals, isDefault: tokenMeta.isDefault }, registered, budgetSet } : null}
              refundFrom={t?.refundFrom ?? null} reviewEndsAt={t?.reviewEndsAt ?? null} submitDeadline={t?.submitDeadline ?? null}
              rated={job?.rating ? { stars: Number(job.rating.stars ?? Math.round(Number(job.rating.value) / 20)), tx: job.rating.tx ?? null } : null}
            />
          </header>

          <div className={styles.cols}>
            <section className={styles.main} aria-labelledby="deliverable">
              <h2 id="deliverable" className={styles.h2}>{manifest?.content ? `What ${agentName} delivered` : 'The delivery'}</h2>
              {asked ? (
                <div className={styles.asked}><span className="t-label">{job?.client ? 'The buyer asked' : 'Asked'}</span><p>{asked}</p></div>
              ) : null}
              {manifest?.content ? (
                <DeliverableView category={category} content={manifest.content} />
              ) : state === 'OPEN' || state === 'FUNDED' ? (
                <div className={styles.waiting}><span className={styles.pulse} aria-hidden="true" /><p>{state === 'OPEN' ? 'Nothing is delivered before the job is paid.' : `${agentName} is working. The answer appears here the moment it is recorded on chain.`}</p></div>
              ) : onchainHash && !job?.deliverable?.url ? (
                <p className={styles.note}>This agent recorded its delivery on chain (hash below) but does not publish the file where Marque can read it.</p>
              ) : (
                <p className={styles.note}>No delivery was recorded for this job.</p>
              )}
              {manifest ? (
                <Disclosure summary={<span className={styles.rawSum}>View the raw file {manifest.matches === true ? <span className={styles.ok}><Check aria-hidden="true" />hash matches the chain</span> : manifest.matches === false ? <span className={styles.bad}><X aria-hidden="true" />hash does not match</span> : null}</span>}>
                  <p className={styles.note}>keccak256 of this file is <code>{manifest.hash}</code>{onchainHash ? <>. The hash {agentName} recorded on chain in its delivery is <code>{onchainHash}</code>{manifest.matches ? ', the same.' : ', which differs.'}</> : '.'}</p>
                  <pre className={styles.raw}>{manifest.pretty}</pre>
                </Disclosure>
              ) : null}
            </section>

            <aside className={styles.side} aria-labelledby="timeline">
              <h2 id="timeline" className={styles.h2}>Timeline</h2>
              <ol className={styles.tl}>
                {done.map((e, i) => (
                  <li key={`${e.tx}-${i}`} data-state="done">
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div>
                      <span className={styles.tlLabel}>{EVENT_LABEL[e.name]}</span>
                      <span className={styles.tlMeta}>{e.at ? utcStamp(e.at) : `block ${e.block.toLocaleString('en-US')}`}</span>
                      <HashChip value={e.tx} chainId={chainId} />
                    </div>
                  </li>
                ))}
                {job?.tx?.['rating'] ? (
                  <li data-state="done"><span className={styles.tlDot} aria-hidden="true" /><div><span className={styles.tlLabel}>Rated {job.rating?.stars ?? ''} of 5</span><HashChip value={String(job.tx['rating'])} chainId={chainId} /></div></li>
                ) : null}
                {upcoming.map((u) => (
                  <li key={u.label} data-state="todo"><span className={styles.tlDot} aria-hidden="true" /><div><span className={styles.tlLabel}>{u.label}</span>{u.when ? <span className={styles.tlMeta}>{u.when}</span> : null}</div></li>
                ))}
                {!done.length && onchain ? <li data-state="todo"><span className={styles.tlDot} aria-hidden="true" /><div><span className={styles.tlLabel}>This job was opened outside Marque; its events are not indexed here.</span></div></li> : null}
              </ol>
              <dl className={styles.sideFacts}>
                <div><dt>Buyer</dt><dd>{job?.client ?? onchain?.client ? <AddressChip value={(job?.client ?? onchain?.client)!} chainId={chainId} /> : 'unknown'}</dd></div>
                <div><dt>Agent wallet</dt><dd>{job?.provider ?? onchain?.provider ? <AddressChip value={(job?.provider ?? onchain?.provider)!} chainId={chainId} /> : 'unknown'}</dd></div>
                <div><dt>Escrow</dt><dd><AddressChip value={network(cid).commerce} chainId={chainId} /></dd></div>
                {expiredAt ? <div><dt>Deadline</dt><dd>{utcStamp(expiredAt * 1000)}</dd></div> : null}
              </dl>
              <p className={styles.support}>Something wrong? <a href="https://x.com/marquetrade" target="_blank" rel="noreferrer">Message @marquetrade</a> with job {jobId}, or <a href="https://github.com/talk2francis/Marque/issues" target="_blank" rel="noreferrer">open an issue</a>. This page is read from chain: <a href={`/api/v1/phase2/job/${chainId}/${jobId}`}>the same data as JSON</a>.</p>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
