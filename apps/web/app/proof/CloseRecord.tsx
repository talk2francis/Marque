import { ProvenanceChip } from '@marque/ui'
import { CLOSE_RECORD, CLOSE_FILES, closeFileUrl } from '../../lib/close-record'
import styles from './close-record.module.css'

export function CloseRecord() {
  const { figures: f, anchor: a } = CLOSE_RECORD
  return <section id="record-at-close" className={styles.section} aria-labelledby="close-heading">
    <div className={styles.head}><h2 id="close-heading">The record at the close</h2><ProvenanceChip provenance="MEASURED" /></div>
    <p>Set and Earn: 1 October 2026, 12:00 UTC to 5 November 2026, 12:00 UTC. The close is tagged <code>set-and-earn-close-2026-11-05</code>. These are the figures Francis read at <time dateTime={f.readAt}>5 November, 12:00:24 UTC</time>, preserved with their later API snapshot.</p>
    <dl className={styles.figures}>{f.figures.map(row => <div key={row.what}><dt>{row.what}</dt><dd>{typeof row.value === 'number' ? row.value.toLocaleString('en-US') : row.value}</dd></div>)}</dl>
    <p>Two jobs created before the close, 57188 and 57189, were indexed after that first read. The later preserved <a href={closeFileUrl('proof.json')}>job snapshot</a> contains 50 outside mainnet jobs, 46 delivered. The original 48/45 read is kept above. Job states can still change after the close; this preserved set of jobs does not.</p>
    <div className={styles.anchor}>
      <ProvenanceChip provenance="ONCHAIN" />
      <p>Anchored on BSC testnet, chain 97, at block {a.blockNumber}: <a href={`https://testnet.bscscan.com/tx/${a.transactionHash}`}>transaction {a.transactionHash.slice(0, 12)}…{a.transactionHash.slice(-6)}</a>, <time dateTime={a.anchoredAt}>{a.anchoredAt.replace('T', ' ').slice(0, 19)} UTC</time>.</p>
      <p>Keccak-256 of the original checksum manifest: <code className={styles.hash}>{a.checksumFileKeccak256}</code></p>
      <p>The anchor proves that these checksum bytes existed by that testnet block. It does not prove the figures are true or that BNB Chain accepts them. No mainnet anchor has been submitted.</p>
    </div>
    <details className={styles.files}><summary>Download and verify the preserved record</summary>
      <p>Download the files with their folder names intact, run <code>sha256sum -c SHA256SUMS</code>, then compute Keccak-256 of the exact <code>SHA256SUMS</code> bytes, including its final newline, and compare with the digest above and the transaction&apos;s Anchored event. The repository&apos;s <code>node scripts/verify-close-record.mjs</code> performs both checks without a wallet.</p>
      <ul>{CLOSE_FILES.map(file => <li key={file}><a href={closeFileUrl(file)} download>{file}</a></li>)}</ul>
    </details>
  </section>
}
