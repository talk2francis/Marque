import { ProvenanceChip } from '@marque/ui'
import { indexerStatus, campaignChainId, NETWORKS, REPUTATION_REGISTRY, type ChainId } from '@marque/commerce'
import facts from '../../../../docs/phase2/evidence/protocol-facts.json'
import topics from '../../../../docs/phase2/evidence/verify-topics.json'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { AddressChip, HashChip } from '../_components/ui/AddressChip'
import { SectionHead } from '../_components/ui/SectionHead'
import { Tabs } from '../_components/ui/Tabs'
import { network as net } from '../../lib/network'
import { utcStamp } from '../../lib/time'
import styles from './protocol.module.css'

export const metadata = {
  title: 'Protocol',
  description: 'Every contract Marque reads and writes, per network: addresses, what we do with each, the events we index with their topic0, the indexer position, and the public API.',
}
export const revalidate = 30

const MARQUE_REGISTRY_TESTNET = '0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7'
const at = utcStamp
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? 'unknown' : Number(v).toLocaleString('en-US'))

interface ChainFacts {
  chainId: number
  measuredAt: string
  headBlock: number
  commerce: { platformFeeBP: string }
  policy: { disputeWindowSeconds: number }
}

type Row = { name: string; address: string; reads: string; writes: string; who: string }

function contracts(chainId: ChainId): Row[] {
  const n = NETWORKS[chainId]
  const tokens = n.assets.map((a) => a.symbol).join(', ')
  const rows: Row[] = [
    { name: 'ERC-8183 AgenticCommerce', address: n.commerce, reads: 'Every job event, from creation to payout; the job itself for its current state', writes: 'Open a job, lock the price, pay into escrow, cancel before paying, reclaim after expiry', who: 'Your wallet' },
    { name: 'EvaluatorRouter', address: n.router, reads: 'Buyer protection attached (JobRegistered), settlement (JobSettled)', writes: 'Attach buyer protection to your job; settle after the review window', who: 'Your wallet; settle by the Marque keeper, gas sponsored' },
    { name: 'OptimisticPolicy', address: n.policy, reads: 'The review window, and any dispute raised', writes: 'Report a problem with a delivery, inside the review window', who: 'Your wallet' },
    { name: 'ERC-8004 IdentityRegistry', address: n.identityRegistry, reads: 'Agents, their owners, agent wallets and registration files', writes: 'Nothing from Marque. Builders register their own agents with their own wallet', who: 'Builders' },
    { name: 'ERC-8004 ReputationRegistry', address: REPUTATION_REGISTRY[chainId], reads: 'Ratings (NewFeedback) and revocations', writes: 'Rate the agent you paid, after it delivers', who: 'Your wallet' },
    { name: `Payment tokens (${tokens})`, address: n.kernelToken, reads: 'Your balance and your allowance to the escrow', writes: 'Allow exactly the price you are about to pay, or revoke to zero', who: 'Your wallet' },
  ]
  if (chainId === 97) rows.push({ name: 'MarqueRegistry', address: MARQUE_REGISTRY_TESTNET, reads: 'Anchors and sealed calls for charter sandbox receipts', writes: 'anchor and sealCall events; holds no funds', who: 'Marque testnet wallet' })
  return rows
}

const MEANING: Record<string, string> = {
  JobCreated: 'A job was opened (a hire started)',
  JobRegistered: 'Buyer protection attached',
  BudgetSet: 'The price was locked',
  JobFunded: 'Payment went into escrow',
  JobSubmitted: 'The agent delivered',
  JobCompleted: 'The job settled after review',
  PaymentReleased: 'The agent was paid',
  JobSettled: 'The router settled the job',
  JobRejected: 'The job was cancelled before payment',
  JobExpired: 'The deadline passed without delivery',
  Refunded: 'The buyer was refunded',
  Disputed: 'The buyer reported a problem',
  NewFeedback: 'A buyer rated an agent',
  FeedbackRevoked: 'A rating was withdrawn',
}
const CONTRACT_NAME: Record<string, string> = { commerce: 'AgenticCommerce', router: 'EvaluatorRouter', policy: 'OptimisticPolicy', reputation: 'ReputationRegistry' }

const API = [
  ['/api/v1/phase2/config', 'Contracts, event topics, team wallets, indexer position'],
  ['/api/v1/phase2/wallet/{address}', 'One wallet: quest progress and every hire, with transactions'],
  ['/api/v1/phase2/job/{chainId}/{jobId}', 'One job: full timeline from chain events'],
  ['/api/v1/phase2/owner/{address}', 'Agents a wallet owns, with listing and quality checks'],
  ['/api/v1/phase2/coverage', 'Hireable agents per category, with live prices'],
  ['/api/v1/phase2/stats', 'Totals since launch, eligible activity only'],
  ['/api/v1/phase2/ratings/{agentId}', 'Verified-buyer ratings for one agent'],
  ['/api/v1/pulse', 'Network and system status, as shown in the header'],
] as const

