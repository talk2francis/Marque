import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { proofProjection } from '../../lib/proof'
import { ProofTable } from './ProofTable'
import styles from './proof.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: `Every job · ${BRAND.name}`,
  description: 'Every job hired through Marque on BNB Chain, with who paid, what was delivered, what the chain checks said and what the buyer did with it. Team jobs shown and labelled, never counted.',
}

const NET: Record<string, string> = { '56': 'BSC mainnet', '97': 'BSC testnet' }

/** /proof: the independent-commerce scorecard, read from the same projection as /api/v1/phase2/stats. */
export default async function ProofPage() {
  const p = await proofProjection().catch(() => null)
  const d = p?.value
  return (
    <>
      <SiteHeader active="proof" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.kicker}>Proof · every job</span>
          <h1 className={`t-display ${styles.title}`}>Every job, <em>who paid.</em></h1>
          <p className={styles.lede}>Each hire made through Marque on BNB Chain&apos;s ERC-8183 escrow: who paid, what was delivered and what Marque&apos;s chain checks said. Team test jobs are listed and labelled, never counted.</p>
        </header>
        {!d ? <p className={styles.note} role="status">The table could not be read just now. Try again in a minute.</p> : (
          <>
            {/* The scorecard (2 Nov): one row per network, one column per measure, every figure a filter of the table. */}
            <section className={styles.score} aria-label="Scorecard per network">
              <table className={styles.scoreTable}>
                <thead><tr><th scope="col"><span className="sr-only">Network</span></th><th scope="col">Outside wallets</th><th scope="col">Outside jobs completed</th><th scope="col">Chain checks agreeing</th><th scope="col">Team jobs <span>shown, not counted</span></th></tr></thead>
                <tbody>
                  {(['56', '97'] as const).map((c) => {
                    const t = d.totals[c]!
                    const decided = t.outside.checksDecided
                    return (
                      <tr key={c}>
                        <th scope="row">{NET[c]}<span>chain {c}</span></th>
                        <td><a href={`?chain=${c}&funder=outside#jobs`}>{t.outside.wallets}</a></td>
                        <td><a href={`?chain=${c}&funder=outside&state=settled#jobs`}>{t.outside.settled}</a></td>
                        <td>
                          <a href={`?chain=${c}&funder=outside&checked=1#jobs`}>{decided ? <>{t.outside.checksAgreed}<small> of {decided}</small></> : '0'}</a>
                          {decided ? <span className={styles.meter} aria-hidden="true"><i style={{ width: `${Math.round((t.outside.checksAgreed / decided) * 100)}%` }} /></span> : null}
                        </td>
                        <td data-quiet=""><a href={`?chain=${c}&funder=team#jobs`}>{t.team.jobs}</a></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <details className={styles.scope}>
                <summary>How this is counted</summary>
                <p><b>Scope:</b> every job through Marque, on both networks. The <a href="/api/v1/phase2/stats">Set and Earn count</a> is narrower: outside, Marque-bound, funded, one hire per category per wallet. An outside wallet that also owns or runs an agent listed here is labelled so.</p>
                <p>Outside means not in Marque&apos;s published team list. It does not prove the buyer is unrelated.</p>
              </details>
            </section>
            <ProofTable rows={d.rows} />
            <p className={styles.note}>Read {new Date(d.measuredAt).toISOString().slice(0, 16).replace('T', ' ')} UTC. The same rows: <a href="/api/v1/proof">/api/v1/proof</a> · <a href="/api/v1/proof?format=csv" download>CSV</a>. Counted figures equal <a href="/api/v1/phase2/stats">/api/v1/phase2/stats</a>. Each row&apos;s escrow link opens the contract on BscScan, where getJob(job id) returns the record.</p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
