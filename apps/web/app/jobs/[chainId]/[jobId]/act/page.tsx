import { notFound } from 'next/navigation'
import { isSupportedChain, questJob } from '@marque/commerce'
import { SiteHeader, SiteFooter } from '../../../../_components/SiteHeader'
import { ActPlan } from './ActPlan'
import styles from './act.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Act on the answer', description: 'Marque rebuilds the action from its allowlist, checks it against the current block and simulates it. You sign from your own wallet.' }

/** /jobs/{chainId}/{jobId}/act (SPEC-ACT 5). */
export default async function ActPage({ params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const { chainId, jobId } = await params
  const c = Number(chainId)
  if (!isSupportedChain(c) || !/^\d{1,12}$/.test(jobId)) notFound()
  const job = await questJob(c, jobId).catch(() => null)
  const agentName = job?.agent?.name ?? 'the agent'
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><a href={`/jobs/${c}/${jobId}`}>Job {jobId}</a><span aria-hidden="true">/</span><span aria-current="page">Act on the answer</span></nav>
        <ActPlan chainId={c as 56 | 97} jobId={jobId} agentName={agentName} />
      </main>
      <SiteFooter />
    </>
  )
}
