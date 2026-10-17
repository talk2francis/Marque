'use client'
import type { SellerProjection } from '../../lib/seller'
import styles from './checklist.module.css'

export function SellerSummary({ seller }: { seller: SellerProjection }) {
  const q = seller.qualification
  return <section className={`${styles.done} ${styles.seller}`} aria-label="Seller status">
    <h3 className={styles.cardTitle}>Seller status</h3>
    <p className={styles.muted}>BSC {seller.chainId === 56 ? 'mainnet' : 'testnet'} · Observed {seller.observedAt} · Current registry proof {seller.identity.current ? `at block ${seller.identity.blockNumber}` : 'unavailable'}. Human independence unknown.</p>
    <dl className={styles.qualifications}>
      <div><dt>Listing</dt><dd>{q.ownerListed ? 'Owner-listed' : 'Owner listing not established'}</dd></div>
      <div><dt>Local quality checks</dt><dd>{q.qualityListed ? 'Five checks passed' : 'Not established'}</dd></div>
      <div><dt>Warrant</dt><dd>Exact-service binding unverified</dd></div>
      <div><dt>Can buyers hire?</dt><dd>Check the dated quote and next step for each service below</dd></div>
      <div><dt>Campaign</dt><dd>Four categories are the local stretch. Official qualification needs BNB review.</dd></div>
    </dl>
    {seller.services.length === 0 ? <p className={styles.reason}>No indexed service yet. Publish the current endpoint in ERC-8004 metadata and wait for indexing; owner listing alone does not create a payable adapter.</p> : null}
    {seller.services.map(s => <div key={s.serviceId}>
      <p className={styles.checkLabel}>Service {s.serviceId} · {s.kind.toUpperCase()}</p>
      <p className={styles.reason}>{s.endpoint}</p>
      <p className={styles.muted}>Discovery: {s.probe.liveness} at {s.probe.observedAt ?? 'unknown time'}. Last good {s.probe.lastGoodAt ?? 'unknown'}, last bad {s.probe.lastBadAt ?? 'unknown'} within the last 100 scheduled samples. Latest price sample: {s.quote.state.replaceAll('_',' ').toLowerCase()} · {s.quote.mode.replaceAll('_',' ').toLowerCase()} at {s.quote.observedAt ?? 'unknown time'}; expiry {s.quote.expiresAt ?? 'unknown'}.</p>
      <p className={styles.reason}>{s.quote.nextStep}</p>
    </div>)}
    {seller.servicesTruncated ? <p className={styles.note}>Only the first 16 indexed services are shown.</p> : null}
    <p className={styles.muted}>Job cohort: {seller.window.since} to {seller.window.until}. {seller.jobs.scope}</p>
    <p className={styles.reason}>Received {seller.jobs.received} · Funded {seller.jobs.funded} · Submitted {seller.jobs.submitted} · Completed {seller.jobs.completed} · Payment released {seller.jobs.paid} · Refunded {seller.jobs.refunded}.</p>
    <p className={styles.muted}>Latest indexed job block: {seller.jobs.lastIndexedJobBlock ?? 'unknown'}. Current head lag: unknown. Discovery samples do not establish continuous uptime.</p>
    {seller.jobs.fundingMismatch > 0 ? <p className={styles.fix}>Funding mismatch in {seller.jobs.fundingMismatch} cohort jobs. Compare the original quote token, amount and provider with chain events before retrying. Do not fund again automatically.</p> : null}
    {seller.earnings.length ? seller.earnings.map(e => <p className={styles.reason} key={`${e.token}:${e.kind}`}>{e.kind === 'PAYMENT_RELEASED' ? 'Earned, indexed payment release' : 'Returned to buyer'}: {e.amountRaw} raw units of {e.token} on chain {e.chainId}, across {e.jobs} cohort jobs. Token decimals and valuation unverified.</p>) : <p className={styles.reason}>No attributable payment-release or refund amount in this indexed cohort. Funding is not earnings.</p>}
    {seller.diagnostics ? <>
      <p className={styles.checkLabel}>Owner diagnostics</p>
      <p className={styles.muted}>{seller.diagnostics.scope}</p>
      <p className={styles.reason}>Exact-task quote attempts {seller.diagnostics.quotes.attempted} · Accepted {seller.diagnostics.quotes.accepted} · Rejected {seller.diagnostics.quotes.rejected} · Provider-signed {seller.diagnostics.quotes.providerSigned} · Identity-matched unsigned {seller.diagnostics.quotes.identityMatchedUnsigned} · Signature unknown {seller.diagnostics.quotes.signatureUnknown}.</p>
      <p className={styles.reason}>Quote conversion: {seller.diagnostics.conversion.fundedQuotes} funded out of {seller.diagnostics.conversion.acceptedQuotes} accepted user quotes in this window.</p>
      <p className={styles.muted}>Notification acceptance {seller.diagnostics.notification.accepted} · Rejected {seller.diagnostics.notification.rejected} · Pending or unknown {seller.diagnostics.notification.pendingOrUnknown}. {seller.diagnostics.notification.scope}</p>
      {seller.diagnostics.failures.map(f => <p className={styles.fix} key={f.code}>{f.count} {f.code}: {f.nextStep}</p>)}
    </> : <p className={styles.note}>Private quote failures and conversion require a fresh owner proof. Task contents, buyer addresses and operational response bodies are never included.</p>}
  </section>
}
