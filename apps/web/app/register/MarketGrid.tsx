'use client'

import {
  AgentBlurb,
  AgentMeta,
  AgentName,
  AgentThumb,
  CompareToggle,
  LiveCell,
  PriceCell,
  QualCell,
  ReferenceTag,
  RowActions,
} from './MarketCells'
import { profileHref, type MarketRow } from './market-model'
import styles from './register.module.css'

/**
 * The optional browse view. Same rows, same facts, different arrangement.
 *
 * A card answers four questions in order — what is it, does it work, what does
 * it cost, what can I do next — and pushes the registry plumbing (owner, token
 * id, protocol list) to the quietest line rather than dropping it, so switching
 * view never costs a reader evidence.
 */
export function MarketGrid({
  rows,
  selectedIds,
  atLimit,
  onToggle,
}: {
  rows: MarketRow[]
  selectedIds: Set<string>
  atLimit: boolean
  onToggle: (a: MarketRow) => void
}) {
  return (
    <div className={styles.grid}>
      {rows.map((a) => {
        const picked = selectedIds.has(a.agentId)
        const linked = profileHref(a) !== null
        return (
          <article
            key={a.agentId}
            data-agent={a.agentId}
            className={styles.card}
            data-picked={picked || undefined}
            data-linked={linked || undefined}
          >
            <header className={styles.cardHead}>
              <AgentThumb a={a} size={40} />
              <div className={styles.cardTitle}>
                <span className={styles.identTop}>
                  <AgentName a={a} />
                </span>
                {a.isReference && (
                  <span className={styles.identRef}>
                    <ReferenceTag />
                  </span>
                )}
              </div>
              <span className={styles.cardSel}>
                <CompareToggle a={a} picked={picked} atLimit={atLimit} onToggle={onToggle} />
              </span>
            </header>

            <div className={styles.cardBlurb}>
              <AgentBlurb a={a} />
            </div>

            <div className={styles.cardEvidence}>
              <QualCell a={a} compact />
              <div className={styles.cardFacts}>
                <LiveCell a={a} />
                <PriceCell a={a} />
              </div>
            </div>

            <div className={styles.cardMeta}>
              <AgentMeta a={a} limit={2} />
            </div>

            <footer className={styles.cardAct}>
              <RowActions a={a} />
            </footer>
          </article>
        )
      })}
    </div>
  )
}
