'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IFACES } from './market-model'
import { CLEARED_FILTERS, type MarketState } from './market-url'
import styles from './register.module.css'

/**
 * Faceted filtering without surrendering 300px of marketplace to a permanent
 * sidebar. One button opens an anchored panel on desktop and a sheet on a
 * phone; the facets inside are exactly the ones the API already supports, and
 * nothing here invents a dimension the backend cannot answer.
 *
 * The sheet is portalled to <body> because the toolbar above it is sticky and
 * owns a stacking context — a fixed sheet rendered inside it would sit under
 * the site header instead of over the page.
 */

const TOGGLES: Array<{ key: keyof MarketState; group: string; label: string; hint: string }> = [
  { key: 'liveNow', group: 'Availability', label: 'Live now', hint: 'Answered Marque’s most recent probe.' },
  { key: 'warranted', group: 'Qualification', label: 'Qualified', hint: 'Passed the published conformance test for its category.' },
  { key: 'thirdParty', group: 'Provider', label: 'Third-party only', hint: 'Hide the reference agents Marque operates.' },
  { key: 'hasPrice', group: 'Commerce', label: 'Price listed', hint: 'The provider advertises a price.' },
]

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return narrow
}

function Facets({
  state,
  patch,
  activeCount,
}: {
  state: MarketState
  patch: (p: Partial<MarketState>) => void
  activeCount: number
}) {
  return (
    <>
      {TOGGLES.map((t) => (
        <div key={String(t.key)} className={styles.facet}>
          <span className={styles.facetGroup}>{t.group}</span>
          <button
            type="button"
            className={styles.facetToggle}
            aria-pressed={state[t.key] as boolean}
            onClick={() => patch({ [t.key]: !state[t.key] } as Partial<MarketState>)}
          >
            <span className={styles.facetBox} aria-hidden="true">
              <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
                <path d="M1.5 6.2 4.4 9 10.5 2.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.facetLabel}>
              {t.label}
              <span className={styles.facetHint}>{t.hint}</span>
            </span>
          </button>
        </div>
      ))}

      <div className={styles.facet}>
        <span className={styles.facetGroup} id="iface-group">Interface</span>
        <div className={styles.ifaceRow} role="radiogroup" aria-labelledby="iface-group">
          {IFACES.map((i) => (
            <button
              key={i.label}
              type="button"
              role="radio"
              aria-checked={state.iface === i.value}
              className={`${styles.ifaceOpt} ${state.iface === i.value ? styles.ifaceOptOn : ''}`}
              onClick={() => patch({ iface: i.value })}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.facetFoot}>
        <button
          type="button"
          className={styles.facetClear}
          disabled={activeCount === 0}
          onClick={() => patch(CLEARED_FILTERS)}
        >
          Clear all filters
        </button>
      </div>
    </>
  )
}

export function MarketFilters({
  state,
  patch,
  activeCount,
}: {
  state: MarketState
  patch: (p: Partial<MarketState>) => void
  activeCount: number
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const narrow = useIsNarrow()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => setMounted(true), [])

  // Escape always closes; an outside click closes the desktop popover (the
  // sheet has its own scrim).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (narrow) return
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, narrow])

  // Closing the sheet on a resize to desktop avoids a stranded scrim.
  useEffect(() => {
    if (!open) return
    const prev = narrow ? document.body.style.overflow : null
    if (narrow) document.body.style.overflow = 'hidden'
    return () => {
      if (prev !== null) document.body.style.overflow = prev
    }
  }, [open, narrow])

  const trigger = (
    <button
      ref={btnRef}
      type="button"
      className={`${styles.toolBtn} ${activeCount > 0 ? styles.toolBtnOn : ''}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => setOpen((v) => !v)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M2 4h12M4.5 8h7M7 12h2" />
      </svg>
      Filters
      {activeCount > 0 && <span className={styles.toolCount}>{activeCount}</span>}
    </button>
  )

  const facets = <Facets state={state} patch={patch} activeCount={activeCount} />

  return (
    <div ref={wrapRef} className={styles.filtersWrap}>
      {trigger}

      {/* Desktop: an anchored popover inside the toolbar. */}
      {!narrow && open && (
        <div ref={panelRef} className={styles.filterPop} role="dialog" aria-label="Filters">
          {facets}
        </div>
      )}

      {/* Phone: a sheet over the page, portalled out of the sticky toolbar. */}
      {narrow && mounted && open &&
        createPortal(
          <>
            <div className={styles.sheetScrim} onClick={close} aria-hidden="true" />
            <div ref={panelRef} className={styles.sheet} role="dialog" aria-modal="true" aria-label="Filters">
              <div className={styles.sheetHead}>
                <span className={styles.sheetTitle}>Filters</span>
                <button type="button" className={styles.sheetClose} onClick={close} aria-label="Close filters">
                  ×
                </button>
              </div>
              <div className={styles.sheetBody}>{facets}</div>
              <div className={styles.sheetFoot}>
                <button type="button" className={styles.sheetApply} onClick={close}>
                  Show results
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