export default async function ProtocolPage() {
  const idx = await indexerStatus().catch(() => null)
  const readAt = new Date().toISOString()
  const campaign = campaignChainId()
  const events = Object.entries((topics as { events: Record<string, { topic0: string; contract: string; chainId?: number; verified: boolean; tx?: string | null }> }).events)

  const networkPanel = (chainId: ChainId) => {
    const f = (facts as { chains: ChainFacts[] }).chains.find((c) => c.chainId === chainId)
    const i = idx?.find((c) => c.chainId === chainId) ?? null
    const windowS = f?.policy?.disputeWindowSeconds as number | undefined
    return (
      <div className={styles.panel}>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span className="t-label">Indexer at block</span>
            <span className={styles.kpiNum}>{num(i?.cursorBlock)}</span>
            <span className={styles.kpiNote}>head {num(i?.headBlock)} <ProvenanceChip provenance="ONCHAIN" /></span>
          </div>
          <div className={styles.kpi}>
            <span className="t-label">Behind head</span>
            <span className={styles.kpiNum}>{i?.lagBlocks === null || i?.lagBlocks === undefined ? 'unknown' : `${num(i.lagBlocks)} blocks`}</span>
            <span className={styles.kpiNote}>read {at(readAt)} <ProvenanceChip provenance="MEASURED" /></span>
          </div>
          <div className={styles.kpi}>
            <span className="t-label">Review window</span>
            <span className={styles.kpiNum}>{windowS === undefined ? 'unknown' : windowS >= 86_400 ? `${windowS / 86_400} days` : `${windowS / 60} min`}</span>
            <span className={styles.kpiNote}>disputeWindow() <ProvenanceChip provenance="ONCHAIN" /></span>
          </div>
          <div className={styles.kpi}>
            <span className="t-label">Platform fee</span>
            <span className={styles.kpiNum}>{f?.commerce?.platformFeeBP === undefined ? 'unknown' : `${Number(f.commerce.platformFeeBP) / 100}%`}</span>
            <span className={styles.kpiNote}>platformFeeBP() <ProvenanceChip provenance="ONCHAIN" /></span>
          </div>
        </div>
        {f?.measuredAt ? <p className={styles.small}>Contract parameters read on chain at {at(f.measuredAt)}, block {num(f.headBlock)}. Source: docs/phase2/evidence/protocol-facts.json.</p> : null}

        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.stack}`}>
            <thead>
              <tr><th scope="col">Contract</th><th scope="col">Address</th><th scope="col">Marque reads</th><th scope="col">Signed writes</th></tr>
            </thead>
            <tbody>
              {contracts(chainId).map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td data-label="Address"><AddressChip value={r.address} chainId={chainId} /></td>
                  <td data-label="Marque reads">{r.reads}</td>
                  <td data-label="Signed writes">{r.writes}<span className={styles.who}>{r.who}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <>
      <SiteHeader active="protocol" />
      <main className={styles.page}>
        <header className={`${styles.head} construct`}>
          <span className="construct-grid" aria-hidden="true" />
          <span className="t-label">Protocol · campaign network {net(campaign).short}</span>
          <h1>Every contract Marque reads and writes.</h1>
          <p className={styles.lede}>
            Marque adds no contract to the money path. A hire runs on BNB Chain&apos;s ERC-8183 escrow and the ERC-8004
            registries, signed by your own wallet. Here is each contract per network, what we do with it, the events we
            index, where the indexer is right now, and the public API that serves it.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="networks">
          <SectionHead id="networks" label="Contracts per network" note={`read ${at(readAt)}`} />
          <Tabs
            label="Network"
            initial={String(campaign)}
            tabs={([56, 97] as ChainId[]).map((c) => ({ id: String(c), label: net(c).short, content: networkPanel(c) }))}
          />
        </section>

        <section className={styles.section} aria-labelledby="events">
          <SectionHead id="events" label="Indexed events" note={`${events.length} topics, each seen on a real log`} title="What the Quest Index listens for" />
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.stack}`}>
              <thead>
                <tr><th scope="col">Event</th><th scope="col">Meaning</th><th scope="col">Contract</th><th scope="col">topic0</th><th scope="col">Seen on chain</th></tr>
              </thead>
              <tbody>
                {events.map(([name, e]) => (
                  <tr key={name}>
                    <th scope="row" className={styles.mono}>{name}</th>
                    <td data-label="Meaning">{MEANING[name] ?? ''}</td>
                    <td data-label="Contract">{CONTRACT_NAME[e.contract] ?? e.contract}</td>
                    <td data-label="topic0"><AddressChip value={e.topic0} lead={10} tail={6} /></td>
                    <td data-label="Seen on chain">{e.verified && e.tx && e.chainId ? <HashChip value={e.tx} chainId={e.chainId} label={e.chainId === 56 ? 'Mainnet' : 'Testnet'} /> : <span className={styles.muted}>Not yet seen</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.small}>Each topic0 was recomputed from the contract ABI and matched against a real log ({at((topics as { generatedAt: string }).generatedAt)}). Source: docs/phase2/evidence/verify-topics.json.</p>
        </section>

        <section className={styles.section} aria-labelledby="api">
          <SectionHead id="api" label="Public API" note="No key, open CORS, 15 s cache" title="Read the same data we do" />
          <ul className={styles.api}>
            {API.map(([path, what]) => {
              const live = !path.includes('{')
              return (
                <li key={path}>
                  {live ? <a href={path} className={styles.apiPath}>{path}</a> : <span className={styles.apiPath}>{path}</span>}
                  <span className={styles.apiWhat}>{what}</span>
                </li>
              )
            })}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
