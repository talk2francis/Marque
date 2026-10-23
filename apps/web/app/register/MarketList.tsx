'use client'

import type { KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
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
import { hireHref, isHireable, profileHref, type MarketRow } from './market-model'
import styles from './register.module.css'

/**
 * The default view, and the one a judge should be given.
 *
 * A list lets qualification, availability, latency and price line up in the
 * same column down the page, which is the only arrangement in which they can
 * actually be compared. The column headings exist so a first-time reader knows
 * what 82 ms and 0.15 U are before they have to guess.
 *
 * `.rowStatus` is `display: contents` on wide screens so its three cells become
 * real columns of the row grid, and a flex strip once the row has to stack.
 */
export function MarketList({
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
  // Keyboard (SPEC-WORKSPACE 3.4): arrow keys move between rows, Enter opens the agent, h hires.
  const router = useRouter()
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row]')
    if (!row || e.target !== row || e.metaKey || e.ctrlKey || e.altKey) return
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-row]')]
    const i = all.indexOf(row)
    const a = rows[i]
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus() }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); all[e.key === 'Home' ? 0 : all.length - 1]?.focus() }
    else if (e.key === 'Enter' && a) { const href = profileHref(a); if (href) { e.preventDefault(); router.push(href) } }
    else if ((e.key === 'h' || e.key === 'H') && a && isHireable(a)) { e.preventDefault(); router.push(hireHref(a), { scroll: false }) }
  }
  return (
    <div className={styles.list} onKeyDown={onKey}>
      <div className={styles.listHead} aria-hidden="true">
        <span />
        <span />
        <span>Agent</span>
        <span>Proof</span>
        <span>Availability</span>
        <span>Price</span>
        <span />
      </div>

      {rows.map((a) => {
        const picked = selectedIds.has(a.agentId)
        const linked = profileHref(a) !== null
        return (
          <article
            key={a.agentId}
            data-agent={a.agentId}
            data-row=""
            tabIndex={0}
            aria-label={`${a.name}. Enter opens it${isHireable(a) ? ', H hires it' : ''}.`}
            className={styles.row}
            data-picked={picked || undefined}
            data-linked={linked || undefined}
          >
            <span className={styles.rowSel}>
              <CompareToggle a={a} picked={picked} atLimit={atLimit} onToggle={onToggle} />
            </span>

            <span className={styles.rowThumb}>
              <AgentThumb a={a} size={44} />
            </span>

            <div className={styles.rowIdent}>
              <span className={styles.identTop}>
                <AgentName a={a} />
                {a.isReference && (
                  <span className={styles.identRef}>
                    <ReferenceTag />
                  </span>
                )}
              </span>
              <AgentBlurb a={a} />
              <AgentMeta a={a} />
            </div>

            <div className={styles.rowStatus}>
              <span className={styles.cellQual}><QualCell a={a} /></span>
              <span className={styles.cellLive}><LiveCell a={a} /></span>
              <span className={styles.cellPrice}><PriceCell a={a} /></span>
            </div>

            <div className={styles.rowAct}>
              <RowActions a={a} />
            </div>
          </article>
        )
      })}
    </div>
  )
}
