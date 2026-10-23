'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IFACES } from './market-model'
import { CLEARED_FILTERS, type MarketState } from './market-url'
import type { MarketFacetCounts } from './initial'
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

const TOGGLES: Array<{ key: keyof MarketState; group: string; label: string; hint: string; off?: keyof MarketState }> = [
  { key: 'warranted', group: 'Marque test', label: 'Test passes only', hint: 'A recorded category test pass. Exact-service binding and current code provenance may be unavailable.' },
  { key: 'liveNow', group: 'Availability', label: 'Live now', hint: 'Answered Marque’s most recent probe.' },
  { key: 'thirdParty', group: 'Provider', label: 'Third-party only', hint: 'Hide the reference agents Marque operates.', off: 'firstParty' },
  { key: 'firstParty', group: 'Provider', label: 'Marque reference only', hint: 'Only the agents Marque runs, one or two per category.', off: 'thirdParty' },
  { key: 'hasPrice', group: 'Commerce', label: 'Price listed', hint: 'A live quote or a declared price.' },
]

/** One row of mutually exclusive options, the same control the interface facet uses. */
function Choice<T extends string | number | null>({ id, group, value, options, onPick }: {
  id: string; group: string; value: T; options: Array<{ value: T; label: string; count?: number | null; disabledReason?: string | null }>; onPick: (v: T) => void
}) {
  return (
    <div className={styles.facet}>
      <span className={styles.facetGroup} id={id}>{group}</span>
      <div className={styles.ifaceRow} role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`${styles.ifaceOpt} ${value === o.value ? styles.ifaceOptOn : ''}`}
            // A zero option stays visible with its reason; it never leads to an unexplained empty list (D6).
            disabled={Boolean(o.disabledReason) && value !== o.value}
            title={o.disabledReason ?? undefined}
            onClick={() => onPick(o.value)}
          >
            {o.label}
            {typeof o.count === 'number' ? <span className={styles.optCount}>{o.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
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
  facets,
}: {
  state: MarketState
  patch: (p: Partial<MarketState>) => void
  activeCount: number
  facets: MarketFacetCounts | null
}) {
  const zero = (n: number | undefined, why: string) => (facets && n === 0 ? why : null)
  return (
    <>
      {TOGGLES.map((t) => (
        <div key={String(t.key)} className={styles.facet}>
          <span className={styles.facetGroup}>{t.group}</span>
          <button
            type="button"
            className={styles.facetToggle}
            aria-pressed={state[t.key] as boolean}
            onClick={() => patch({ [t.key]: !state[t.key], ...(t.off && !state[t.key] ? { [t.off]: false } : {}) } as Partial<MarketState>)}
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

      {/* Network is not a filter: the lane switch above the tabs chooses mainnet or practice (invariant 32). */}
      <Choice id="token-group" group="Paid in" value={state.token}
        options={[{ value: null, label: 'Any' }, ...(['U', 'USDT', 'USDC'] as const).map((t) => ({
          value: t, label: t, count: facets?.token[t.toLowerCase()] ?? null,
          disabledReason: zero(facets?.token[t.toLowerCase()], `No agent in this view quotes in ${t} right now.`),
        }))]}
        onPick={(v) => patch({ token: v })} />
      <Choice id="rating-group" group="Verified rating" value={state.minRating}
        options={[{ value: null, label: 'Any' }, { value: 3, label: '3+' }, { value: 4, label: '4+' }, { value: 4.5, label: '4.5+' }]}
        onPick={(v) => patch({ minRating: v })} />
      <div className={styles.facet}>
        <label className={styles.facetGroup} htmlFor="max-price">Max price per job</label>
        <input
          id="max-price"
          className={styles.priceInput}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="Any"
          value={state.maxPrice ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim()
            patch({ maxPrice: v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v) })
          }}
        />
        <span className={styles.facetHint}>Live quotes only, in the quote&apos;s own token.</span>
      </div>

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
  facets,
}: {
  state: MarketState
  patch: (p: Partial<MarketState>) => void
  activeCount: number
  facets: MarketFacetCounts | null
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const narrow = useIsNarrow()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  // Collision-aware placement (D5): right-aligned to the trigger, clamped inside the viewport
  // with 16 px margins, opened above when there is more room there, and scrolled internally.
  const [place, setPlace] = useState<{ left: number; width: number; maxHeight: number; above: boolean } | null>(null)
  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const r = wrap.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const M = 16
    const width = Math.min(640, vw - 2 * M)
    let left = r.right - width
    if (left < M) left = r.left
    left = Math.max(M, Math.min(left, vw - M - width))
    const header = document.querySelector<HTMLElement>('.site-header')?.getBoundingClientRect().bottom ?? 0
    const below = vh - r.bottom - 8 - M
    const aboveRoom = r.top - 8 - Math.max(M, header + 8)
    const above = below < 360 && aboveRoom > below
    setPlace({ left: left - r.left, width, maxHeight: Math.max(220, Math.floor(above ? aboveRoom : below)), above })
  }, [])
  useLayoutEffect(() => {
    if (!open || narrow) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure) }
  }, [open, narrow, measure])

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
      onClick={() => {
        if (!open && !narrow) {
          // Give the panel room below: bring the sticky toolbar up under the header first,
          // so the results stay in view behind it. Placement still flips if room is short.
          const r = wrapRef.current?.getBoundingClientRect()
          const header = document.querySelector<HTMLElement>('.site-header')?.getBoundingClientRect().bottom ?? 0
          if (r && window.innerHeight - r.bottom < 420 && r.top - header > 24) {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            window.scrollBy({ top: r.top - header - 12, behavior: reduce ? 'auto' : 'smooth' })
          }
        }
        setOpen((v) => !v)
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M2 4h12M4.5 8h7M7 12h2" />
      </svg>
      Filters
      {activeCount > 0 && <span className={styles.toolCount}>{activeCount}</span>}
    </button>
  )

  const facetsEl = <Facets state={state} patch={patch} activeCount={activeCount} facets={facets} />

  return (
    <div ref={wrapRef} className={styles.filtersWrap}>
      {trigger}

      {/* Desktop: an anchored popover inside the toolbar. */}
      {!narrow && open && (
        <div
          ref={panelRef}
          className={styles.filterPop}
          role="dialog"
          aria-label="Filters"
          data-above={place?.above || undefined}
          style={place ? { left: place.left, width: place.width, maxHeight: place.maxHeight } : { visibility: 'hidden' }}
        >
          {facetsEl}
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
              <div className={styles.sheetBody}>{facetsEl}</div>
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
