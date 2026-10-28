'use client'
import { STAGE_LABEL, type MarketStageKey } from './market-url'
import styles from './register.module.css'

/**
 * The evidence ladder (28 Oct): how far the listed agents have proved themselves, one rung at a time, on the same
 * network, category and search as the list. Every number is the count of agents its rung opens (the All listed view
 * with that stage), so breadth and proof sit on one line and neither is mistaken for the other.
 */
export interface LadderCounts { listed: number; answering: number; priced: number; passed: number; delivered: number; registered?: number | null }

const RUNGS: Array<{ stage: MarketStageKey | null; key: keyof LadderCounts; label: string; note: string }> = [
  { stage: null, key: 'listed', label: 'Listed', note: 'In a category, and answered at its endpoint in the last 24 hours or holds a test result.' },
  { stage: 'answering', key: 'answering', label: STAGE_LABEL.answering, note: 'Marque called it in the last 24 hours and it answered a task.' },
  { stage: 'priced', key: 'priced', label: STAGE_LABEL.priced, note: 'A live signed price: a wallet can pay it into escrow now.' },
  { stage: 'passed', key: 'passed', label: STAGE_LABEL.passed, note: "Passed its category's published Marque test, with the result kept." },
  { stage: 'delivered', key: 'delivered', label: STAGE_LABEL.delivered, note: "Delivered a paid job to a wallet that is not Marque's team, the agent's owner or its own wallet. It does not prove the buyer is unrelated." },
]

export function EvidenceLadder({ counts, active, onPick, network }: { counts: LadderCounts | null; active: MarketStageKey | null | 'listed'; onPick: (stage: MarketStageKey | null) => void; network: string }) {
  const n = (v: number | null | undefined) => (typeof v === 'number' ? v.toLocaleString('en-US') : '…')
  return (
    <section className={styles.ladder} aria-label="Evidence ladder">
      <p className={styles.ladderHead}>
        <span className={styles.ladderTitle}>From listed to proven</span>
        {counts?.registered ? <span className={styles.ladderContext}>of {n(counts.registered)} agents registered on {network}</span> : null}
      </p>
      <ol className={styles.ladderRungs}>
        {RUNGS.map((r) => {
          const on = active === 'listed' ? r.stage === null : active === r.stage && r.stage !== null
          return (
            <li key={r.key}>
              <button type="button" className={styles.rung} aria-pressed={on} data-on={on || undefined} onClick={() => onPick(r.stage)} title={r.note}>
                <span className={styles.rungMark} aria-hidden="true" />
                <span className={styles.rungCount}>{n(counts?.[r.key] as number | undefined)}</span>
                <span className={styles.rungLabel}>{r.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {active ? <p className={styles.ladderNote}>{RUNGS.find((r) => (active === 'listed' ? r.stage === null : r.stage === active))?.note}</p> : null}
    </section>
  )
}
