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
          <span className={styles.kicker}>Proof</span>
          <h1 className="t-display">Every job, <em>who paid.</em></h1>
          <p className={styles.lede}>Each hire made through Marque on BNB Chain&apos;s ERC-8183 escrow: who paid, what was delivered, what Marque&apos;s chain checks said, and whether the buyer acted on it. Team test jobs are listed and labelled, never counted.</p>
          <p className={styles.note}>Outside means not in Marque&apos;s published team list. It does not prove the buyer is unrelated.</p>
        </header>
        {!d ? <p className={styles.note} role="status">The table could not be read just now. Try again in a minute.</p> : (
          <>
            <section className={styles.nets} aria-label="Per network">
              {(['56', '97'] as const).map((c) => {
                const t = d.totals[c]!
                const decided = t.outside.checksDecided
                return (
                  <div key={c} className={styles.net}>
                    <h2 className={styles.netTitle}>{NET[c]} <span>· {c}</span></h2>
                    <dl className={styles.nums}>
                      <div><dt><a href={`?chain=${c}&funder=outside#jobs`}>Outside wallets</a></dt><dd>{t.outside.wallets}</dd></div>
                      <div><dt><a href={`?chain=${c}&funder=outside&state=settled#jobs`}>Outside jobs completed</a></dt><dd>{t.outside.settled}</dd></div>
                      <div><dt><a href={`?chain=${c}&funder=outside&checked=1#jobs`}>Checks agreeing, outside jobs</a></dt><dd>{decided ? `${t.outside.checksAgreed} of ${decided}` : '0'}</dd></div>
                      <div data-quiet=""><dt><a href={`?chain=${c}&funder=team#jobs`}>Team jobs (shown, not counted)</a></dt><dd>{t.team.jobs}</dd></div>
                    </dl>
                  </div>
                )
              })}
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
