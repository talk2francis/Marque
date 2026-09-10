import { ProvenanceChip } from '@marque/ui'
import styles from './ledger.module.css'

/**
 * Proof the human arm was actually run — a recording, not a claim.
 *
 * Each ADV benchmark has a screen recording of the analyst doing the task by
 * hand: reading the contract on BscScan, querying pool state, working the
 * health factor. The old UI put this behind a bare "Screen recording" text
 * link that a judge would skim past. This shows the frame.
 */

interface Recording {
  videoId: string
  /** What is on screen, so the thumbnail is legible at a glance. */
  caption: string
}

const RECORDINGS: Record<string, Recording> = {
  'ADV-01': {
    videoId: 'pt0EkL6wY6A',
    caption: 'The analyst on BscScan, reading the BEP-20 USDT contract source — the exact token the task names — line by line for upgrade, mint, pause and blacklist powers.',
  },
  'ADV-02': {
    videoId: '0xT6JBNv1zQ',
    caption: 'The analyst querying PancakeSwap V3 pool state by hand — getPool, slot0, tickSpacing — pinned to the benchmark block with a cast call.',
  },
  'ADV-03': {
    videoId: 'eWAAFVw9Hs0',
    caption: 'The analyst pulling Venus supply rates — supplyRatePerBlock, venusSupplySpeeds — against the Comptroller at the pinned block, to price the route by hand.',
  },
  'ADV-04': {
    videoId: 'UKWhdf4GwO8',
    caption: 'The analyst reading Venus Comptroller and vToken state at the pinned block, computing the exact repayment to restore the health factor.',
  },
}

export function humanArmVideo(id: string): string | null {
  const r = RECORDINGS[id]
  return r ? `https://youtu.be/${r.videoId}` : null
}

export function HumanArmEvidence({ id, compact = false }: { id: string; compact?: boolean }) {
  const r = RECORDINGS[id]
  if (!r) return null
  const href = `https://youtu.be/${r.videoId}`
  const thumb = `/evidence/${id.toLowerCase()}.jpg`

  if (compact) {
    return (
      <a className={styles.evThumbCompact} href={href} rel="noreferrer noopener" target="_blank">
        <img src={thumb} alt={`Screen recording of the human analyst running ${id}`} loading="lazy" width={160} height={90} />
        <span className={styles.evPlay} aria-hidden="true" />
        <span className={styles.evThumbLabel}>Watch the analyst run {id} ↗</span>
      </a>
    )
  }

  return (
    <figure className={styles.evCard}>
      <a className={styles.evThumb} href={href} rel="noreferrer noopener" target="_blank">
        <img src={thumb} alt={`Screen recording of the human analyst running ${id} by hand`} loading="lazy" width={480} height={270} />
        <span className={styles.evPlay} aria-hidden="true" />
      </a>
      <figcaption className={styles.evCaption}>
        <span className={styles.evHead}>
          Watch the human arm — {id} <ProvenanceChip provenance="MEASURED" />
        </span>
        <span className={styles.evBody}>{r.caption}</span>
        <a className={styles.evLink} href={href} rel="noreferrer noopener" target="_blank">
          Full recording on YouTube ↗
        </a>
      </figcaption>
    </figure>
  )
}
