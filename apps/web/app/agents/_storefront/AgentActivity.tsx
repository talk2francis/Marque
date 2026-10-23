import { ProvenanceChip } from '@marque/ui'
import { agentActivity } from '../../../lib/agent-activity'
import { utcStamp } from '../../../lib/time'
import { AddressChip } from '../../_components/ui'
import styles from './activity.module.css'
const STATES: Record<string,string> = {OPEN:'Open',FUNDED:'Awaiting delivery',SUBMITTED:'Delivered',COMPLETED:'Settled',PAID:'Paid out',REFUNDED:'Refunded',DISPUTED:'Disputed',REJECTED:'Rejected',CANCELLED:'Cancelled'}

export async function AgentActivity({agentId,provider,chainId=56}:{agentId:string;provider:string|null;chainId?:56|97}) {
  const d=await agentActivity(agentId,provider,chainId).catch(()=>null)
  if(!d) return <p className={styles.note}>Activity could not be loaded. Please refresh; this does not mean the agent has no jobs.</p>
  return <section className={styles.activity} aria-label="Public job activity">
    <header><h2>The work, wallet by wallet.</h2><p className={styles.note}>{chainId===97?'BSC testnet · 97':'BSC mainnet · 56'} <ProvenanceChip provenance="ONCHAIN" /> Snapshot {utcStamp(d.measuredAt)}. Wallets are public addresses, not verified people.</p></header>
    <dl className={styles.stats}>
      <div><dt>Paid jobs</dt><dd>{d.paid}</dd></div>
      <div><dt>Non-team paid jobs</dt><dd>{d.nonTeamPaid}</dd></div>
      <div><dt>Non-team paying wallets</dt><dd>{d.nonTeamWallets}</dd></div>
    </dl>
    <p className={styles.note}>Non-team means absent from the published team list, not proof of an independent customer or reward eligibility. Jobs without a recorded marketplace intent are attributed only to this provider wallet; the originating marketplace and exact agent identity are unknown.</p>
    <p className={styles.note}>{d.jobs.length ? `Showing the latest ${d.jobs.length} of ${d.total} indexed jobs.` : 'No indexed jobs for this agent yet.'} Free previews are not onchain hires and are not included.</p>
    <ol className={styles.jobs}>{d.jobs.map(j=><li key={j.id} className={styles.job}>
      <div className={styles.jobHead}><a href={`/jobs/${chainId}/${j.id}`}>Job {j.id}</a><span className={styles.state}>{STATES[j.state] ?? 'Unknown state'}</span></div>
      <div className={styles.wallet}><AddressChip value={j.client} chainId={chainId}/><span>{j.team?'Team wallet':'Non-team wallet'}</span></div>
      <p className={styles.source}>{j.viaMarque?'Started on this marketplace':'Provider-wallet activity; origin unverified'}</p>
      <dl className={styles.times}>{([['Created',j.createdAt],['Paid',j.fundedAt],['Delivered',j.deliveredAt],['Settled',j.settledAt]] as const).map(([label,at])=><div key={label}><dt>{label}</dt><dd>{at?<time dateTime={at}>{utcStamp(at)}</time>:'Not recorded'}</dd></div>)}</dl>
      <div className={styles.links}>{j.fundedTx?<a href={`https://bscscan.com/tx/${j.fundedTx}`} target="_blank" rel="noreferrer">Payment transaction</a>:null}{j.deliveredTx?<a href={`https://bscscan.com/tx/${j.deliveredTx}`} target="_blank" rel="noreferrer">Delivery transaction</a>:null}</div>
    </li>)}</ol>
  </section>
}
