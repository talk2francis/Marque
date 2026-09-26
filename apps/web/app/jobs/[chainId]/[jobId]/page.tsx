import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { chainClient, network, isSupportedChain, formatAmount, assetAt, explorerTx, explorerAddress, agenticCommerceAbi, disputeWindowSeconds, timeline } from '@marque/commerce'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import styles from './job.module.css'
import { RateJob } from './RateJob'

export const dynamic = 'force-dynamic'

const STATUS = ['Open', 'Paid into escrow', 'Delivered', 'Completed', 'Rejected', 'Expired'] as const
const NET: Record<number, string> = { 56: 'BSC mainnet', 97: 'BSC testnet' }

/** Job page (P2-02 minimal). Read straight from the escrow contract; P2-08 builds the full Job Room. */
export default async function JobPage({ params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const { chainId: c, jobId } = await params
  const chainId = Number(c)
  if (!isSupportedChain(chainId) || !/^\d{1,20}$/.test(jobId)) notFound()
  const net = network(chainId)
  const job = await chainClient(chainId).readContract({ address: net.commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] })
    .catch(() => null) as null | { id: bigint; client: string; provider: string; budget: bigint; expiredAt: bigint; status: number; submittedAt: bigint; deliverable: string }
  if (!job || job.id === 0n) notFound()
  const token = await chainClient(chainId).readContract({ address: net.commerce, abi: agenticCommerceAbi, functionName: 'jobPaymentToken', args: [BigInt(jobId)] }).catch(() => net.kernelToken) as string
  const asset = assetAt(chainId, token)
  const intent = (await db().execute(sql`
    select h.agent_id, h.category, h.create_tx, a.name from hire_intent h left join agent a on a.id = h.agent_id
    where h.chain_id = ${chainId} and h.job_id = ${jobId} limit 1`) as unknown as Array<Record<string, unknown>>)[0]
  const window = await disputeWindowSeconds(chainId).catch(() => null)
  const now = Math.floor(Date.now() / 1000)
  const state = (['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'] as const)[job.status] ?? 'OPEN'
  const t = window === null ? null : timeline({ state, expiredAt: Number(job.expiredAt) }, job.submittedAt > 0n ? Number(job.submittedAt) : null, window, now)
  const when = (s: number | null) => (s ? new Date(s * 1000).toUTCString().replace(' GMT', ' UTC') : 'not set')
  const ratings = (await db().execute(sql`
    select r.value, r.value_decimals, r.tx_hash, r.revoked, c.stars, c.comment from rating_comment c
    join rating r on r.feedback_hash = c.feedback_hash and r.chain_id = c.chain_id
    where c.chain_id = ${chainId} and c.job_id = ${jobId} order by r.block_number`) as unknown as Array<Record<string, unknown>>)
  const amount = asset ? `${formatAmount(job.budget, asset.decimals)} ${asset.symbol}` : job.budget.toString()

  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <p className={styles.kicker}>ERC-8183 job on {NET[chainId]}</p>
        <h1 className={styles.title}>Job {jobId}{intent?.['name'] ? ` for ${String(intent['name'])}` : ''}</h1>
        <p className={styles.status}>{STATUS[job.status] ?? 'Unknown'}</p>
        <dl className={styles.facts}>
          <dt>Price</dt><dd className="mono">{amount}</dd>
          <dt>Buyer</dt><dd className="mono"><a href={explorerAddress(chainId, job.client)}>{job.client}</a></dd>
          <dt>Agent (paid to)</dt><dd className="mono"><a href={explorerAddress(chainId, job.provider)}>{job.provider}</a></dd>
          <dt>Escrow contract</dt><dd className="mono"><a href={explorerAddress(chainId, net.commerce)}>{net.commerce}</a></dd>
          <dt>Delivered</dt><dd>{job.submittedAt > 0n ? when(Number(job.submittedAt)) : 'not yet'}</dd>
          {job.submittedAt > 0n && <><dt>Deliverable hash</dt><dd className="mono">{job.deliverable}</dd></>}
          {t && job.status === 2 && <><dt>Review window ends</dt><dd>{when(t.reviewEndsAt)}</dd></>}
          {t && job.status <= 1 && <><dt>Reclaimable if not delivered after</dt><dd>{when(t.refundFrom)}</dd></>}
          {intent?.['create_tx'] ? <><dt>Opened in</dt><dd className="mono"><a href={explorerTx(chainId, String(intent['create_tx']))}>{String(intent['create_tx']).slice(0, 18)}...</a></dd></> : null}
          <dt>Started on Marque</dt><dd>{intent ? 'yes' : 'no, this job was opened elsewhere'}</dd>
          {ratings.map((r) => (
            <Fragment key={String(r['tx_hash'])}><dt>Buyer rating</dt><dd>{String(r['stars'])} of 5{r['comment'] ? `: ${String(r['comment'])}` : ''}{r['revoked'] ? ' (revoked)' : ''} <a className="mono" href={explorerTx(chainId, String(r['tx_hash']))}>on chain</a></dd></Fragment>
          ))}
        </dl>
        {job.status >= 2 && job.status <= 3 && ratings.length === 0 && (
          <RateJob chainId={chainId} jobId={jobId} client={job.client} agentName={intent?.['name'] ? String(intent['name']) : 'this agent'} />
        )}
      </main>
      <SiteFooter />
    </>
  )
}
