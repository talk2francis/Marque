import { rejectReason } from '@marque/conformance/criteria'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import {
  agenticCommerceAbi, assetAt, chainClient, disputeWindowSeconds, formatAmount, isSupportedChain, network, questJob, timeline, type ChainId,
} from '@marque/commerce'
import { ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import { AgentAvatar } from '../../../_components/AgentAvatar'
import { AddressChip, Badge, HashChip } from '../../../_components/ui'
import { network as net } from '../../../../lib/network'
import { utcStamp } from '../../../../lib/time'
import { jobHeadline } from '../../../../lib/job-copy'
import { outcomesForJob } from '../../../../lib/act'
import { intentFromLens } from '@marque/act'
import { ResultLens } from './ResultLens'
import { jobLens } from '../../../../lib/lens'
import { jobManifest } from '../../../../lib/manifest'
import { onchainJobTask } from '../../../../lib/job-description'
import { FUNDER_LABEL, FUNDER_NOTE } from '../../../../lib/funder-label'
import { registryImageUrl } from '../../../../lib/avatar-source'
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
    select i.description, i.price_raw, i.token, i.category, i.provider, i.expired_at, a.image_url,
           a.raw_metadata #>> '{offchain_content,image}' as meta_image
    from hire_intent i left join agent a on a.id = i.agent_id
    where i.chain_id = ${chainId} and i.job_id = ${jobId} limit 1`)) as unknown as Array<Record<string, unknown>>

  const state = job?.state ?? (['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const)[onchain!.status] ?? 'OPEN'
  const events: Ev[] = (job?.events ?? []) as Ev[]
  const agentName = job?.agent?.name ?? 'the agent'
  const category = job?.agent?.category ?? (intent?.['category'] ? String(intent['category']) : null)
  const rawToken = job?.token ?? (onchain ? (() => { const a = assetAt(cid, network(cid).kernelToken); return a ? { address: a.address, symbol: a.symbol, decimals: a.decimals } : null })() : null)
  const token = rawToken && rawToken.address && rawToken.symbol && rawToken.decimals !== null && rawToken.decimals !== undefined
    ? { address: rawToken.address, symbol: rawToken.symbol, decimals: rawToken.decimals } : null
  const amountRaw = job?.amount ?? (onchain ? onchain.budget.toString() : null) ?? (intent?.['price_raw'] ? String(intent['price_raw']) : null)
  const tokenMeta = intent?.['token'] ? assetAt(cid, String(intent['token'])) : null
  const originalQuote = state === 'OPEN' && typeof intent?.['price_raw'] === 'string' && tokenMeta ? { raw: intent['price_raw'], token: tokenMeta } : null
  const priceLabel = originalQuote ? `${formatAmount(originalQuote.raw, originalQuote.token.decimals)} ${originalQuote.token.symbol}` : amountRaw && token ? `${formatAmount(BigInt(amountRaw), token.decimals)} ${token.symbol}` : null
  const expiredAt = job?.expiresAt ? Math.floor(Date.parse(job.expiresAt) / 1000) : onchain ? Number(onchain.expiredAt) : null
  const submittedEv = events.find((e) => e.name === 'JobSubmitted')
  const submittedAt = submittedEv?.at ? Math.floor(Date.parse(submittedEv.at) / 1000) : onchain && onchain.submittedAt > 0n ? Number(onchain.submittedAt) : null
  const now = Math.floor(Date.now() / 1000)
  const t = windowS === null ? null : timeline({ state: state as never, expiredAt }, submittedAt, windowS, now)
  const fundingDeadline = t?.submitDeadline ?? expiredAt
  const head = jobHeadline(state, agentName, priceLabel ?? 'payment', t?.reviewEndsAt ?? null, t?.refundFrom ?? null, Boolean(t?.awaitingExpiry), fundingDeadline !== null && now >= fundingDeadline)
  const onchainHash = job?.deliverable?.hash ?? (onchain && onchain.submittedAt > 0n ? onchain.deliverable : null)
  // The published URL when there is one, otherwise found from the chain hash and accepted only on a hash match.
  const manifest = await jobManifest(cid, jobId, job as never, onchainHash)
  // The Result Lens reads the same file and checks it against the chain (cached per job).
  const lensData = manifest && !manifest.withheld ? await jobLens(cid, jobId).then((p) => p.value).catch(() => null) : null
  const actIntent = lensData?.lens ? intentFromLens(lensData.lens as never) : null
  const acted = await outcomesForJob(`${cid}:${jobId}`)
  const lensContent: unknown = manifest?.content ?? (() => { try { return manifest?.raw ? JSON.parse(manifest.raw) : null } catch { return null } })()
  // The description can be signed or identity-matched unsigned; the buyer's words are its `task`.
  // Hires started elsewhere (or on another Marque stack) have no intent here: the job's own description on chain says it.
  const chainTask = intent?.['description'] ? null : await onchainJobTask(cid, jobId)
  const asked = (() => {
    const d = intent?.['description'] ? String(intent['description']) : null
    if (!d) return chainTask?.task ?? null
    try { const j = JSON.parse(d) as { task?: unknown }; return typeof j.task === 'string' ? j.task : null } catch { return d.split('\n')[0] ?? null }
  })()

  // A seller that refused the funded job (it answered notify_funded with an error and never
  // delivered): say so in its words, with the date the buyer can reclaim the full amount.
  const refusal = state === 'FUNDED' ? await (async () => {
    const [n] = (await db().execute(sql`select ok, detail from notify_attempt where chain_id = ${cid} and job_id = ${jobId} order by created_at desc limit 1`).catch(() => [])) as unknown as Array<{ ok: boolean; detail: string | null }>
    if (!n || n.ok || !n.detail) return null
    let msg = n.detail
    try { const j = JSON.parse(n.detail) as { error?: { message?: string } }; if (!j.error) return null; msg = j.error.message ?? msg } catch { /* plain text */ }
    const reason = msg.replace(/^could not complete job \d+:\s*/i, '').split(/\.\s/)[0]!.replace(/\.+$/, '').trim()
    return reason ? reason.slice(0, 200) : null
  })() : null
  const reclaimAt = t?.refundFrom ?? expiredAt

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
              <span className={styles.tags}>
                {job?.funderClass ? <span className={styles.funder} data-funder={job.funderClass} title={FUNDER_NOTE[job.funderClass]}>{FUNDER_LABEL[job.funderClass]}</span> : null}
                <span className={styles.stateTag} data-state={state}>{state === 'SUBMITTED' ? 'Delivered' : state === 'FUNDED' ? 'Escrow funded' : state.charAt(0) + state.slice(1).toLowerCase()}</span>
              </span>
            </div>
            <div className={styles.agentRow}>
              {job?.agent ? <AgentAvatar id={job.agent.agentKey ?? jobId} name={agentName} category={category} reference={job.agent.firstParty} imageUrl={registryImageUrl(intent?.['image_url']) ?? registryImageUrl(intent?.['meta_image'])} size={52} /> : null}
              <div className={styles.agentTxt}>
                <h1>{head.title}</h1>
                <p className={styles.lede}>{head.body}</p>
              </div>
            </div>
            <dl className={styles.facts}>
              <div><dt>Agent</dt><dd>{agentName}{job?.agent?.firstParty ? <Badge kind="reference" /> : null}</dd></div>
              <div><dt>Category</dt><dd>{CAT[category ?? ''] ?? 'Unclassified'}</dd></div>
              <div><dt>{originalQuote ? 'Original quote' : 'Amount'}</dt><dd className={styles.num}>{priceLabel ?? 'unknown'} <ProvenanceChip provenance={originalQuote ? 'MEASURED' : 'ONCHAIN'} /></dd></div>
              <div><dt>Job</dt><dd className={styles.num}>#{jobId}</dd></div>
            </dl>
            <JobActions
              chainId={cid} jobId={jobId} state={state} client={job?.client ?? onchain?.client ?? null} agentName={agentName}
              agentKey={job?.agent?.agentKey ?? null} priceLabel={priceLabel}
              resume={state === 'OPEN' && intent?.['price_raw'] && intent['provider'] && intent['description'] && intent['expired_at'] && tokenMeta && windowS !== null ? { priceRaw: String(intent['price_raw']), provider: String(intent['provider']) as `0x${string}`, description: String(intent['description']), expiredAt: String(intent['expired_at']), token: { address: tokenMeta.address, symbol: tokenMeta.symbol, decimals: tokenMeta.decimals, isDefault: tokenMeta.isDefault } } : null}
              fundingDeadline={fundingDeadline}
              refundFrom={t?.refundFrom ?? null} reviewEndsAt={t?.reviewEndsAt ?? null} submitDeadline={t?.submitDeadline ?? null}
              rated={job?.rating ? { stars: Number(job.rating.stars ?? Math.round(Number(job.rating.value) / 20)), tx: job.rating.tx ?? null } : null}
              rejectReason={lensData?.terms && lensData.terms.source !== 'standard' && lensData.terms.rows.some((r) => r.state === 'not_met') ? rejectReason(`${cid}:${jobId}`, lensData.terms.rows.filter((r) => r.state === 'not_met'), lensData.checkedAtBlock) : null}
            />
            {refusal ? (
              <div className={styles.refused} role="note">
                <p><strong>The agent refused this task after funding.</strong> It said: &ldquo;{refusal}.&rdquo; Nothing was delivered, so the escrow still holds the full {priceLabel ?? 'amount'}.</p>
                {reclaimAt ? <p>You can reclaim it from {utcStamp(reclaimAt * 1000)}, with the wallet that paid. <a href={`/jobs/${cid}/${jobId}/reclaim.ics`} download>Add a reminder to your calendar</a></p> : null}
              </div>
            ) : null}
          </header>

          <div className={styles.cols}>
            <section className={styles.main} aria-labelledby="deliverable">
              {lensData && lensData.manifest?.raw ? null : <h2 id="deliverable" className={styles.h2}>The delivery</h2>}
              {asked ? (
                <div className={styles.asked}><span className="t-label">{job?.client ? (job.funderClass === 'team' ? 'Marque team (test) asked' : job.funderClass === 'operator' ? "The agent's own operator asked" : 'The buyer asked') : 'Asked'}</span><p>{asked}</p></div>
              ) : null}
              {lensData && lensData.manifest?.raw ? (
                <>
                  <ResultLens data={lensData} agentName={agentName} content={lensContent} />
                  {acted.map((o) => (
                    <p key={o.id} className={styles.acted}>
                      <strong>Acted on:</strong> {o.action === 'repay' ? <>HF {o.before.healthFactor === null ? 'n/a' : o.before.healthFactor > 100 ? 'over 100' : o.before.healthFactor.toFixed(3)} → {o.after.healthFactor === null ? 'no debt' : o.after.healthFactor > 100 ? 'over 100' : o.after.healthFactor.toFixed(3)}</> : <>{o.symbol} supply {o.before.market.supplied.toFixed(4)} → {o.after.market.supplied.toFixed(4)}</>} at block {Number(o.after.block).toLocaleString('en-US')}. {o.action === 'repay' ? 'Repay' : 'Supply'} {o.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} {o.symbol}.{' '}
                      {o.txHashes.map((h) => <a key={h} href={net(56).explorer + '/tx/' + h} target="_blank" rel="noreferrer">tx ↗</a>)}
                    </p>
                  ))}
                  {actIntent ? (
                    <div className={styles.actEntry}>
                      <div>
                        <strong>Act on the answer</strong>
                        <span>{actIntent.action === 'repay' ? `Repay toward a health factor of ${actIntent.targetHf} from the wallet that holds the position.` : `Supply ${actIntent.asset} to Venus from your own wallet.`} Marque rebuilds it, checks it against the current block and simulates it; you sign.</span>
                      </div>
                      <a className="btn" href={`/jobs/${cid}/${jobId}/act`}>See the plan</a>
                    </div>
                  ) : null}
                </>
              ) : manifest?.withheld ? (
                <p className={styles.note}>The original error response is preserved privately. Raw diagnostics are withheld to avoid exposing private provider details. The provider reports its original content hash as <code>{manifest.withheld.originalContentHash}</code>. The original bytes are unavailable here, so this page cannot independently verify that hash against the chain. Payment state above is separate from a usable result.</p>
              ) : state === 'OPEN' || state === 'FUNDED' ? (
                <div className={styles.waiting}><span className={styles.pulse} aria-hidden="true" /><p>{state === 'OPEN' ? 'Nothing is delivered before the job is paid.' : 'Escrow is funded. The answer appears here as soon as the agent delivers.'}</p></div>
              ) : onchainHash && !job?.deliverable?.url ? (
                <p className={styles.note}>This agent recorded its delivery on chain (hash below) but has not said where its file can be read. Marque shows it here as soon as the agent publishes it.</p>
              ) : job?.deliverable?.url && !manifest ? (
                <p className={styles.note}>The agent&apos;s delivery file could not be read just now. Its hash is recorded on chain; this page tries again on the next visit.</p>
              ) : (
                <p className={styles.note}>No delivery was recorded for this job.</p>
              )}
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
              <p className={styles.support}>Something wrong? <a href="https://t.me/marque_marketplace" target="_blank" rel="noreferrer">Ask in the Marque Telegram group</a> with job {jobId}. Never share a private key or recovery phrase. This page is read from chain: <a href={`/api/v1/phase2/job/${chainId}/${jobId}`}>the same data as JSON</a>.</p>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter slim />
    </>
  )
}
