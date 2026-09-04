import type { ReactNode } from 'react'

/**
 * The Tape — a slow horizontal ticker of REAL settled events.
 *
 * AGENTS.md is unambiguous: every item is a real event and clicks through to
 * its receipt. If there are none, the Tape does not render. A ticker of
 * invented activity is the single most dishonest thing a marketplace can ship,
 * and it is exactly what an empty marketplace is tempted to do.
 */

export interface TapeEvent {
  id: string
  /** What happened, in plain words. */
  text: string
  /** Where the evidence lives. */
  href?: string
  /** ISO 8601. */
  at: string
}

export function Tape({ events }: { events: readonly TapeEvent[] }) {
  // No events, no Tape. Not a placeholder, not a skeleton — absent.
  if (events.length === 0) return null

  const items: ReactNode[] = events.map((e) => (
    <span className="tape__item" key={e.id}>
      {e.href ? <a href={e.href}>{e.text}</a> : e.text}
    </span>
  ))

  return (
    <div className="tape" aria-label="Recent settled activity">
      {/* Duplicated once so the marquee can loop without a visible seam. */}
      <div className="tape__track">
        {items}
        <span aria-hidden="true" style={{ display: 'contents' }}>{items}</span>
      </div>
    </div>
  )
}
